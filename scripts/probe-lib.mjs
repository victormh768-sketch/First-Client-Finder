// Medición de calidad de las fuentes. Cada cifra sale de datos obtenidos de la fuente; si no hay red,
// el resultado es 'sin_red' y NO se inventa ninguna cifra.
import { runSource } from '../supabase/functions/_shared/ingest/pipeline.js';
import { daysBetween } from '../supabase/functions/_shared/ingest/text.js';
import { getSource } from '../supabase/functions/_shared/ingest/registry.js';
import { redact, renderMarkdown, renderReviewFiles, renderStepSummary } from './probe-report.mjs';
import { createPoliteFetch, guardDecision, DEFAULT_LINK_CAP } from './probe-http.mjs';

export { renderMarkdown, renderReviewFiles, renderStepSummary, redact };

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const countBy = (a) => a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

// Criterios (explícitos para que se puedan discutir):
//  relevante  = tipo freelance o proyecto puntual, vigente, no duplicada, enlace no caído y SIN señales de fraude altas.
//  apta para principiantes = beginner.level === 'apta' (experiencia escrita como none/junior + otra señal explícita, sin bloqueos).
//  posible = experiencia no indicada pero ≥2 señales explícitas; NO se cuenta como apta.
export const isRelevant = (o) => ['freelance', 'one_off'].includes(o.opportunityType) && o.quality?.fraud?.level !== 'high';
export const isBeginner = (o) => o.beginner?.level === 'apta';
export const isPossible = (o) => o.beginner?.level === 'posible';
const hasFlag = (o, c) => (o.quality?.flags || []).some((f) => f.code === c);

export function classifyError(e) {
  if (e?.code === 'STALE_SOURCE') return 'sin_datos_vigentes';
  const code = e?.cause?.code || e?.code || '';
  const msg = String(e?.message || e);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET|UND_ERR|fetch failed|network|timed out|aborted/i.test(code + ' ' + msg)) return 'sin_red';
  const m = msg.match(/respondi[oó] (\d{3})/);
  if (m) return `http_${m[1]}`;
  return 'error';
}

export function summarize(decisions, stats, now = new Date()) {
  const enriched = decisions.filter((d) => d.o).map((d) => d.o);
  const imported = decisions.filter((d) => d.decision === 'imported').map((d) => d.o);
  const rel = imported.filter(isRelevant);
  const ages = rel.map((o) => (o.postedAt ? daysBetween(o.postedAt, now) : null)).filter((x) => x != null);
  const meta = stats.sourceMeta || null;
  const total = meta?.totalBeforeFilter ?? stats.fetched;
  const byType = countBy(enriched.map((o) => o.opportunityType));
  return {
    total,                                   // todo lo que devolvió la fuente
    obtained: stats.fetched,                 // lo que llegó al clasificador (algunos adaptadores filtran antes por tipo de contrato)
    droppedBySourceType: total - stats.fetched, // descartado por la etiqueta de la propia fuente (p. ej. full_time) sin clasificar
    sourceMeta: meta,
    byType,
    freelance: byType.freelance || 0,
    oneOff: byType.one_off || 0,
    jobs: byType.job || 0,
    collaboration: byType.collaboration || 0,
    notRelevant: byType.not_relevant || 0,
    decisions: countBy(decisions.map((d) => d.decision)),
    relevant: rel.length,
    beginner: rel.filter(isBeginner).length,
    possible: rel.filter(isPossible).length,
    quality: {
      expired: stats.expired || 0,
      linkBroken: stats.linkGone || 0,
      duplicates: stats.duplicates || 0,
      noBudget: rel.filter((o) => hasFlag(o, 'no_budget')).length,
      insufficientInfo: rel.filter((o) => hasFlag(o, 'insufficient_info')).length,
      noDate: rel.filter((o) => hasFlag(o, 'no_date')).length,
      fraudPossible: imported.filter((o) => o.quality?.fraud?.level === 'possible').length,
      fraudHigh: imported.filter((o) => o.quality?.fraud?.level === 'high').length,
    },
    withBudget: rel.filter((o) => o.budget).length,
    linkOk: rel.filter((o) => o.verification === 'link_ok').length,
    medianAgeDays: median(ages),
    byCategory: countBy(rel.map((o) => o.category)),
    stats,
  };
}

const enrichedAll = (d) => d.filter((x) => x.o);
const pickSample = (arr, n) => arr.slice(0, n);
// Fila reducida para informes: NO incluye descripción, autor ni cliente; el título se sanea (correos, teléfonos, @usuarios, enlaces).
const row = (o, decision) => ({
  title: redact(o.title), url: o.url, platform: o.platform, postedAt: o.postedAt, decision,
  type: o.opportunityType, typeWhy: o.typeInfo?.why || [], confidence: o.typeInfo?.confidence,
  category: o.category, bf: o.beginner?.score, level: o.beginner?.level, factors: o.beginner?.factors, bfWhy: o.beginner?.why,
  blockers: o.beginner?.blockers, budget: o.budget, verification: o.verification,
  flags: (o.quality?.flags || []).map((f) => f.text), fraud: o.quality?.fraud, qualityLevel: o.quality?.level,
});

/** Ejecuta una fuente y devuelve { id, status, ... }. status: ok | sin_red | http_NNN | error */
export async function probeSource(source, { fetch: f, now = new Date(), sample = 12, checkLinks = true, env = {} } = {}) {
  const started = Date.now();
  try {
    const { stats, decisions } = await runSource({ source, existing: [], now, fetch: f, env, checkLinks, maxItems: 600, collect: true });
    const summary = summarize(decisions, stats, now);
    const all = enrichedAll(decisions).map((d) => row(d.o, d.decision));
    const rel = decisions.filter((d) => d.decision === 'imported' && isRelevant(d.o)).map((d) => d.o);
    const rowOf = new Map(enrichedAll(decisions).map((d, i) => [d.o, all[i]]));
    return {
      id: source.id, name: source.name, status: 'ok', ms: Date.now() - started, summary,
      lists: { all }, // todas las filas clasificadas (para los archivos de revisión)
      samples: {
        relevant: pickSample(rel, sample).map((o) => rowOf.get(o)),
        beginner: pickSample(rel.filter(isBeginner), sample).map((o) => rowOf.get(o)),
        flagged: pickSample(all.filter((r) => (r.fraud?.level && r.fraud.level !== 'none') || r.qualityLevel === 'poor'), sample),
        discardedJob: pickSample(all.filter((r) => r.type === 'job'), sample),
        discardedNotRelevant: pickSample(all.filter((r) => r.type === 'not_relevant'), sample),
      },
    };
  } catch (e) {
    return { id: source.id, name: source.name, status: classifyError(e), error: redact(String(e?.message || e)).slice(0, 300), ms: Date.now() - started };
  }
}


/**
 * Ejecuta el Live Probe completo. No toca ficheros ni red por sí mismo: recibe `fetchImpl` y devuelve los archivos a escribir.
 * @returns {{results, requests, files: Record<string,string>, exitCode: number, annotations: Array<{level:string,title:string,message:string}>}}
 */
export async function runProbe({ ids, fetchImpl = globalThis.fetch, sleep, now = () => Date.now(), startedAt = new Date(), sample = 15, checkLinks = true, linkCap = DEFAULT_LINK_CAP, recent = null } = {}) {
  const f = createPoliteFetch({ fetchImpl, sleep, now, linkCap });
  const notes = [];
  const results = [];
  for (const id of ids) {
    const source = getSource(id);
    if (!source) { results.push({ id, name: id, status: 'error', error: 'Fuente desconocida' }); continue; }
    if (source.legalStatus === 'blocked' || source.legalStatus === 'approval') {
      results.push({ id, name: source.name, status: 'bloqueada', error: `legal_status=${source.legalStatus}: no se consulta sin autorización` });
      continue;
    }
    const g = guardDecision(id, recent);
    if (g.warn) notes.push(g.warn);
    if (g.skip) { results.push({ id, name: source.name, status: 'omitida_por_limite', error: g.reason }); continue; }
    results.push(await probeSource(source, { fetch: f, now: startedAt, sample, checkLinks }));
  }
  const requests = f.requests();
  const opts = { startedAt, checkLinks, requests, notes, linkCap };
  const files = { 'QUALITY_REPORT.md': renderMarkdown(results, opts), ...renderReviewFiles(results) };
  // El JSON guarda las mismas filas reducidas que los informes: sin descripciones, autores ni cabeceras.
  files['live-probe.json'] = JSON.stringify({ startedAt, checkLinks, linkCap, requests, notes, results }, null, 2);
  const failedOnes = results.filter((r) => r.status !== 'ok' && r.status !== 'bloqueada');
  const annotations = failedOnes.map((r) => ({ level: r.status === 'omitida_por_limite' ? 'warning' : 'error', title: `Fuente ${r.name}`, message: `${r.status}${r.error ? ': ' + r.error : ''}` }));
  return { results, requests, notes, files, exitCode: failedOnes.length ? 1 : 0, annotations, stepSummary: renderStepSummary(results, { requests, notes }) };
}

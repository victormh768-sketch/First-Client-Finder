// Pipeline común: RawItem → Opportunity enriquecida. Es independiente de la plataforma y de Supabase.
import { clip, daysBetween, canonicalUrl } from './text.js';
import { classifyIntent } from './intent.js';
import { classifyType, isImportable } from './opptype.js';
import { beginnerFriendly } from './beginner.js';
import { assessQuality, addStatusFlag } from './quality.js';
import { detectCategory, detectSkills, extractBudget } from './extract.js';
import { estimateRequirements, fitScore } from './fit.js';
import { findDuplicate, fingerprint } from './dedupe.js';
import { isExpiredByAge, checkLink } from './expiry.js';
import { buildReasons } from './reasons.js';

/**
 * Formato común de oportunidad (columnas camelCase; la capa de BD las pasa a snake_case):
 * title, description, client, category, budget, skills, postedAt, lastCheckedAt, url, platform,
 * verification, + análisis (intent, estimated, reasons, fit) y huella.
 */
export function enrich(raw, source, now = new Date()) {
  const title = clip(String(raw.title || '').trim(), 160);
  const description = clip(String(raw.description || '').trim(), 4000);
  const text = `${title}\n${description}`;
  const intent = classifyIntent({ title, description, hint: raw.hint, jobType: raw.jobType });
  const { category } = detectCategory(text, raw.rawCategory);
  const skills = detectSkills(text);
  const budget = extractBudget(text);
  const req = estimateRequirements(text, skills.length);
  const o = {
    platform: raw.platform || source.platform,
    sourceId: source.id,
    externalId: String(raw.externalId),
    title, description,
    client: raw.client || null,
    category, skills, budget,
    experience: req.experience, complexity: req.complexity, portfolioRequired: req.portfolioRequired,
    estimated: req.estimated,
    postedAt: raw.postedAt || null,
    lastCheckedAt: now.toISOString(),
    url: raw.url || null,
    jobType: raw.jobType || null,
    intent,
    fingerprint: fingerprint(title, description),
    verification: 'unverified',
    reviewStatus: 'pending',
  };
  const ty = classifyType({ title, description, jobType: raw.jobType, hint: raw.hint }, intent, budget);
  o.opportunityType = ty.type;
  o.typeInfo = ty;
  o.quality = assessQuality(o);
  o.beginner = beginnerFriendly(o);
  o.fit = fitScore(o);
  o.reasons = buildReasons(o, now);
  return o;
}

/**
 * Ejecuta una fuente.
 * @param {{source:object, existing:Array, now?:Date, fetch?:Function, env?:object, checkLinks?:boolean, maxItems?:number}} p
 *   existing: oportunidades ya guardadas ({id, platform, externalId, url, title, description, reviewStatus}).
 * @returns {{rows:Array, refresh:Array, stats:object}}
 *   rows: nuevas (incluye duplicadas con reviewStatus='duplicate' y caducadas con 'expired').
 *   refresh: externalId ya guardados que se vieron de nuevo (para actualizar la última comprobación).
 */
export async function runSource({ source, existing = [], now = new Date(), fetch: f = fetch, env = {}, checkLinks = true, maxItems = 400, collect = false }) {
  const stats = { fetched: 0, imported: 0, duplicates: 0, expired: 0, skipped: { not_request: 0, seeking_work: 0, job: 0, collaboration: 0, invalid: 0 }, linkGone: 0, byType: {} };
  const raws = await source.adapter.fetchItems({ fetch: f, env, config: source.config || {}, now });
  stats.fetched = raws.length;
  if (raws.meta) stats.sourceMeta = raws.meta;

  const known = new Map(existing.filter((e) => e.platform === source.platform).map((e) => [e.externalId, e]));
  const pool = [...existing];
  const rows = [];
  const refresh = [];
  const decisions = []; // solo con collect:true (herramienta de medición); no cambia el comportamiento
  const note = (o, decision, raw) => { if (collect) decisions.push({ decision, o, raw }); };

  for (const raw of raws.slice(0, maxItems)) {
    if (!raw.externalId || !raw.title || (raw.url && !canonicalUrl(raw.url))) { stats.skipped.invalid++; note(null, 'invalid', raw); continue; }
    if (known.has(String(raw.externalId))) { refresh.push(String(raw.externalId)); note(null, 'known', raw); continue; }

    const o = enrich(raw, source, now);
    stats.byType[o.opportunityType] = (stats.byType[o.opportunityType] || 0) + 1;
    if (!isImportable(o.opportunityType)) {
      if (o.intent.kind === 'seeking_work') stats.skipped.seeking_work++;
      else if (o.opportunityType === 'job') stats.skipped.job++;
      else if (o.opportunityType === 'collaboration') stats.skipped.collaboration++;
      else stats.skipped.not_request++;
      note(o, 'skipped:' + o.opportunityType, raw);
      continue;
    }
    if (isExpiredByAge(o.postedAt, source.maxAgeDays, now)) {
      o.reviewStatus = 'expired'; o.verification = 'expired'; addStatusFlag(o, 'expired'); stats.expired++;
      rows.push(o); note(o, 'expired', raw); continue;
    }
    const dup = findDuplicate({ platform: o.platform, externalId: o.externalId, url: o.url, title: o.title, description: o.description }, pool);
    if (dup) {
      addStatusFlag(o, 'duplicate'); o.reviewStatus = 'duplicate'; o.duplicateOf = dup.of; o.duplicateInfo = { reason: dup.reason, similarity: dup.similarity };
      stats.duplicates++; rows.push(o); note(o, 'duplicate', raw); continue;
    }
    if (checkLinks && o.url) {
      const link = await checkLink(o.url, f);
      if (link === 'gone') { o.reviewStatus = 'expired'; o.verification = 'expired'; addStatusFlag(o, 'link_broken'); stats.linkGone++; rows.push(o); note(o, 'link_gone', raw); continue; }
      if (link === 'ok') o.verification = 'link_ok';
    }
    pool.push({ id: `${o.platform}:${o.externalId}`, platform: o.platform, externalId: o.externalId, url: o.url, title: o.title, description: o.description });
    stats.imported++;
    rows.push(o); note(o, 'imported', raw);
  }
  return { rows, refresh, stats, ...(collect ? { decisions } : {}) };
}

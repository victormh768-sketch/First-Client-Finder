// Informes del Live Probe: QUALITY_REPORT.md, archivos de revisión por categoría y CSV.
// SEGURIDAD: aquí solo entran filas ya reducidas (título saneado, enlace público, tipo, puntuaciones, avisos).
// Nunca se escriben descripciones completas, autores, correos, teléfonos, cabeceras ni variables de entorno.

// ───────── saneado de datos personales ─────────
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:t\.me|wa\.me)\/\S+/gi;
const HANDLE = /(^|[\s(])@[a-z0-9_]{3,}/gi;
const PHONE = /(?<![\w.])\+?\d[\d\s().-]{7,}\d(?![\w])/g;

/** Quita correos, teléfonos, @usuarios y enlaces de un texto libre (títulos de publicaciones). */
export function redact(text) {
  return String(text ?? '')
    .replace(EMAIL, '[email]')
    .replace(URL_RE, '[enlace]')
    .replace(HANDLE, '$1[usuario]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[teléfono]' : m));
}

// ───────── utilidades de formato ─────────
export const esc = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
const fmtBudget = (b) => (b ? `${b.min}${b.max !== b.min ? '–' + b.max : ''} ${b.currency}${b.type === 'hourly' ? '/h' : ''}` : '—');
export const TYPE_ES = { freelance: 'Freelance', one_off: 'Proyecto puntual', job: 'Empleo', collaboration: 'Colaboración', not_relevant: 'No relevante' };
const LEVEL_ES = { apta: 'Apta', posible: 'Posible', no_apta: 'No apta' };
const DECISION_ES = { imported: 'pendiente de revisión', expired: 'caducada', duplicate: 'duplicada', link_gone: 'enlace roto' };
const WHY_ES = { direct_request: 'pide contratar de forma directa', bounded_deliverable: 'entregable acotado', ongoing_work: 'trabajo continuo', scope_not_bounded: 'alcance no acotado', job_posting_language: 'lenguaje de oferta de empleo', platform_contract_role: 'etiqueta contract/freelance de un tablón de empleo', offers_own_services: 'ofrece sus propios servicios', partner_or_collaborator_wanted: 'busca socio o colaborador', no_payment_stated: 'sin pago indicado', no_hiring_intent: 'no se detecta intención de contratar' };
const decisionOf = (r) => DECISION_ES[r.decision] || (r.decision?.startsWith('skipped') ? 'no importada' : r.decision);
const whyOf = (r) => (r.typeWhy || []).map((c) => WHY_ES[c] || c).join('; ');
const link = (u) => (u ? `[abrir](${u})` : '—');

const table = (rows) => (rows.length
  ? ['| Título | Tipo | Estado | Cat. | BF | Nivel | Presup. | Publicada | Avisos | Enlace | ¿Útil? (s/n) |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${esc(r.title).slice(0, 90)} | ${TYPE_ES[r.type]} | ${decisionOf(r)} | ${r.category} | ${r.bf} | ${LEVEL_ES[r.level] || '—'} | ${fmtBudget(r.budget)} | ${r.postedAt ? r.postedAt.slice(0, 10) : '—'} | ${(r.flags?.length || 0) + (r.fraud?.signals?.length || 0)} | ${link(r.url)} | |`)].join('\n')
  : '_Sin elementos._');

const reasons = (rows) => rows.map((r, i) => {
  const L = [`**${i + 1}. ${esc(r.title).slice(0, 70)}** — ${TYPE_ES[r.type]} (${whyOf(r)}) · BF ${r.bf}/100 · ${LEVEL_ES[r.level]}`];
  for (const f of r.factors || []) L.push(`   - ${f.label}: ${f.points}/${f.max}${f.basis === 'unknown' ? ' (dato no indicado)' : ''} — ${f.reason}`);
  if (r.bfWhy?.length) L.push(`   - Valoración: ${r.bfWhy.join(' ')}`);
  for (const t of r.flags || []) L.push(`   - Aviso: ${t}`);
  for (const sg of r.fraud?.signals || []) L.push(`   - Posible señal de fraude (${sg.severity}): ${sg.text}`);
  return L.join('\n');
}).join('\n\n');

// ───────── QUALITY_REPORT.md ─────────
const failed = (r) => r.status !== 'ok';
const STATUS_ES = { sin_red: 'sin conexión desde este equipo', bloqueada: 'bloqueada (sin vía autorizada)', omitida_por_limite: 'omitida para respetar el límite de peticiones', error: 'error', ok: 'ok' };
const statusText = (s) => STATUS_ES[s] || (s.startsWith('http_') ? `la fuente respondió HTTP ${s.slice(5)}` : s);

export function renderRequests(requests) {
  const hosts = Object.entries(requests || {});
  if (!hosts.length) return '_No se realizó ninguna petición._';
  return ['| Host | Peticiones | Respuestas por estado | Bloqueadas por el límite propio |', '|---|---|---|---|',
    ...hosts.map(([h, v]) => `| ${h} | ${v.count} | ${Object.entries(v.status).map(([k, n]) => `${k}: ${n}`).join(', ') || '—'} | ${v.limited} |`)].join('\n');
}

export function renderSummaryTable(results) {
  const L = ['| Fuente | Estado | Total | Freelance | Proyectos puntuales | Empleos | Colab. | No relevante | **Relevantes** | **Aptas principiante** | Posibles | Posible fraude |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    if (failed(r)) L.push(`| ${r.name} | **FALLA: ${statusText(r.status)}** | — | — | — | — | — | — | — | — | — | — |`);
    else { const s = r.summary; L.push(`| ${r.name} | ok | ${s.total} | ${s.freelance} | ${s.oneOff} | ${s.jobs}${s.droppedBySourceType ? ` (+${s.droppedBySourceType} descartados por etiqueta de la fuente)` : ''} | ${s.collaboration} | ${s.notRelevant} | **${s.relevant}** | **${s.beginner}** | ${s.possible} | ${s.quality.fraudPossible + s.quality.fraudHigh} |`); }
  }
  return L.join('\n');
}

export function renderMarkdown(results, { startedAt = new Date(), checkLinks = true, requests = null, notes = [], linkCap = null } = {}) {
  const L = [];
  L.push('# QUALITY_REPORT — prueba en vivo de fuentes', '', `Generado: ${startedAt.toISOString()} · comprobación de enlaces: ${checkLinks ? `sí (máx. ${linkCap ?? '—'} por host)` : 'no'}`, '');
  L.push('> Todas las cifras salen de peticiones reales hechas en esta ejecución. Una fuente que falla aparece como **FALLA** y no tiene cifras: nunca se rellenan ni se estiman. Que una fuente responda hoy no garantiza que lo haga mañana.', '');
  const bad = results.filter(failed);
  if (bad.length) {
    L.push('## ⚠ Fuentes que fallan o no se consultaron', '');
    for (const r of bad) L.push(`- **${r.name}** — ${statusText(r.status)}${r.error ? `. Detalle: \`${esc(r.error)}\`` : ''}${r.status === 'sin_red' ? '. No indica que la fuente esté caída: no se pudo comprobar.' : ''}`);
    L.push('');
  }
  for (const n of notes) L.push(`> ${n}`, '');
  L.push('## Resumen', '', renderSummaryTable(results), '');
  if (results.some((r) => !failed(r))) L.push('| Fuente | Caducadas | Enlace roto | Duplicadas | Relevantes sin presupuesto | Info insuficiente | Sin fecha | Enlace OK / relevantes | Posible fraude | Fraude alto |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) if (!failed(r)) { const q = r.summary.quality; L.push(`| ${r.name} | ${q.expired} | ${q.linkBroken} | ${q.duplicates} | ${q.noBudget} | ${q.insufficientInfo} | ${q.noDate} | ${r.summary.linkOk}/${r.summary.relevant} | ${q.fraudPossible} | ${q.fraudHigh} |`); }
  L.push('', '## Peticiones realizadas', '', renderRequests(requests), '');
  L.push('## Cómo leer los tipos y criterios', '');
  L.push('**Tipos.** *Freelance*: alguien necesita contratar un servicio. *Proyecto puntual*: necesidad concreta y acotada. *Empleo*: una empresa busca a un trabajador (nunca cuenta como cliente, aunque la plataforma lo etiquete contract). *Colaboración*: busca socio o colaborador sin pago indicado. *No relevante*: el resto, incluida la gente que ofrece sus servicios.', '');
  L.push('**Criterios.** *Relevante* = freelance o proyecto puntual, vigente, no duplicada, enlace no caído y sin señales de fraude altas. *Apta para principiantes* = la experiencia consta en el texto como «sin experiencia» o junior, hay otra señal explícita a favor (alcance pequeño, presupuesto ≤ 600, sin portfolio) y ningún bloqueo. *Posible* = no indica experiencia pero cumple ≥ 2 señales explícitas; **no se cuenta como apta**. BF = Beginner Friendly Score (0-100); no es una probabilidad de conseguir el trabajo. Los avisos de calidad y fraude son **señales para la revisión humana**, no veredictos; nada se publica sin aprobación.', '');
  L.push('## Dónde revisar', '', 'Carpeta `review/` de este mismo informe: `01-freelance.md`, `02-proyectos-puntuales.md`, `03-empleos-descartados.md`, `04-no-relevantes.md`, `05-aptas-principiantes.md`, `06-posibles-fraudes.md`, `07-colaboracion.md` y `todas.csv` (para valorar en una hoja de cálculo). Cada categoría contiene **todas** las filas encontradas, no solo una muestra.', '');
  for (const r of results) {
    L.push(`## ${r.name}`, '');
    if (failed(r)) { L.push(`**FALLA:** ${statusText(r.status)}${r.error ? ` — \`${esc(r.error)}\`` : ''}`, ''); continue; }
    const s = r.summary;
    L.push(`Tiempo: ${r.ms} ms · mediana de antigüedad de las relevantes: ${s.medianAgeDays ?? '—'} días · con presupuesto escrito: ${s.withBudget}/${s.relevant} · enlace comprobado OK: ${s.linkOk}/${s.relevant}`, '');
    if (s.sourceMeta) L.push('Datos de la propia fuente antes de filtrar: `' + JSON.stringify(s.sourceMeta) + '`', '');
    L.push('Decisiones: `' + JSON.stringify(s.decisions) + '` · categorías de las relevantes: `' + JSON.stringify(s.byCategory) + '`', '');
    L.push('### Aptas para principiantes (muestra)', '', table(r.samples.beginner), '', reasons(r.samples.beginner), '');
    L.push('### Relevantes (muestra)', '', table(r.samples.relevant), '');
    L.push('### Posibles fraudes o calidad baja (muestra)', '', table(r.samples.flagged), '');
    L.push('### Empleos descartados (muestra: revisar la frontera empleo/servicio)', '', table(r.samples.discardedJob), '');
    L.push('### No relevantes (muestra: revisar falsos negativos)', '', table(r.samples.discardedNotRelevant), '');
  }
  L.push('## Valoración humana', '', 'Rellena «¿Útil?» (o la columna `util` de `todas.csv`) y calcula útiles / revisadas. Las cifras automáticas miden el clasificador, no la utilidad real; revisa sobre todo empleos descartados y no relevantes para detectar falsos negativos.', '');
  return L.join('\n');
}

// ───────── archivos de revisión por categoría ─────────
const REVIEW = [
  ['01-freelance.md', 'Oportunidades freelance', 'Alguien necesita contratar un servicio (trabajo continuo o de alcance no acotado).', (r) => r.type === 'freelance', true],
  ['02-proyectos-puntuales.md', 'Proyectos puntuales', 'Necesidad concreta y acotada.', (r) => r.type === 'one_off', true],
  ['03-empleos-descartados.md', 'Empleos descartados', 'Ofertas de trabajo que el clasificador NO trata como cliente. Revisa que no haya servicios mal clasificados.', (r) => r.type === 'job', false],
  ['04-no-relevantes.md', 'Resultados no relevantes', 'No encajan con First Client Finder (incluye a quien ofrece sus servicios). Revisa falsos negativos.', (r) => r.type === 'not_relevant', false],
  ['05-aptas-principiantes.md', 'Oportunidades aptas para principiantes', 'Relevantes con la experiencia escrita como sin experiencia/junior y otra señal explícita a favor, sin bloqueos.', (r) => r.level === 'apta' && ['freelance', 'one_off'].includes(r.type) && r.decision === 'imported' && r.fraud?.level !== 'high', true],
  ['06-posibles-fraudes.md', 'Posibles fraudes y calidad baja', 'Hay señales que conviene mirar a mano. NO es un veredicto: pueden ser falsos positivos.', (r) => (r.fraud?.level && r.fraud.level !== 'none') || r.qualityLevel === 'poor', true],
  ['07-colaboracion.md', 'Colaboración', 'Buscan socio o colaborador sin pago indicado. No se importan.', (r) => r.type === 'collaboration', false],
];

export function renderReviewFiles(results) {
  const files = {};
  for (const [name, title, intro, pick, withReasons] of REVIEW) {
    const L = [`# ${title}`, '', intro, '', 'Los avisos son señales para la revisión humana. Las filas son un resumen (título saneado y enlace): abre el enlace para ver la publicación completa.', ''];
    for (const r of results) {
      L.push(`## ${r.name}`, '');
      if (failed(r)) { L.push(`**La fuente falló en esta ejecución (${statusText(r.status)}): sin datos.**`, ''); continue; }
      const rows = (r.lists?.all || []).filter(pick);
      L.push(`${rows.length} resultado(s).`, '', table(rows), '');
      if (withReasons && rows.length) L.push('### Razones', '', reasons(rows), '');
    }
    files[`review/${name}`] = L.join('\n');
  }
  files['review/todas.csv'] = toCsv(results);
  return files;
}

// CSV con protección frente a fórmulas (=, +, -, @) al abrirlo en una hoja de cálculo.
const cell = (v) => { let s = String(v ?? '').replace(/[\r\n]+/g, ' '); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(results) {
  const head = ['fuente', 'tipo', 'estado', 'nivel_principiante', 'bf', 'fraude', 'avisos', 'titulo', 'url', 'publicada', 'presupuesto', 'util', 'comentario'];
  const lines = [head.join(',')];
  for (const r of results) {
    if (failed(r)) continue;
    for (const x of r.lists?.all || []) {
      lines.push([r.name, TYPE_ES[x.type], decisionOf(x), LEVEL_ES[x.level] || '', x.bf, x.fraud?.level || 'none', (x.flags || []).length, x.title, x.url, x.postedAt?.slice(0, 10) || '', fmtBudget(x.budget), '', ''].map(cell).join(','));
    }
  }
  return lines.join('\n') + '\n';
}

// Resumen corto para la pestaña «Summary» de la ejecución de GitHub Actions.
export function renderStepSummary(results, { requests, notes = [] } = {}) {
  const L = ['## Live Probe', '', 'El informe completo está en los **Artifacts** de esta ejecución (`QUALITY_REPORT.md` y carpeta `review/`).', ''];
  for (const n of notes) L.push(`> ${n}`, '');
  L.push(renderSummaryTable(results), '', '### Peticiones realizadas', '', renderRequests(requests), '');
  return L.join('\n');
}

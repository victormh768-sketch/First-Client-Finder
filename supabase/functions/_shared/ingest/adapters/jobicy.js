// Jobicy · API pública de empleo remoto (https://github.com/Jobicy/remote-jobs-api).
// Condiciones leídas de su README oficial: sin clave; se pueden usar los datos en productos propios sin permiso
// individual; NO sondear más de una vez por hora; mantener Jobicy como fuente original y la URL canónica de la
// oferta; no presentar las ofertas como propias; no crear redes de spam ni bases de datos engañosas.
// Se importan solo ofertas marcadas Freelance, Contract o Part-time. Los salarios no se interpretan como presupuesto.
// Sin verificar en vivo: la zona horaria de `pubDate` no está documentada; se asume UTC.
import { stripHtml, clip } from '../text.js';

const ENDPOINT = 'https://jobicy.com/api/v2/remote-jobs';

const toIso = (s) => {
  if (!s) return null;
  const v = String(s).trim();
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function normalizeJobType(jobType) {
  const types = [].concat(jobType || []).map((t) => String(t).toLowerCase());
  if (types.some((t) => /freelance/.test(t))) return 'freelance';
  if (types.some((t) => /contract/.test(t))) return 'contract';
  if (types.some((t) => /part[- ]?time/.test(t))) return 'part_time';
  return null;
}

export const adapter = {
  id: 'jobicy',
  async fetchItems({ fetch: f, config = {} }) {
    const p = new URLSearchParams({ count: String(config.count ?? 100) });
    if (config.geo) p.set('geo', config.geo);
    if (config.industry) p.set('industry', config.industry);
    const res = await f(`${ENDPOINT}?${p}`, { headers: { accept: 'application/json', 'user-agent': 'FirstClientFinder/1.0' } });
    if (!res.ok) throw new Error(`Jobicy respondió ${res.status}`);
    const data = await res.json();
    const all = (data.jobs || []).map((j) => ({ j, jobType: normalizeJobType(j.jobType) }));
    const out = all
      .filter(({ jobType }) => jobType)
      .map(({ j, jobType }) => ({
        externalId: String(j.id),
        title: clip(String(j.jobTitle || ''), 160),
        description: clip(stripHtml(j.jobDescription || j.jobExcerpt || ''), 4000),
        client: j.companyName || null,
        postedAt: toIso(j.pubDate),
        url: j.url,
        hint: null,
        jobType,
        rawCategory: [].concat(j.jobIndustry || []).join(' ') || null,
      }));
    const byType = {};
    for (const { j } of all) for (const t of [].concat(j.jobType || ['sin_tipo'])) byType[t] = (byType[t] || 0) + 1;
    out.meta = { totalBeforeFilter: all.length, byType };
    return out;
  },
};

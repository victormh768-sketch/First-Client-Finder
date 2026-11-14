// RemoteJobs.org · API pública v1 (https://remotejobs.org/developers/api): sin clave, filtro `type=freelance|contract`.
// Condiciones leídas en su página de desarrolladores: < 200 peticiones/hora por IP, enlace visible a RemoteJobs.org y
// mantener el enlace de solicitud. Sus TÉRMINOS DE SERVICIO no se han leído: fuente desactivada hasta revisarlos.
// La forma exacta de la respuesta no está documentada con un ejemplo: si no es la esperada se falla con un error claro.
import { stripHtml, clip } from '../text.js';

const ENDPOINT = 'https://remotejobs.org/api/v1/jobs';
const countBy = (a) => a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
const typesOf = (j) => [].concat(j.employment_types || j.type || []).map((x) => String(x).toLowerCase());

function listFrom(data) {
  if (Array.isArray(data)) return data;
  for (const k of ['jobs', 'data', 'items', 'results']) if (Array.isArray(data?.[k])) return data[k];
  throw new Error(`RemoteJobs.org: forma de respuesta inesperada (claves: ${Object.keys(data || {}).slice(0, 8).join(', ') || 'ninguna'})`);
}

export const adapter = {
  id: 'remotejobs',
  async fetchItems({ fetch: f, config = {} }) {
    const type = config.type || 'freelance';
    const res = await f(`${ENDPOINT}?type=${encodeURIComponent(type)}&limit=${config.limit ?? 50}`, { headers: { accept: 'application/json', 'user-agent': 'FirstClientFinder/1.0' } });
    if (!res.ok) throw new Error(`RemoteJobs.org respondió ${res.status}`);
    const all = listFrom(await res.json());
    const out = all.filter((j) => j && j.id != null && j.title && j.url).map((j) => {
      const t = typesOf(j);
      const posted = j.posted_at ? new Date(j.posted_at) : null;
      return {
        externalId: String(j.id),
        title: clip(String(j.title), 160),
        description: clip(stripHtml(j.description || ''), 4000),
        client: j.company?.name || null,
        postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : null,
        url: j.url,
        hint: null,
        jobType: t.includes('freelance') ? 'freelance' : t.includes('contract') ? 'contract' : t.includes('part-time') || t.includes('part_time') ? 'part_time' : null,
        rawCategory: typeof j.category === 'string' ? j.category : j.category?.name || null,
        // Los importes de la API (salary_min/max + periodo) no se interpretan como presupuesto de proyecto.
      };
    });
    out.meta = { totalBeforeFilter: all.length, byType: countBy(all.flatMap((j) => typesOf(j).length ? typesOf(j) : ['sin_tipo'])) };
    return out;
  },
};

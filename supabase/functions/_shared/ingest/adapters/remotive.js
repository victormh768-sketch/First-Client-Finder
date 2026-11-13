// Remotive · API pública de empleo remoto (https://remotive.com/remote-jobs/api).
// Condiciones leídas de su README: enlazar a la oferta en Remotive Y nombrar a Remotive como fuente;
// ofertas con 24 h de retraso; máximo 4 peticiones al día; no reenviar a terceros ni captar altas con ellas.
// Se guarda la URL de Remotive (no la del empleador) y se importan solo job_type freelance/contract/part_time.
import { stripHtml, clip } from '../text.js';

const ENDPOINT = 'https://remotive.com/api/remote-jobs';
const countBy = (a) => a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

export const adapter = {
  id: 'remotive',
  async fetchItems({ fetch: f, config = {} }) {
    const url = config.category ? `${ENDPOINT}?category=${encodeURIComponent(config.category)}` : ENDPOINT;
    const res = await f(url, { headers: { accept: 'application/json', 'user-agent': 'FirstClientFinder/1.0' } });
    if (!res.ok) throw new Error(`Remotive respondió ${res.status}`);
    const data = await res.json();
    const all = data.jobs || [];
    const out = all
      .filter((j) => /^(freelance|contract|part_time)$/i.test(j.job_type || ''))
      .map((j) => ({
        externalId: String(j.id),
        title: clip(String(j.title || ''), 160),
        description: clip(stripHtml(j.description || ''), 4000),
        client: j.company_name || null,
        postedAt: j.publication_date ? new Date(j.publication_date.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(j.publication_date) ? j.publication_date : j.publication_date + 'Z').toISOString() : null,
        url: j.url,
        hint: null,
        jobType: j.job_type,
        rawCategory: j.category || null,
        // `salary` de Remotive es anual y no se interpreta como presupuesto de proyecto.
      }));
    out.meta = { totalBeforeFilter: all.length, byType: countBy(all.map((j) => j.job_type || 'sin_tipo')) };
    return out;
  },
};

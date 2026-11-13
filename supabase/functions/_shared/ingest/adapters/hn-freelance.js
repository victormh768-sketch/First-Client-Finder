// Hacker News · hilo mensual «Ask HN: Freelancer? Seeking freelancer?» (publicado por whoishiring).
// API: buscador Algolia de HN (https://hn.algolia.com/api), gratuita y sin clave.
// Solo se leen comentarios de nivel superior; no se guarda el nombre de usuario del autor.
import { stripHtml, clip, daysBetween } from '../text.js';

// La fuente no tiene datos vigentes (p. ej. el hilo más reciente es de hace meses). No se importa nada antiguo como si fuera actual.
export class StaleSourceError extends Error {
  constructor(message) { super(message); this.name = 'StaleSourceError'; this.code = 'STALE_SOURCE'; }
}

const BASE = 'https://hn.algolia.com/api/v1';
const THREAD_RE = /ask hn: freelancer\? seeking freelancer\?/i;

async function getJson(url, f) {
  const res = await f(url, { headers: { accept: 'application/json', 'user-agent': 'FirstClientFinder/1.0' } });
  if (!res.ok) throw new Error(`HN/Algolia respondió ${res.status}`);
  return res.json();
}

export async function findLatestThread(f) {
  const data = await getJson(`${BASE}/search_by_date?tags=story,author_whoishiring&query=${encodeURIComponent('Freelancer? Seeking freelancer?')}&hitsPerPage=10`, f);
  const hit = (data.hits || []).find((h) => THREAD_RE.test(h.title || ''));
  if (!hit) throw new Error('No se encontró el hilo «Freelancer? Seeking freelancer?» más reciente');
  return { id: String(hit.objectID), title: hit.title, createdAt: hit.created_at };
}

// Primera línea con «SEEKING FREELANCER» / «SEEKING WORK» → pista explícita de la propia publicación.
function hintFromText(text) {
  const head = text.slice(0, 160).toUpperCase();
  if (/^\W*SEEKING FREELANCER/.test(head)) return 'request';
  if (/^\W*SEEKING WORK/.test(head)) return 'supply';
  return null;
}

export const adapter = {
  id: 'hn-freelance',
  async fetchItems({ fetch: f, config = {}, now = new Date() }) {
    const maxPages = config.maxPages ?? 4;
    const thread = await findLatestThread(f);
    const threadAge = daysBetween(thread.createdAt, now);
    if (threadAge > (config.maxThreadAgeDays ?? 45)) {
      throw new StaleSourceError(`El hilo más reciente encontrado es «${thread.title}» (${String(thread.createdAt).slice(0, 10)}, hace ${threadAge} días): no hay hilo vigente`);
    }
    const items = [];
    let topLevel = 0;
    for (let page = 0; page < maxPages; page++) {
      const data = await getJson(`${BASE}/search_by_date?tags=comment,story_${thread.id}&hitsPerPage=200&page=${page}`, f);
      for (const h of data.hits || []) {
        if (String(h.parent_id) !== thread.id) continue; // solo comentarios de nivel superior
        const text = stripHtml(h.comment_text || '');
        if (!text) continue;
        topLevel++;
        const firstLine = text.split('\n').find((l) => l.trim()) || text;
        items.push({
          externalId: String(h.objectID),
          title: clip(firstLine.replace(/^\W*(seeking freelancer|seeking work)\W*/i, '').trim() || firstLine, 140),
          description: clip(text, 4000),
          client: null,
          postedAt: h.created_at,
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          hint: hintFromText(text),
          jobType: null,
          rawCategory: null,
        });
      }
      if (page + 1 >= (data.nbPages || 1)) break;
    }
    items.meta = { thread: { id: thread.id, title: thread.title, createdAt: thread.createdAt }, topLevelComments: topLevel };
    return items;
  },
};

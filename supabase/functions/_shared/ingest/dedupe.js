// Detección de duplicados: mismo identificador, misma URL canónica o texto casi idéntico.
import { canonicalUrl, words, hash } from './text.js';

export function shingles(text, k = 3) {
  const w = words(text).slice(0, 300);
  const out = new Set();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '));
  if (!out.size) w.forEach((x) => out.add(x));
  return out;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const fingerprint = (title, description) => hash([...words(`${title} ${description}`.slice(0, 1500))].sort().join(' '));

/**
 * @param {{platform:string, externalId:string, url:string, title:string, description:string}} item
 * @param {Array<{id:string, platform:string, externalId:string, url:string, title:string, description:string, shingles?:Set<string>}>} pool
 */
export function findDuplicate(item, pool, threshold = 0.8) {
  const url = canonicalUrl(item.url);
  const mine = shingles(`${item.title} ${item.description}`);
  for (const p of pool) {
    if (p.platform === item.platform && p.externalId === item.externalId) return { of: p.id, reason: 'same_id', similarity: 1 };
    if (url && canonicalUrl(p.url) === url) return { of: p.id, reason: 'same_url', similarity: 1 };
  }
  let best = null;
  for (const p of pool) {
    const sh = p.shingles || (p.shingles = shingles(`${p.title} ${p.description}`));
    const sim = jaccard(mine, sh);
    if (sim >= threshold && (!best || sim > best.similarity)) best = { of: p.id, reason: 'similar_text', similarity: Math.round(sim * 100) / 100 };
  }
  return best;
}

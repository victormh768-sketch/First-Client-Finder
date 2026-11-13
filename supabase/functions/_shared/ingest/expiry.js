// Caducidad: por antigüedad (según la fuente) y por comprobación del enlace.
import { daysBetween } from './text.js';

export function isExpiredByAge(postedAt, maxAgeDays, now = new Date()) {
  if (!postedAt || !maxAgeDays) return false; // sin fecha no se puede afirmar que caducó
  return daysBetween(postedAt, now) > maxAgeDays;
}

/**
 * Comprueba que el enlace original sigue existiendo.
 * 'ok'      → responde 2xx/3xx
 * 'gone'    → 404 o 410 (la publicación ya no existe)
 * 'unknown' → error de red, 403, 429, 5xx: NO se considera caducada, solo sin verificar
 */
export async function checkLink(url, fetchFn = fetch, timeoutMs = 8000) {
  const run = async (method) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetchFn(url, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'FirstClientFinderBot/1.0 (link check)' } }); }
    finally { clearTimeout(timer); }
  };
  try {
    let res = await run('HEAD');
    if (res.status === 405 || res.status === 501) res = await run('GET');
    if (res.status === 404 || res.status === 410) return 'gone';
    if (res.status >= 200 && res.status < 400) return 'ok';
    return 'unknown';
  } catch { return 'unknown'; }
}

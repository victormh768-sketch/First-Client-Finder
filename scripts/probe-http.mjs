// Cliente HTTP «educado» del Live Probe: espacia las peticiones por host, pone un tope propio por host y
// cuenta todo lo que se pide. No reintenta nunca (un 429 o 5xx se informa tal cual). No lee variables de entorno
// ni añade credenciales: todas las fuentes usadas son públicas y sin clave.

// Límites PROPIOS y conservadores (no son los de las fuentes). Los publicados por las fuentes se respetan además
// con `GUARDS` y con el hecho de que cada ejecución hace una sola petición a las APIs de Remotive y Jobicy.
export const DEFAULT_GAP_MS = 500;
export const HOST_GAP_MS = { 'remotive.com': 1500, 'jobicy.com': 1500, 'news.ycombinator.com': 2000, 'hn.algolia.com': 500 };
export const API_HOST_CAP = { 'hn.algolia.com': 20 }; // hosts que solo son API: tope de peticiones por ejecución
export const DEFAULT_LINK_CAP = 30; // comprobaciones de enlace por host; en hosts con API y enlaces (remotive.com, jobicy.com) la petición a la API cuenta además

export class RequestLimitError extends Error {
  constructor(host, cap) { super(`Límite propio de peticiones alcanzado para ${host} (${cap})`); this.name = 'RequestLimitError'; this.code = 'REQUEST_LIMIT'; }
}

export function createPoliteFetch({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), timeoutMs = 20000, linkCap = DEFAULT_LINK_CAP } = {}) {
  const last = new Map();
  const stats = {};
  const cap = (host) => API_HOST_CAP[host] ?? linkCap + 1;
  async function politeFetch(url, opts = {}) {
    const host = new URL(url).host;
    const s = (stats[host] ||= { count: 0, status: {}, limited: 0 });
    if (s.count >= cap(host)) { s.limited++; throw new RequestLimitError(host, cap(host)); }
    const wait = last.has(host) ? last.get(host) + (HOST_GAP_MS[host] ?? DEFAULT_GAP_MS) - now() : 0;
    if (wait > 0) await sleep(wait);
    last.set(host, now());
    s.count++;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), ...opts });
      const k = String(res.status); s.status[k] = (s.status[k] || 0) + 1;
      return res;
    } catch (e) { s.status.error = (s.status.error || 0) + 1; throw e; }
  }
  politeFetch.requests = () => JSON.parse(JSON.stringify(stats));
  return politeFetch;
}

// Límites publicados por las fuentes (leídos en sus condiciones; ver docs/FEASIBILITY.md):
//   Remotive: máx. 4 peticiones al día · Jobicy: máx. 1 sondeo por hora.
// `recent` = ejecuciones de este workflow en la última hora / 24 h (sin contar la actual), calculadas en el workflow.
// Si no se pudo calcular (null) NO se bloquea, pero se avisa en el informe.
export const GUARDS = { remotive: { windowKey: 'last24h', max: 3, label: 'Remotive permite como máximo 4 peticiones al día' }, jobicy: { windowKey: 'last1h', max: 0, label: 'Jobicy permite como máximo 1 sondeo por hora' } };

export function guardDecision(sourceId, recent) {
  const g = GUARDS[sourceId];
  if (!g) return { skip: false };
  const n = recent?.[g.windowKey];
  if (n == null || Number.isNaN(n)) return { skip: false, warn: `No se pudo comprobar cuántas veces se ejecutó este workflow recientemente: no se verificó el límite de ${sourceId}. ${g.label}.` };
  if (n > g.max) return { skip: true, reason: `${g.label}; este workflow ya se ejecutó ${n} vez/veces en la ventana (${g.windowKey === 'last1h' ? 'última hora' : 'últimas 24 h'}). Espera y vuelve a lanzarlo.` };
  return { skip: false };
}

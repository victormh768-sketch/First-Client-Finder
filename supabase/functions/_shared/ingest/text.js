// Utilidades de texto puras (sin DOM): funcionan en Deno, Node y navegador.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x27': "'", '#x2F': '/', '#39': "'" };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (ENT[e] !== undefined) return ENT[e];
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return m;
    });
}

// HTML → texto plano. Conserva saltos de línea de <p>, <br> y <li>; elimina scripts y estilos.
export function stripHtml(html) {
  const s = String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => (label.trim() && !label.includes(href.slice(0, 20)) ? `${label} (${href})` : label || href))
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function normalizeText(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$€£ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function words(s) { return normalizeText(s).split(' ').filter((w) => w.length > 2); }

// Hash FNV-1a de 32 bits (sin dependencias; suficiente para huellas de deduplicación).
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function canonicalUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    x.hash = '';
    [...x.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|ref$|source$)/i.test(k)).forEach((k) => x.searchParams.delete(k));
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, '');
    if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '');
    let out = x.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch { return null; }
}

export const daysBetween = (a, b) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 864e5);

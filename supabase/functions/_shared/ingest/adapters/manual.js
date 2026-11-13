// Entrada manual: una persona pega el texto (y opcionalmente el enlace) de una publicación.
// No se descarga el enlace: solo se analiza el texto que aporta la persona.
import { clip, hash, canonicalUrl } from '../text.js';

const PLATFORMS = [[/linkedin\.com/i, 'LinkedIn (manual)'], [/reddit\.com/i, 'Reddit (manual)'], [/news\.ycombinator\.com/i, 'Hacker News (manual)'], [/x\.com|twitter\.com/i, 'X (manual)']];

export function platformFromUrl(url) {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  return (PLATFORMS.find(([re]) => re.test(host)) || [null, host ? `${host.replace(/^www\./, '')} (manual)` : 'Manual'])[1];
}

export function parseManual({ url, text, title }) {
  const body = String(text || '').trim();
  if (body.length < 30) throw new Error('El texto es demasiado corto para analizarlo (mínimo 30 caracteres).');
  const cu = url ? canonicalUrl(url) : null;
  if (url && !cu) throw new Error('El enlace debe empezar por http:// o https://');
  const first = (title || body.split('\n').find((l) => l.trim()) || body).trim();
  return {
    externalId: cu ? hash(cu) : hash(body.slice(0, 500)),
    title: clip(first, 160),
    description: clip(body, 4000),
    client: null,
    postedAt: null, // la fecha de publicación no se puede conocer sin la fuente: no se inventa
    url: cu,
    hint: null, jobType: null, rawCategory: null,
    platform: platformFromUrl(url || ''),
  };
}

// Adaptador genérico RSS 2.0 / Atom. Cada feed se registra como su propia fuente y nace DESACTIVADO:
// antes de activarlo hay que leer las condiciones del sitio (uso permitido, atribución, frecuencia).
import { stripHtml, clip, decodeEntities } from '../text.js';

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim();
};

export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const link = isAtom ? (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '' : tag(b, 'link');
    const date = tag(b, isAtom ? 'updated' : 'pubDate') || tag(b, 'published') || tag(b, 'dc:date');
    const d = date ? new Date(date) : null;
    return {
      externalId: tag(b, isAtom ? 'id' : 'guid') || link,
      title: tag(b, 'title'),
      description: stripHtml(tag(b, isAtom ? 'content' : 'description') || tag(b, 'summary')),
      url: link,
      postedAt: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    };
  }).filter((i) => i.externalId && i.title && i.url);
}

export const adapter = {
  id: 'rss',
  async fetchItems({ fetch: f, config = {} }) {
    if (!config.url) throw new Error('Falta config.url del feed');
    const res = await f(config.url, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml', 'user-agent': 'FirstClientFinder/1.0' } });
    if (!res.ok) throw new Error(`El feed respondió ${res.status}`);
    return parseFeed(await res.text()).map((i) => ({ ...i, title: clip(i.title, 160), description: clip(i.description, 4000), client: null, hint: null, jobType: config.jobType || null, rawCategory: null }));
  },
};

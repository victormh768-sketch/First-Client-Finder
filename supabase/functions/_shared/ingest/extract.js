// Extracción de categoría, habilidades y presupuesto. Solo devuelve lo que aparece en el texto.
import { normalizeText } from './text.js';

// Categorías del catálogo de la app (js/data/catalog.js).
const CATEGORY_RULES = [
  ['video', /\b(video|vid[eé]o|youtube|reels?|tiktok edit|premiere|after effects|davinci|motion graphics|subtitl|thumbnail)\b/],
  ['automation', /\b(automation|automatiz\w*|zapier|n8n|make\.com|integromat|workflow|chatbot|bot|scripting|web scraping|api integration)\b/],
  ['web', /\b(website|web ?site|landing page|pagina web|wordpress|shopify|woocommerce|html|css|javascript|react|frontend|front-end|web develop\w*|web design)\b/],
  ['design', /\b(logo|brand(ing)?|graphic design\w*|dise[nñ]o gr[aá]fico|figma|canva|illustrat\w*|photoshop|ui\/ux|ux design|poster|packaging|infographic)\b/],
  ['social', /\b(social media|redes sociales|instagram|community manage\w*|content calendar|linkedin posts?)\b/],
  ['marketing', /\b(marketing|seo|sem|google ads|meta ads|facebook ads|ppc|email marketing|newsletter|growth|lead gen\w*|campaign)\b/],
  ['translation', /\b(translat\w*|traduc\w*|localization|localisation|interpret\w*)\b/],
  ['writing', /\b(copywrit\w*|content writ\w*|blog post|article|redactor|redacci[oó]n|ghostwrit\w*|proofread\w*|editor of text|technical writ\w*)\b/],
  ['data', /\b(data entry|spreadsheet|excel|google sheets|data (analysis|cleaning|visuali[sz]ation)|dashboard|looker|power bi)\b/],
  ['support', /\b(customer support|customer service|virtual assistant|asistente virtual|atenci[oó]n al cliente|moderat\w*)\b/],
];

export function detectCategory(text, rawCategory) {
  const t = normalizeText(`${rawCategory || ''} ${text}`.slice(0, 5000));
  const scores = {};
  for (const [cat, re] of CATEGORY_RULES) {
    const m = t.match(new RegExp(re.source, 'g'));
    if (m) scores[cat] = m.length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? { category: best[0], matched: true } : { category: 'other', matched: false };
}

// Habilidades canónicas (las mismas que usa el perfil, para que la coincidencia funcione).
const SKILL_RULES = [
  ['Video editing', /\b(video edit\w*|edici[oó]n de v[ií]deo|premiere|after effects|davinci|final cut)\b/],
  ['Subtitles', /\b(subtitl\w*|captions?)\b/],
  ['Motion graphics', /\b(motion graphics|animation|animaci[oó]n)\b/],
  ['Canva', /\bcanva\b/],
  ['Figma', /\bfigma\b/],
  ['Logo design', /\blogo\w*\b/],
  ['Photoshop', /\bphotoshop\b/],
  ['Illustrator', /\billustrator\b/],
  ['Copywriting', /\bcopywrit\w*\b/],
  ['SEO writing', /\bseo (writ\w*|content|article)\b/],
  ['Proofreading', /\bproofread\w*|correcci[oó]n de textos\b/],
  ['Research', /\bresearch\b/],
  ['Social media', /\b(social media|redes sociales|instagram|tiktok)\b/],
  ['Community management', /\bcommunity manage\w*\b/],
  ['Email marketing', /\bemail marketing|newsletter\b/],
  ['HTML/CSS', /\b(html|css)\b/],
  ['JavaScript', /\b(javascript|typescript|react|node\.?js|vue)\b/],
  ['WordPress', /\b(wordpress|woocommerce)\b/],
  ['Responsive design', /\bresponsive\b/],
  ['Translation', /\b(translat\w*|traduc\w*)\b/],
  ['Localization', /\blocali[sz]ation\b/],
  ['Excel/Sheets', /\b(excel|google sheets|spreadsheet)\b/],
  ['Data entry', /\bdata entry\b/],
  ['Data visualization', /\b(data visuali[sz]ation|dashboard|looker|power bi)\b/],
  ['Customer support', /\b(customer (support|service)|atenci[oó]n al cliente)\b/],
  ['Virtual assistance', /\b(virtual assistant|asistente virtual)\b/],
  ['SEO', /\bseo\b/],
  ['Google Ads', /\bgoogle ads\b/],
  ['Meta Ads', /\b(meta ads|facebook ads|instagram ads)\b/],
  ['Zapier', /\bzapier\b/],
  ['Make', /\b(make\.com|integromat)\b/],
  ['n8n', /\bn8n\b/],
  ['Scripting', /\b(python|scripting|web scraping)\b/],
];

export function detectSkills(text) {
  const t = normalizeText(String(text).slice(0, 6000));
  return SKILL_RULES.filter(([, re]) => re.test(t)).map(([name]) => name).slice(0, 8);
}

// Presupuesto: solo si está escrito. Hay un único importe → min = max.
const SYM = { $: 'USD', '€': 'EUR', '£': 'GBP' };
const NUM = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k)?';

function toNumber(raw, k) {
  let s = raw;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * (k ? 1000 : 1)) : null;
}

export function extractBudget(text) {
  const s = String(text ?? '').slice(0, 6000);
  const re = new RegExp(`(\\$|€|£)\\s*${NUM}(?:\\s*(?:-|–|to|a)\\s*(?:\\$|€|£)?\\s*${NUM})?\\s*(?:\\/\\s*(h|hr|hour|hora)|per hour|an hour|\\/h)?`, 'i');
  const re2 = new RegExp(`${NUM}\\s*(usd|eur|gbp|dollars|euros|€|\\$)(?:\\s*(?:\\/\\s*(h|hr|hour|hora)|per hour|an hour))?`, 'i');
  let cur, a, b, hourly = false;
  const m = s.match(re);
  if (m) {
    cur = SYM[m[1]]; a = toNumber(m[2], m[3]); b = m[4] ? toNumber(m[4], m[5]) : null;
    hourly = !!m[6] || /per hour|an hour|\/h\b/i.test(m[0]);
  } else {
    const m2 = s.match(re2);
    if (!m2) return null;
    const c = m2[3].toLowerCase();
    cur = c.startsWith('eur') || c === '€' ? 'EUR' : c.startsWith('gbp') ? 'GBP' : 'USD';
    a = toNumber(m2[1], m2[2]); b = null;
    hourly = !!m2[4] || /per hour|an hour/i.test(m2[0]);
  }
  if (!a || a <= 0) return null;
  if (b && b < a) b = null;
  // Cifras anuales (p. ej. $90k) no son un presupuesto de proyecto: se descartan.
  const context = s.slice(Math.max(0, (m?.index ?? 0) - 25), (m?.index ?? 0) + (m?.[0].length ?? 0) + 25).toLowerCase();
  if (/(per year|\/year|annual|yearly|\/yr|salary|salario|al a[nñ]o)/.test(context)) return null;
  return { min: a, max: b || a, currency: cur, type: hourly ? 'hourly' : 'fixed' };
}

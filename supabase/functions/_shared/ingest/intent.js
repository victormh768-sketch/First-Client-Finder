// ¿La publicación busca CONTRATAR un servicio? Clasificador por reglas (ES/EN), explicable y sin IA de pago.
// Solo mira el texto recibido: no infiere nada que no esté escrito.
import { normalizeText } from './text.js';

// Cada señal: [expresión sobre texto normalizado, peso, nombre]
const REQUEST = [
  [/\b(seeking|looking for|searching for|need(s|ed)?|want(s)?|hiring|require[sd]?) (a |an |some |someone|somebody|to hire|help)/, 2, 'asks_for_help'],
  [/\bseeking freelancer\b/, 4, 'seeking_freelancer'],
  [/\bwe('| a)?re (looking|hiring|searching)\b/, 2, 'we_are_looking'],
  [/\b(i|we) need\b/, 2, 'we_need'],
  [/\b(busco|buscamos|necesito|necesitamos|se busca|se necesita|requerimos)\b/, 2, 'asks_es'],
  [/\b(contratar|contratamos|encargo|encargar|proyecto)\b/, 1, 'project_es'],
  [/\b(freelance|freelancer|contractor|contract basis|one[- ]off|short[- ]term|gig|per project|por proyecto|autonomo)\b/, 1, 'freelance_terms'],
  [/\b(budget|presupuesto|paying|will pay|pago|pay rate|per hour|hourly|fixed price|precio cerrado)\b/, 1, 'money_terms'],
  [/\[hiring\]|\bhiring:/, 3, 'hiring_tag'],
];

// Quien OFRECE sus servicios (oferta, no demanda).
const SUPPLY = [
  [/\bseeking work\b/, 4, 'seeking_work'],
  [/\b(available for (hire|work|projects)|for hire|open to (work|opportunities)|hire me|my services|offering my|ofrezco|me ofrezco|disponible para)\b/, 3, 'offers_services'],
  [/\[for hire\]/, 4, 'for_hire_tag'],
  [/\b(my (portfolio|rates|resume|cv) (is|are|at)|i('| a)m a (freelance|freelancer|developer|designer|editor))/, 1, 'self_intro'],
];

// Empleo tradicional.
const JOB = [
  [/\b(full[- ]time|jornada completa|tiempo completo|permanent|indefinido)\b/, 2, 'full_time'],
  [/\b(salary|salario|benefits|401\(?k\)?|equity|stock options|health insurance|paid time off|pto|visa sponsorship)\b/, 1, 'job_perks'],
  [/\b(apply (now|here|today)|send (your )?(cv|resume)|join our team|about the role|responsibilities|requirements|qualifications)\b/, 1, 'job_posting_language'],
];

// Entregables concretos de servicios.
const DELIVERABLE = /\b(logo|website|web ?site|landing page|pagina web|video|edit(or|ing)|design(er)?|dise[nñ]o|diseñador|translat|traduc|copywrit|content writ|blog|social media|redes sociales|community manage|seo|automation|automatiz|zapier|n8n|wordpress|shopify|ads|marketing|illustrat|animation|thumbnail|presentation|spreadsheet|data entry|virtual assistant|chatbot|script|bot|poster|flyer|banner|template|brochure|infographic|packaging|branding|mockup|newsletter|podcast|voice ?over|invitation|ebook|pitch deck|slides)\b/;

const sum = (rules, t) => {
  let n = 0; const hits = [];
  for (const [re, w, name] of rules) if (re.test(t)) { n += w; hits.push(name); }
  return { n, hits };
};

/**
 * @param {{title?:string, description?:string, hint?:'request'|'supply'|'job'|null, jobType?:string|null}} item
 * @returns {{kind:'service_request'|'job'|'seeking_work'|'other', confidence:number, signals:string[]}}
 */
export function classifyIntent(item) {
  const t = normalizeText(`${item.title || ''} ${item.description || ''}`.slice(0, 6000));
  const head = normalizeText(`${item.title || ''} ${(item.description || '').slice(0, 200)}`);
  const req = sum(REQUEST, t);
  const sup = sum(SUPPLY, head + ' ' + t.slice(0, 600));
  const job = sum(JOB, t);
  const deliverable = DELIVERABLE.test(t);
  const signals = [...req.hits, ...sup.hits.map((h) => 'supply:' + h), ...job.hits.map((h) => 'job:' + h)];
  if (deliverable) signals.push('deliverable');

  // La plataforma puede indicarlo explícitamente (p. ej. «SEEKING FREELANCER» en Hacker News).
  if (item.hint === 'supply') return { kind: 'seeking_work', confidence: 0.95, signals: ['platform_hint:supply', ...signals] };
  if (item.hint === 'request') {
    return { kind: 'service_request', confidence: deliverable ? 0.9 : 0.7, signals: ['platform_hint:request', ...signals] };
  }

  if (sup.n >= 3 && sup.n > req.n) return { kind: 'seeking_work', confidence: Math.min(1, sup.n / 5), signals };

  const freelanceType = /^(freelance|contract|part[_ -]?time)$/i.test(item.jobType || '');
  if (job.n >= 2 && !freelanceType && req.n < 5) return { kind: 'job', confidence: Math.min(1, job.n / 4), signals };

  const score = req.n + (deliverable ? 1 : 0) + (freelanceType ? 2 : 0) - sup.n;
  if (score >= 3 && deliverable) return { kind: freelanceType || job.n < 2 ? 'service_request' : 'job', confidence: Math.min(1, score / 6), signals };
  if (freelanceType) return { kind: 'job', confidence: 0.5, signals };
  return { kind: 'other', confidence: Math.min(1, score / 6), signals };
}
// La regla de importación (qué se guarda para revisión) está en opptype.js: se decide por tipo de oportunidad.

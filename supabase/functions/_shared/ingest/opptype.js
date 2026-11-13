// Tipo de oportunidad: freelance | one_off (proyecto puntual) | job (empleo) | collaboration | not_relevant.
// Se apoya en classifyIntent (señales) y solo mira el texto recibido. Ante la duda entre empleo y contratación
// de un servicio NO se asume servicio: un puesto de trabajo no es un cliente.
import { normalizeText } from './text.js';

export const TYPES = ['freelance', 'one_off', 'job', 'collaboration', 'not_relevant'];
// Tipos que se importan para revisión humana. Colaboración y empleo se cuentan pero no se importan.
export const RELEVANT_TYPES = new Set(['freelance', 'one_off']);
export const isImportable = (type) => RELEVANT_TYPES.has(type);

const COLLAB = /\b(co ?founder|cofundador|looking for (a |an )?(technical |business |marketing )?(partner|co ?founder)|buscamos socio|busco socio|socio (tecnico|capitalista|comercial)|partnership|collaborat(or|ors|ion)|colaborador(es)?|colaboracion|revenue ?share|rev ?share|profit ?share|equity only|sweat equity|reparto de beneficios)\b/;
const PAY = /\b(paid|will pay|paying|pago|pagamos|per hour|hourly|fixed price|precio cerrado|retribuid[oa]|remunerad[oa])\b/;
const BOUNDED = /\b(one ?off|one ?time|single (project|task|video|logo|page)|just (one|a)|small (project|task|job)|quick (job|project|task|fix)|simple (task|job|project)|fixed price|per project|por proyecto|puntual|gig|a few (hours|days)|one ?page|landing page|logo|thumbnail|poster|flyer|banner|business card|encargo|\d+ (short |small )?(videos|logos|posters|articles|posts|pages|thumbnails|translations))\b/;
const ONGOING = /\b(ongoing|long ?term|retainer|monthly|every (week|month)|recurring|continuous|weekly|regular (work|basis)|largo plazo|mensual|recurrente|continuo|\d+ (hours|h) (per|a) week)\b/;
const FREELANCE_TYPE = /^(freelance|contract|part[_ -]?time)$/i;

const out = (type, confidence, why) => ({ type, confidence: Math.round(confidence * 100) / 100, why });

/**
 * @param {{title?:string, description?:string, jobType?:string|null, hint?:string|null}} item
 * @param {{kind:string, confidence:number, signals:string[]}} intent  resultado de classifyIntent
 * @param {object|null} budget
 * @returns {{type:string, confidence:number, why:string[]}}  `why`: códigos legibles de la decisión
 */
export function classifyType(item, intent, budget = null) {
  const t = normalizeText(`${item.title || ''} ${item.description || ''}`.slice(0, 6000));
  const sig = intent.signals || [];
  const jobSignals = sig.filter((s) => s.startsWith('job:')).length;
  const contract = FREELANCE_TYPE.test(item.jobType || '');

  if (intent.kind === 'seeking_work') return out('not_relevant', intent.confidence, ['offers_own_services']);

  if (COLLAB.test(t) && !budget && !PAY.test(t)) return out('collaboration', 0.7, ['partner_or_collaborator_wanted', 'no_payment_stated']);

  if (intent.kind === 'job') {
    const why = ['job_posting_language'];
    if (contract) why.push('platform_contract_role');
    return out('job', Math.max(intent.confidence, 0.5), why);
  }

  if (intent.kind === 'service_request') {
    // Etiqueta de contrato en un tablón de empleo + lenguaje de puesto de trabajo = empleo, no cliente.
    if (contract && jobSignals >= 1 && item.hint !== 'request') return out('job', 0.6, ['platform_contract_role', 'job_posting_language']);
    const bounded = BOUNDED.test(t); const ongoing = ONGOING.test(t);
    if (bounded && !ongoing) return out('one_off', intent.confidence, ['direct_request', 'bounded_deliverable']);
    return out('freelance', intent.confidence, ['direct_request', ongoing ? 'ongoing_work' : 'scope_not_bounded']);
  }

  return out('not_relevant', intent.confidence, ['no_hiring_intent']);
}

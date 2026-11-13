// Motivos por los que merece la pena mirar una oportunidad. Cada uno es un código que se
// traduce en la interfaz y solo se emite si el dato está en el texto de la fuente.
import { daysBetween } from './text.js';

export function buildReasons(o, now = new Date()) {
  const r = [];
  if (o.postedAt && daysBetween(o.postedAt, now) <= 7) r.push('recent');
  if (o.budget) r.push('budget_stated');
  if (!o.portfolioRequired) r.push('no_portfolio');
  if (o.skills.length > 0 && o.skills.length <= 2) r.push('few_skills');
  if (o.experience === 'none' && !(o.estimated || []).includes('experience')) r.push('beginners_welcome');
  if (o.complexity <= 2 && !(o.estimated || []).includes('complexity')) r.push('small_scope');
  if (o.intent?.kind === 'service_request') r.push('direct_request');
  return r;
}

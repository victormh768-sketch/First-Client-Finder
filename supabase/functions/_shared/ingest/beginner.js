// Beginner Friendly Score (0-100) con razones por factor. Reglas:
//  · Lo que el texto NO dice puntúa bajo-neutro y se marca como «no indicado»; nunca cuenta como evidencia a favor.
//  · «Apta» exige experiencia escrita como none/junior + al menos otra señal explícita a favor y ningún bloqueo.
//  · «Posible» (experiencia no indicada) necesita ≥2 señales explícitas y NO se cuenta como apta.
// No es una probabilidad de conseguir el trabajo. Es distinta de `fit` (Beginner Fit de la app), que no se toca.
import { normalizeText } from './text.js';
import { RELEVANT_TYPES } from './opptype.js';

const PORTFOLIO_WAIVED = /\b(no portfolio( (is )?(required|needed))?|portfolio (is )?not (required|needed)|without (a )?portfolio|sin portfolio|no hace falta portfolio|no se requiere portfolio)\b/;
const MAX = { experience: 30, difficulty: 20, skills: 15, budgetScope: 20, portfolio: 15 };
const LABEL = { experience: 'Experiencia necesaria', difficulty: 'Dificultad', skills: 'Habilidades requeridas', budgetScope: 'Presupuesto y alcance', portfolio: 'Necesidad de portfolio' };

const money = (b) => `${b.min}${b.max !== b.min ? '–' + b.max : ''} ${b.currency}${b.type === 'hourly' ? '/h' : ''}`;
const topAmount = (b) => (b.type === 'hourly' ? (b.max || b.min) * 20 : (b.max || b.min)); // 20 h como proyecto típico

export function beginnerFriendly(o) {
  const t = normalizeText(`${o.title || ''} ${o.description || ''}`.slice(0, 6000));
  const est = new Set(o.estimated || []);
  const f = {};

  // Experiencia
  const expStated = !est.has('experience');
  if (!expStated) f.experience = { points: 10, basis: 'unknown', reason: 'No indica la experiencia necesaria: no se asume que sea apta para principiantes.' };
  else {
    const p = { none: 30, junior: 24, mid: 8, senior: 0 }[o.experience] ?? 10;
    f.experience = { points: p, basis: 'text', reason: { none: 'El texto admite principiantes o sin experiencia.', junior: 'El texto pide nivel junior.', mid: 'El texto pide nivel intermedio o varios años de experiencia.', senior: 'El texto pide nivel senior o mucha experiencia.' }[o.experience] };
  }

  // Dificultad
  const cxStated = !est.has('complexity');
  let cx = { 1: 20, 2: 17, 3: 10, 4: 4, 5: 0 }[o.complexity] ?? 10;
  if (!cxStated) cx = Math.min(cx, 10);
  f.difficulty = { points: cx, basis: cxStated ? 'text' : 'unknown', reason: cxStated ? `Alcance indicado en el texto (nivel ${o.complexity}/5).` : 'No describe el alcance: dificultad estimada (no escrita en la fuente), puntuación limitada.' };

  // Habilidades
  const n = (o.skills || []).length;
  f.skills = n === 0
    ? { points: 6, basis: 'unknown', reason: 'No se detectan habilidades concretas en el texto.' }
    : { points: [15, 15, 13, 9, 5][n] ?? 2, basis: 'text', reason: `${n} habilidad(es) detectada(s): ${o.skills.join(', ')}.` };

  // Presupuesto y alcance
  let bp; let br; let bb = 'text';
  if (o.budget) {
    const top = topAmount(o.budget);
    bp = top <= 150 ? 20 : top <= 600 ? 16 : top <= 2000 ? 9 : 3;
    br = `Presupuesto escrito: ${money(o.budget)}${top > 2000 ? ' (proyecto grande para empezar)' : top <= 600 ? ' (accesible)' : ''}.`;
  } else { bp = 6; bb = 'unknown'; br = 'Presupuesto no indicado.'; }
  if ((o.description || '').length > 2500) { bp = Math.max(0, bp - 3); br += ' Descripción muy larga: alcance amplio (−3).'; }
  f.budgetScope = { points: bp, basis: bb, reason: br };

  // Portfolio
  if (o.portfolioRequired) f.portfolio = { points: 3, basis: 'text', reason: 'Pide portfolio o ejemplos de trabajos anteriores.' };
  else if (PORTFOLIO_WAIVED.test(t)) f.portfolio = { points: 15, basis: 'text', reason: 'Dice que no hace falta portfolio.' };
  else f.portfolio = { points: 9, basis: 'unknown', reason: 'No menciona portfolio: no se asume que no haga falta.' };

  const factors = Object.keys(MAX).map((k) => ({ key: k, label: LABEL[k], max: MAX[k], ...f[k] }));
  const score = factors.reduce((s, x) => s + x.points, 0);

  // Señales explícitas a favor (solo texto) y bloqueos
  const positives = [];
  if (expStated && ['none', 'junior'].includes(o.experience)) positives.push('experience_entry');
  if (cxStated && o.complexity <= 2) positives.push('small_scope');
  if (o.budget && topAmount(o.budget) <= 600) positives.push('budget_accessible');
  if (f.portfolio.basis === 'text' && !o.portfolioRequired) positives.push('portfolio_waived');
  const blockers = [];
  if (expStated && ['mid', 'senior'].includes(o.experience)) blockers.push('experience_too_high');
  if (o.complexity >= 4) blockers.push('too_complex');
  if (o.portfolioRequired) blockers.push('portfolio_required');
  if (o.budget && topAmount(o.budget) > 2000) blockers.push('budget_too_large');
  if (!RELEVANT_TYPES.has(o.opportunityType)) blockers.push('not_a_service_request');
  if (o.quality?.fraud?.level === 'high') blockers.push('fraud_signals');

  const others = positives.filter((p) => p !== 'experience_entry').length;
  let level = 'no_apta';
  if (!blockers.length && score >= 60 && positives.includes('experience_entry') && others >= 1) level = 'apta';
  else if (!blockers.length && score >= 55 && !expStated && others >= 2) level = 'posible';

  const why = [];
  if (level === 'apta') why.push('Apta: la experiencia consta como ' + (o.experience === 'none' ? 'sin experiencia' : 'junior') + ' y hay otras señales explícitas a favor.');
  else if (level === 'posible') why.push('Posible, no confirmada: no indica experiencia, pero hay al menos dos señales explícitas a favor. No cuenta como apta.');
  else why.push(blockers.length ? 'No apta por: ' + blockers.join(', ') + '.' : 'No apta: faltan señales explícitas a favor (experiencia indicada y alcance o presupuesto accesibles).');

  return { score, level, factors, positives, blockers, why };
}

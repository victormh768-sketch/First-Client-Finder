// Estimaciones para el Beginner Fit Score a partir del texto, y la misma puntuación que js/scoring.js.
// Los valores estimados se marcan en `estimated` para que la interfaz no los presente como datos de la fuente.
import { normalizeText } from './text.js';

export function estimateRequirements(text, skillCount) {
  const t = normalizeText(String(text).slice(0, 6000));
  const estimated = [];
  let experience = 'junior';
  const yrs = t.match(/(\d{1,2})\s*\+?\s*(years|year|anos|ano)\b/);
  if (yrs) {
    const n = Number(yrs[1]);
    experience = n >= 5 ? 'senior' : n >= 3 ? 'mid' : 'junior';
  } else if (/\b(senior|lead|principal|staff|expert|experto|expert level)\b/.test(t)) experience = 'senior';
  else if (/\b(mid[- ]level|intermediate|intermedio|experienced|proven (track record|experience)|extensive experience|solid experience|con experiencia demostrable)\b/.test(t)) experience = 'mid';
  else if (/\b(no experience|no previous experience|sin experiencia|beginner|beginners|entry[- ]level|student|estudiante)\b/.test(t)) experience = 'none';
  else if (/\b(junior|jr)\b/.test(t)) experience = 'junior';
  else estimated.push('experience'); // no lo dice: se asume «junior» solo como valor neutro

  let complexity = 3;
  if (/\b(platform|architecture|full[- ]?stack|backend|machine learning|scalab\w*|enterprise|saas|microservices|e-?commerce (site|store|platform)|payment (gateway|integration))\b/.test(t)) complexity = 4;
  if (/\b(simple|small|quick|short|one[- ]page|single page|basic|sencillo|peque[nñ]o|rapido)\b/.test(t)) complexity = Math.min(complexity, 2);
  if (skillCount >= 5) complexity = Math.min(5, complexity + 1);
  if (skillCount <= 1 && complexity === 3) complexity = 2;
  if (String(text).length > 2500) complexity = Math.min(5, complexity + 1);
  if (!/\b(simple|small|quick|short|basic|platform|architecture|enterprise|full[- ]?stack|backend)\b/.test(t)) estimated.push('complexity');

  const waived = /\b(no portfolio( (is )?(required|needed))?|portfolio (is )?not (required|needed)|without (a )?portfolio|sin portfolio|no hace falta portfolio|no se requiere portfolio)\b/.test(t);
  const portfolioRequired = !waived && /\b(portfolio|previous work|work samples|samples of (your )?work|examples of (your )?work|case studies|trabajos anteriores|muestras)\b/.test(t);
  return { experience, complexity, portfolioRequired, estimated };
}

const EXP = { none: 30, junior: 21, mid: 9, senior: 0 };
const CX = { 1: 20, 2: 16, 3: 10, 4: 4, 5: 0 };

function budgetPts(b) {
  if (!b) return 8;
  const top = b.type === 'hourly' ? (b.max || b.min) * 20 : (b.max || b.min);
  return top <= 150 ? 15 : top <= 600 ? 12 : top <= 2000 ? 7 : 2;
}

// Debe devolver lo mismo que beginnerFit(o).score de js/scoring.js (hay una prueba que lo comprueba).
export function fitScore(o) {
  const n = o.skills.length;
  const skills = n <= 1 ? 20 : n === 2 ? 17 : n === 3 ? 13 : n === 4 ? 8 : 4;
  const total = (EXP[o.experience] ?? 12) + skills + (CX[o.complexity] ?? 10) + budgetPts(o.budget) + (o.portfolioRequired ? 3 : 15);
  return Math.max(0, Math.min(100, total));
}

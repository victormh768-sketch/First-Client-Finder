// Beginner Fit Score (0-100): orientativo, NO es una probabilidad de conseguir el trabajo.
import { t } from './i18n.js';

const EXP_POINTS = { none: 30, junior: 21, mid: 9, senior: 0 };
const CX_POINTS = { 1: 20, 2: 16, 3: 10, 4: 4, 5: 0 };

function skillsPoints(n) { return n <= 1 ? 20 : n === 2 ? 17 : n === 3 ? 13 : n === 4 ? 8 : 4; }

function budgetFactor(o) {
  const b = o.budget;
  if (!b) return { pts: 8, key: 'unknown' };
  const top = b.type === 'hourly' ? (b.max || b.min) * 20 : (b.max || b.min); // ~20 h para estimar alcance
  if (top <= 150) return { pts: 15, key: 'small' };
  if (top <= 600) return { pts: 12, key: 'medium' };
  if (top <= 2000) return { pts: 7, key: 'large' };
  return { pts: 2, key: 'xl' };
}

export function beginnerFit(o) {
  const n = o.skills.length;
  const bf = budgetFactor(o);
  const factors = [
    { key: 'experience', pts: EXP_POINTS[o.experience] ?? 12, max: 30, reason: t('fit.exp.' + o.experience) },
    { key: 'skills', pts: skillsPoints(n), max: 20, reason: t('fit.skills', { n }) },
    { key: 'complexity', pts: CX_POINTS[o.complexity] ?? 10, max: 20, reason: t('fit.cx.' + o.complexity) },
    { key: 'budget', pts: bf.pts, max: 15, reason: t('fit.budget.' + bf.key) },
    { key: 'portfolio', pts: o.portfolioRequired ? 3 : 15, max: 15, reason: t(o.portfolioRequired ? 'fit.pf.yes' : 'fit.pf.no') },
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.pts, 0)));
  const band = score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low';
  return { score, band, factors };
}

const norm = (s) => String(s).trim().toLowerCase();

export function skillMatch(o, profile) {
  const mine = new Set((profile.skills || []).map(norm));
  const matched = o.skills.filter((s) => mine.has(norm(s)));
  const missing = o.skills.filter((s) => !mine.has(norm(s)));
  return { matched, missing, ratio: o.skills.length ? matched.length / o.skills.length : 0 };
}

// Free: orden por adecuación general. Pro: mezcla con coincidencia con tu perfil.
export function recommend(opps, profile, pro) {
  return opps
    .map((o) => {
      const fit = beginnerFit(o).score;
      const m = skillMatch(o, profile);
      const inServices = (profile.services || []).includes(o.category);
      const rank = pro ? fit * 0.55 + m.ratio * 35 + (inServices ? 10 : 0) : fit;
      return { opp: o, fit, match: m, rank };
    })
    .sort((a, b) => b.rank - a.rank);
}

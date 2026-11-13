import { h, icon } from '../ui.js';
import { t, loc } from '../i18n.js';
import * as store from '../store.js';
import { ctx, navigate } from '../ctx.js';
import { CONFIG } from '../config.js';
import { CATEGORIES, LEVELS } from '../data/catalog.js';
import { beginnerFit, recommend } from '../scoring.js';
import { oppCard, openOppSheet, select, field, lockedBanner, daysSince, emptyState, badge } from '../components.js';

// Los filtros viven a nivel de módulo para sobrevivir a re-renderizados.
const F = { q: '', cat: '', sort: 'rec', budget: '', diff: '', exp: '', posted: '', fit: '' };
const BUDGETS = { b1: [0, 100], b2: [100, 300], b3: [300, 1000], b4: [1000, Infinity] };

function topBudget(o) {
  const b = o.budget;
  if (!b) return null;
  return b.type === 'hourly' ? (b.max || b.min) * 20 : (b.max || b.min);
}

function matches(o, pro) {
  const q = F.q.trim().toLowerCase();
  if (q) {
    const hay = `${loc(o.title)} ${loc(o.description)} ${o.skills.join(' ')} ${o.client || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (F.cat && o.category !== F.cat) return false;
  if (!pro) return true;
  if (F.budget) {
    const top = topBudget(o);
    if (F.budget === 'unknown') { if (top !== null) return false; }
    else { if (top === null) return false; const [lo, hi] = BUDGETS[F.budget]; if (top < lo || top > hi) return false; }
  }
  if (F.diff === 'easy' && o.complexity > 2) return false;
  if (F.diff === 'medium' && o.complexity !== 3) return false;
  if (F.diff === 'hard' && o.complexity < 4) return false;
  if (F.exp && o.experience !== F.exp) return false;
  if (F.posted && daysSince(o.postedAt) > Number(F.posted)) return false;
  if (F.fit && beginnerFit(o).score < Number(F.fit)) return false;
  return true;
}

export function renderFinder() {
  const pro = store.isPro();
  const limit = CONFIG.FREE_LIMITS.opportunitiesVisible;
  if (!pro) { F.budget = ''; F.diff = ''; F.exp = ''; F.posted = ''; F.fit = ''; }

  const results = h('div', { class: 'grid' });
  const count = h('p', { class: 'muted small' });
  const any = (label) => ({ v: '', l: label });

  function apply() {
    let list = ctx.opps.filter((o) => matches(o, pro));
    if (F.sort === 'new') list = [...list].sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
    else if (F.sort === 'fit') list = [...list].sort((a, b) => beginnerFit(b).score - beginnerFit(a).score);
    else list = recommend(list, store.getState().profile, pro).map((r) => r.opp);

    const visible = pro ? list : list.slice(0, limit);
    count.textContent = t('finder.count', { n: list.length });
    if (ctx.loading) { results.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })); return; }
    if (!list.length) { results.replaceChildren(emptyState('finder.empty.title', 'finder.empty.text')); return; }
    results.replaceChildren(
      ...visible.map((o) => oppCard(o, { onOpen: openOppSheet })),
      !pro && list.length > limit
        ? h('div', { class: 'card teaser' }, icon('lock', 22), h('h3', null, t('finder.more', { n: list.length - limit })), h('p', { class: 'muted' }, t('finder.more.text')),
          h('button', { class: 'btn primary', onclick: () => navigate('plans') }, t('plans.see'))) : null);
  }

  const search = h('input', { class: 'input search', type: 'search', placeholder: t('finder.search'), value: F.q, 'aria-label': t('finder.search'), oninput: (e) => { F.q = e.target.value; apply(); } });
  const catSel = select([any(t('filter.all')), ...CATEGORIES.map((c) => ({ v: c, l: t('cat.' + c) }))], F.cat, (v) => { F.cat = v; apply(); });
  const sortSel = select([{ v: 'rec', l: t('sort.rec') }, { v: 'new', l: t('sort.new') }, { v: 'fit', l: t('sort.fit') }], F.sort, (v) => { F.sort = v; apply(); });

  const adv = (label, options, key) => field(label, select(options, F[key], (v) => { F[key] = v; apply(); }, { disabled: !pro }));
  const advanced = h('details', { class: 'card adv', open: pro ? '' : null },
    h('summary', null, icon('sliders', 18), t('finder.advanced'), badge('PRO', 'pro')),
    pro ? null : lockedBanner('finder.advanced.locked'),
    h('div', { class: 'adv-grid' },
      adv(t('filter.budget'), [any(t('filter.all')), { v: 'b1', l: '< 100 €' }, { v: 'b2', l: '100–300 €' }, { v: 'b3', l: '300–1000 €' }, { v: 'b4', l: '> 1000 €' }, { v: 'unknown', l: t('opp.budget.unknown') }], 'budget'),
      adv(t('filter.difficulty'), [any(t('filter.all')), { v: 'easy', l: t('diff.easy') }, { v: 'medium', l: t('diff.medium') }, { v: 'hard', l: t('diff.hard') }], 'diff'),
      adv(t('filter.experience'), [any(t('filter.all')), ...LEVELS.map((l) => ({ v: l, l: t('exp.' + l) }))], 'exp'),
      adv(t('filter.posted'), [any(t('filter.all')), { v: '3', l: t('filter.days', { n: 3 }) }, { v: '7', l: t('filter.days', { n: 7 }) }, { v: '14', l: t('filter.days', { n: 14 }) }, { v: '30', l: t('filter.days', { n: 30 }) }], 'posted'),
      adv(t('filter.fit'), [any(t('filter.all')), { v: '50', l: '≥ 50' }, { v: '70', l: '≥ 70' }, { v: '85', l: '≥ 85' }], 'fit')));

  const root = h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', null, t('finder.title')), h('p', { class: 'muted' }, t('finder.sub')))),
    h('div', { class: 'toolbar' }, search, catSel, sortSel),
    advanced,
    count,
    results,
    h('p', { class: 'muted small disclaimer' }, icon('info', 14), ' ', t('fit.disclaimer')));
  apply();
  return root;
}

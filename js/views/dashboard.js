import { h, icon } from '../ui.js';
import { t, loc } from '../i18n.js';
import * as store from '../store.js';
import { ctx, navigate } from '../ctx.js';
import { recommend } from '../scoring.js';
import { oppCard, openOppSheet, statusChip, progressBar, lockedBanner, daysSince, emptyState, chip } from '../components.js';

export function renderDashboard() {
  const st = store.getState();
  const pro = store.isPro();
  const tracked = Object.entries(st.tracker)
    .map(([id, e]) => ({ id, e, opp: ctx.opps.find((o) => o.id === id) || e.snapshot }))
    .filter((x) => x.opp);
  const saved = tracked.filter((x) => x.e.status === 'saved');
  const sent = tracked.filter((x) => x.e.dates.sent).length;
  const replied = tracked.filter((x) => x.e.dates.replied).length;
  const won = tracked.filter((x) => x.e.status === 'won').length;
  const untracked = ctx.opps.filter((o) => !st.tracker[o.id]);
  const fresh = untracked.filter((o) => daysSince(o.postedAt) <= 7).sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  const recs = recommend(untracked, st.profile, pro).slice(0, 3);

  const milestones = [tracked.length >= 1, Object.keys(st.drafts).length >= 1, sent >= 1, replied >= 1, won >= 1];
  const done = milestones.filter(Boolean).length;
  const nextIdx = milestones.findIndex((m) => !m);
  const nextRoute = ['finder', 'proposal', 'tracker', 'tracker', 'tracker'][nextIdx] || 'finder';

  const stat = (n, label, ic) => h('div', { class: 'card stat' }, h('div', { class: 'stat-ic' }, icon(ic, 18)), h('b', null, String(n)), h('span', { class: 'muted small' }, label));

  if (ctx.loading) return h('div', { class: 'view' }, h('div', { class: 'skeleton tall' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));

  return h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' },
      h('div', null, h('h1', null, t('dash.hello', { name: st.profile.name || '' })), h('p', { class: 'muted' }, t('dash.sub')))),
    h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        h('div', null, h('span', { class: 'eyebrow' }, t('dash.progress')), h('h2', null, done === 5 ? t('dash.next.done') : t('dash.next.' + nextIdx))),
        h('div', { class: 'hero-count' }, h('b', null, `${done}/5`))),
      progressBar(done, 5),
      h('ol', { class: 'steps' }, [0, 1, 2, 3, 4].map((i) => h('li', { class: milestones[i] ? 'on' : '' }, milestones[i] ? icon('check', 14) : null, t('dash.m.' + i)))),
      done < 5 ? h('button', { class: 'btn primary', onclick: () => navigate(nextRoute) }, t('dash.cta.' + nextIdx), icon('arrow', 18)) : null),
    h('section', { class: 'stats' },
      stat(fresh.length, t('dash.stat.new'), 'spark'),
      stat(saved.length, t('dash.stat.saved'), 'bookmark'),
      stat(sent, t('dash.stat.sent'), 'file'),
      stat(replied, t('dash.stat.replied'), 'check')),
    h('section', null,
      h('div', { class: 'section-head' }, h('h2', null, t('dash.rec')), h('button', { class: 'link-btn', onclick: () => navigate('finder') }, t('common.seeAll'), icon('arrow', 16))),
      recs.length
        ? h('div', { class: 'grid' }, recs.map((r) => h('div', { class: 'rec' },
          oppCard(r.opp, { onOpen: openOppSheet }),
          pro && r.match.matched.length ? h('p', { class: 'why' }, icon('spark', 14), ' ', t('dash.why', { skills: r.match.matched.join(', ') })) : null)))
        : emptyState('dash.empty.title', 'dash.empty.text'),
      pro ? null : lockedBanner('dash.rec.locked')),
    fresh.length ? h('section', null,
      h('div', { class: 'section-head' }, h('h2', null, t('dash.new'))),
      h('div', { class: 'grid' }, fresh.slice(0, 4).map((o) => oppCard(o, { onOpen: openOppSheet })))) : null,
    h('section', null,
      h('div', { class: 'section-head' }, h('h2', null, t('dash.saved')), saved.length ? h('button', { class: 'link-btn', onclick: () => navigate('tracker') }, t('common.seeAll'), icon('arrow', 16)) : null),
      saved.length
        ? h('div', { class: 'rows' }, saved.slice(0, 5).map((x) => h('button', { class: 'row-card', onclick: () => openOppSheet(x.opp) },
          h('span', { class: 'row-title' }, loc(x.opp.title)), statusChip(x.e.status), icon('arrow', 16))))
        : h('p', { class: 'muted' }, t('dash.saved.empty'))),
    won ? h('div', { class: 'card win' }, icon('check', 20), h('b', null, t('dash.won', { n: won })), chip('🎉', 'ghost')) : null);
}

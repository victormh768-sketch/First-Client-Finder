import { h, icon, openSheet, toast, confirmSheet } from '../ui.js';
import { t, loc } from '../i18n.js';
import * as store from '../store.js';
import { ctx, navigate } from '../ctx.js';
import { CONFIG } from '../config.js';
import { statusChip, select, lockedBanner, fmtDate, emptyState, chip, openOppSheet } from '../components.js';

let filter = 'all';

const entries = () => Object.entries(store.getState().tracker)
  .map(([id, e]) => ({ id, e, opp: ctx.opps.find((o) => o.id === id) || e.snapshot }))
  .filter((x) => x.opp)
  .sort((a, b) => (b.e.updatedAt || '').localeCompare(a.e.updatedAt || ''));

const isOverdue = (e) => store.isPro() && e.followUpAt && e.followUpAt < new Date().toISOString().slice(0, 10) && !['won', 'lost'].includes(e.status);

export function renderTracker() {
  const all = entries();
  const counts = {};
  all.forEach((x) => { counts[x.e.status] = (counts[x.e.status] || 0) + 1; });
  const list = filter === 'all' ? all : all.filter((x) => x.e.status === filter);

  const chips = h('div', { class: 'filter-chips', role: 'tablist' },
    ['all', ...store.STATUSES.filter((s) => counts[s])].map((s) => h('button', {
      class: 'pick' + (filter === s ? ' on' : ''), role: 'tab', 'aria-selected': String(filter === s),
      onclick: () => { filter = s; ctx.rerender(); },
    }, s === 'all' ? `${t('filter.all')} (${all.length})` : `${t('status.' + s)} (${counts[s]})`)));

  return h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', null, t('tracker.title')), h('p', { class: 'muted' }, t('tracker.sub')))),
    all.length ? chips : null,
    all.length
      ? h('div', { class: 'grid' }, list.map((x) => h('article', { class: 'card track', tabindex: '0', role: 'button', onclick: () => openTrackSheet(x.id), onkeydown: (ev) => { if (ev.key === 'Enter') openTrackSheet(x.id); } },
        h('div', { class: 'opp-top' }, statusChip(x.e.status), isOverdue(x.e) ? chip(t('tracker.overdue'), 'warn') : null, x.opp.isDemo ? chip('DEMO', 'demo') : null),
        h('h3', null, loc(x.opp.title)),
        h('div', { class: 'opp-meta' },
          h('span', null, icon('clock', 14), ' ', fmtDate(x.e.updatedAt)),
          h('span', null, icon('list', 14), ' ', t('tracker.notes', { n: x.e.notes.length })),
          x.e.followUpAt ? h('span', null, icon('bookmark', 14), ' ', fmtDate(x.e.followUpAt)) : null))))
      : emptyState('tracker.empty.title', 'tracker.empty.text', h('button', { class: 'btn primary', onclick: () => navigate('finder') }, t('nav.finder'))));
}

export function openTrackSheet(id) {
  openSheet((close) => {
    const box = h('div', { class: 'stack' });
    const paint = () => {
      const x = entries().find((y) => y.id === id);
      if (!x) { close(); ctx.rerender(); return; }
      const pro = store.isPro();
      const limit = CONFIG.FREE_LIMITS.notesPerOpportunity;
      const noteInput = h('textarea', { class: 'input', rows: '3', maxlength: '600', placeholder: t('tracker.note.ph'), 'aria-label': t('tracker.note.ph') });
      const canNote = pro || x.e.notes.length < limit;
      box.replaceChildren(
        h('h3', { class: 'sheet-title' }, loc(x.opp.title)),
        x.opp.isDemo ? chip('DEMO', 'demo') : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('tracker.status')),
          select(store.STATUSES.map((s) => ({ v: s, l: t('status.' + s) })), x.e.status, (v) => { store.setStatus(id, v); paint(); ctx.rerender(); })),
        h('div', null, h('h4', null, t('tracker.dates')),
          h('ul', { class: 'list' }, store.STATUSES.filter((s) => x.e.dates[s]).map((s) => h('li', null, `${t('status.' + s)}: ${fmtDate(x.e.dates[s])}`)))),
        h('div', null, h('h4', null, t('tracker.followup'), pro ? null : icon('lock', 14)),
          pro
            ? h('input', { class: 'input', type: 'date', value: x.e.followUpAt || '', onchange: (ev) => { store.setFollowUp(id, ev.target.value); paint(); ctx.rerender(); } })
            : lockedBanner('tracker.followup.locked')),
        h('div', null, h('h4', null, t('tracker.notes.title')),
          x.e.notes.length ? h('ul', { class: 'notes' }, x.e.notes.map((n) => h('li', null,
            h('p', null, n.text), h('div', { class: 'row between' }, h('span', { class: 'muted small' }, fmtDate(n.at)),
              h('button', { class: 'icon-btn', 'aria-label': t('common.delete'), onclick: () => { store.removeNote(id, n.id); paint(); } }, icon('trash', 16)))))) : h('p', { class: 'muted small' }, t('tracker.notes.empty')),
          canNote
            ? h('div', { class: 'stack tight' }, noteInput, h('button', { class: 'btn ghost', onclick: () => { if (noteInput.value.trim()) { store.addNote(id, noteInput.value); paint(); ctx.rerender(); } } }, icon('plus', 18), t('tracker.note.add')))
            : lockedBanner('tracker.notes.locked')),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn ghost', onclick: () => { close(); openOppSheet(x.opp); } }, t('tracker.view')),
          h('button', { class: 'btn primary', onclick: () => { close(); navigate('proposal?opp=' + encodeURIComponent(id)); } }, icon('file', 18), t('opp.prepare')),
          h('button', { class: 'btn danger', onclick: async () => { if (await confirmSheet({ title: t('tracker.remove'), message: t('tracker.remove.msg'), confirmLabel: t('common.delete'), danger: true })) { store.untrack(id); close(); ctx.rerender(); toast(t('toast.removed')); } } }, icon('trash', 18), t('tracker.remove'))));
    };
    paint();
    return box;
  }, { title: t('tracker.detail'), wide: true });
}

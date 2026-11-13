import { h, icon, toast, confirmSheet } from '../ui.js';
import { t, loc, getLang } from '../i18n.js';
import * as store from '../store.js';
import { ctx, navigate } from '../ctx.js';
import { CONFIG } from '../config.js';
import { analyze, generate } from '../proposal.js';
import { beginnerFit } from '../scoring.js';
import { chip, field, select, lockedBanner, emptyState, safeUrl } from '../components.js';

let selected = '';
let tone = 'professional';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

export function renderProposal(params) {
  const q = params.get('opp');
  if (q) selected = q;
  const st = store.getState();
  const lang = getLang();
  const limit = CONFIG.FREE_LIMITS.proposalsPerMonth;
  const pro = store.isPro();

  const trackedIds = Object.keys(st.tracker);
  const pool = [...trackedIds.map((id) => ctx.opps.find((o) => o.id === id) || st.tracker[id].snapshot).filter(Boolean),
    ...ctx.opps.filter((o) => !st.tracker[o.id])];
  const opp = pool.find((o) => o.id === selected) || null;

  const root = h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', null, t('prop.title')), h('p', { class: 'muted' }, t('prop.sub')))),
    h('div', { class: 'notice' }, icon('shield', 18), h('span', null, t('prop.never'))));

  if (ctx.loading) { root.append(h('div', { class: 'skeleton' })); return root; }
  if (!pool.length) { root.append(emptyState('prop.empty.title', 'prop.empty.text')); return root; }

  const options = [{ v: '', l: t('prop.choose') }, ...pool.map((o) => ({ v: o.id, l: (st.tracker[o.id] ? '★ ' : '') + loc(o.title) }))];
  root.append(field(t('prop.select'), select(options, selected, (v) => { selected = v; ctx.rerender(); })));

  if (!opp) return root;

  const a = analyze(opp, st.profile, lang);
  const fit = beginnerFit(opp);
  const draft = st.drafts[opp.id];
  const used = store.proposalsUsed();

  root.append(
    h('section', { class: 'card' },
      h('h2', null, t('prop.analysis')),
      h('p', { class: 'muted small' }, t('prop.analysis.sub', { score: fit.score })),
      a.needs.length ? h('div', null, h('h4', null, t('opp.needs')), h('ul', { class: 'list' }, a.needs.map((n) => h('li', null, n)))) : null,
      h('div', null, h('h4', null, t('prop.match')),
        h('div', { class: 'chips' }, a.matched.map((s) => chip(s, 'ok')), a.missing.map((s) => chip(s, 'warn')))),
      a.flags.length ? h('div', { class: 'flags' }, a.flags.map((f) => h('p', { class: 'flag' }, icon('info', 14), ' ', t('prop.flag.' + f, { skills: a.missing.join(', ') })))) : null,
      a.questions.length ? h('div', null, h('h4', null, t('prop.questions')), h('ul', { class: 'list' }, a.questions.map((x) => h('li', null, x)))) : null),
    h('section', { class: 'card' },
      h('h2', null, t('prop.write')),
      h('div', { class: 'seg', role: 'tablist', 'aria-label': t('prop.tone') },
        ['professional', 'friendly', 'direct'].map((k) => h('button', { class: tone === k ? 'on' : '', role: 'tab', 'aria-selected': String(tone === k), onclick: () => { tone = k; ctx.rerender(); } }, t('tone.' + k)))),
      pro ? null : h('p', { class: 'muted small' }, t('prop.quota', { used, limit })),
      store.canGenerateProposal(opp.id, limit)
        ? h('button', { class: 'btn primary', onclick: () => {
          const text = generate(opp, st.profile, tone, lang);
          store.registerProposal(opp.id);
          store.saveDraft(opp.id, { text, tone });
          const tr = store.getState().tracker[opp.id];
          if (!tr) store.track(opp, 'preparing');
          else if (['new', 'saved'].includes(tr.status)) store.setStatus(opp.id, 'preparing');
          ctx.rerender();
        } }, icon('spark', 18), draft ? t('prop.regenerate') : t('prop.generate'))
        : lockedBanner('prop.limit'),
      draft ? editor(opp, draft) : h('p', { class: 'muted small' }, t('prop.hint'))));
  return root;
}

function editor(opp, draft) {
  const ta = h('textarea', { class: 'input editor', rows: '16', 'aria-label': t('prop.editor'), oninput: (e) => store.saveDraft(opp.id, { text: e.target.value, tone: draft.tone }) }, draft.text);
  const url = safeUrl(opp.sourceUrl);
  return h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, icon('info', 14), ' ', t('prop.review')),
    ta,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: async () => toast((await copyText(ta.value)) ? t('toast.copied') : t('toast.copyfail'), 'ok') }, icon('copy', 18), t('prop.copy')),
      url ? h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 18), t('prop.openSource')) : null,
      h('button', { class: 'btn ghost', onclick: async () => {
        if (await confirmSheet({ title: t('prop.markSent'), message: t('prop.markSent.msg') })) { store.setStatus(opp.id, 'sent'); toast(t('toast.sent')); navigate('tracker'); }
      } }, icon('check', 18), t('prop.markSent'))));
}

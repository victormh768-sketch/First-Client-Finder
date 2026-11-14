import { h, icon, toast, confirmSheet } from '../ui.js';
import { t, setLang, getLang, LANGS } from '../i18n.js';
import * as store from '../store.js';
import { ctx, navigate } from '../ctx.js';
import * as cloud from '../supabase.js';
import { chip, field, progressBar, badge, safeUrl } from '../components.js';

export function renderProfile() {
  const st = store.getState();
  const p = st.profile;
  const pro = store.isPro();
  const tracked = Object.values(st.tracker);
  const sent = tracked.filter((e) => e.dates.sent).length;
  const won = tracked.filter((e) => e.status === 'won').length;
  const url = safeUrl(p.portfolioUrl);

  const section = (title, ...kids) => h('section', { class: 'card' }, h('h3', null, title), ...kids);

  return h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', null, t('profile.title')))),
    h('section', { class: 'card profile-head' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, (p.name || '?').trim().charAt(0).toUpperCase()),
      h('div', { class: 'grow' }, h('h2', null, p.name || '—'), h('p', { class: 'muted' }, t('level.' + p.level)),
        h('div', { class: 'chips' }, badge(pro ? 'PRO' : 'FREE', pro ? 'pro' : ''))),
      h('button', { class: 'btn ghost', onclick: () => navigate('onboarding?edit=1') }, t('profile.edit'))),
    section(t('profile.progress'),
      h('div', { class: 'stats mini' },
        h('div', null, h('b', null, String(tracked.length)), h('span', { class: 'muted small' }, t('profile.tracked'))),
        h('div', null, h('b', null, String(sent)), h('span', { class: 'muted small' }, t('dash.stat.sent'))),
        h('div', null, h('b', null, String(won)), h('span', { class: 'muted small' }, t('profile.won')))),
      progressBar(won ? 5 : Math.min(4, (tracked.length ? 1 : 0) + (sent ? 1 : 0) + (tracked.some((e) => e.dates.replied) ? 1 : 0) + (Object.keys(st.drafts).length ? 1 : 0)), 5)),
    section(t('profile.skills'), h('div', { class: 'chips' }, p.skills.length ? p.skills.map((s) => chip(s)) : h('span', { class: 'muted' }, '—'))),
    section(t('profile.services'), h('div', { class: 'chips' }, p.services.length ? p.services.map((s) => chip(t('cat.' + s))) : h('span', { class: 'muted' }, '—'))),
    section(t('profile.portfolio'), p.hasPortfolio
      ? (url ? h('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' }, url, ' ', icon('external', 14)) : h('span', { class: 'muted' }, t('profile.portfolio.nourl')))
      : h('span', { class: 'muted' }, t('profile.portfolio.none'))),
    section(t('profile.goals'), h('div', { class: 'chips' }, p.goals.map((g) => chip(t('goal.' + g))))),
    h('section', { class: 'card plan-card' },
      h('div', { class: 'grow' }, h('h3', null, t('profile.plan')), h('p', { class: 'muted' }, pro ? t('plans.pro.active') : t('plans.free.active'))),
      h('button', { class: 'btn primary', onclick: () => navigate('plans') }, t('plans.see'))),
    section(t('profile.language'), h('div', { class: 'picks' }, LANGS.map((l) => h('button', { class: 'pick' + (getLang() === l.code ? ' on' : ''), onclick: () => { setLang(l.code); ctx.rerender(); } }, l.label)))),
    accountSection(),
    cloud.isConfigured() && ctx.user ? section(t('co.link.title'), h('p', { class: 'muted small' }, t('co.link.sub')), h('button', { class: 'btn ghost', onclick: () => navigate('company') }, icon('target', 18), t('co.link.btn'))) : null,
    section(t('profile.data'),
      h('p', { class: 'muted small' }, t('profile.data.sub')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost', onclick: exportJson }, icon('download', 18), t('profile.export')),
        h('button', { class: 'btn danger', onclick: wipe }, icon('trash', 18), t('profile.delete'))),
      h('a', { class: 'link', href: 'privacy.html', target: '_blank', rel: 'noopener' }, t('profile.privacy'), ' ', icon('external', 14))));
}

function accountSection() {
  const title = h('h3', null, t('account.title'));
  if (!cloud.isConfigured()) {
    return h('section', { class: 'card' }, title, h('p', { class: 'muted small' }, icon('info', 14), ' ', t('account.local')));
  }
  if (ctx.user) {
    return h('section', { class: 'card' }, title,
      h('p', null, t('account.signedin', { email: ctx.user.email })),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost', onclick: async () => { await cloud.signOut(); ctx.user = null; ctx.isAdmin = false; ctx.rerender(); } }, t('account.signout')),
        ctx.isAdmin ? h('button', { class: 'btn ghost', onclick: () => navigate('admin') }, t('admin.link')) : null));
  }
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', minlength: '8', required: true });
  const run = (fn, okKey) => async (e) => {
    e.preventDefault();
    try { await fn(email.value.trim(), pass.value); toast(t(okKey)); } catch (err) { toast(err.message || t('account.error'), 'err'); }
  };
  return h('section', { class: 'card' }, title,
    h('p', { class: 'muted small' }, t('account.sub')),
    h('form', { class: 'stack', onsubmit: run(cloud.signIn, 'account.ok.in') },
      field(t('account.email'), email), field(t('account.password'), pass, t('account.password.hint')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', type: 'submit' }, t('account.signin')),
        h('button', { class: 'btn ghost', type: 'button', onclick: run(cloud.signUp, 'account.ok.up') }, t('account.signup')))));
}

function exportJson() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'first-client-finder-data.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function wipe() {
  if (!(await confirmSheet({ title: t('profile.delete'), message: t('profile.delete.msg'), confirmLabel: t('common.delete'), danger: true }))) return;
  if (ctx.user) { try { await cloud.deleteMyData(ctx.user); } catch { /* sin red */ } }
  store.resetAll();
  toast(t('toast.deleted'));
  navigate('onboarding');
}

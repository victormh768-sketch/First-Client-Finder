// Punto de entrada: router por hash, shell (sidebar + barra inferior) y carga de datos.
import { h, icon, toast } from './ui.js';
import { t, getLang, initLang } from './i18n.js';
import * as store from './store.js';
import { ctx, navigate, currentRoute } from './ctx.js';
import { loadOpportunities } from './sources/index.js';
import * as cloud from './supabase.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderDashboard } from './views/dashboard.js';
import { renderFinder } from './views/finder.js';
import { renderTracker } from './views/tracker.js';
import { renderProposal } from './views/proposal.js';
import { renderProfile } from './views/profile.js';
import { renderPlans } from './views/plans.js';
import { renderAdmin } from './views/admin.js';

const NAV = [
  { id: 'dashboard', icon: 'home', render: renderDashboard },
  { id: 'finder', icon: 'search', render: renderFinder },
  { id: 'tracker', icon: 'list', render: renderTracker },
  { id: 'proposal', icon: 'file', render: renderProposal },
  { id: 'profile', icon: 'user', render: renderProfile },
];
const EXTRA = { plans: renderPlans, admin: renderAdmin }; // 'admin' no aparece en la navegación

let lastRoute = null;

function shell(route, view) {
  const st = store.getState();
  const pro = store.isPro();
  const active = route === 'plans' || route === 'admin' ? 'profile' : route;
  const link = (n, cls) => h('a', { href: '#/' + n.id, class: `${cls}${active === n.id ? ' active' : ''}`, 'aria-current': active === n.id ? 'page' : null },
    icon(n.icon, 22), h('span', null, t('nav.' + n.id)));

  return h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' },
      h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'logo' }, icon('target', 20)), h('b', null, 'First Client Finder')),
      h('nav', { 'aria-label': 'Principal' }, NAV.map((n) => link(n, 'nav-link'))),
      h('a', { class: 'plan-chip', href: '#/plans' }, h('span', { class: 'badge ' + (pro ? 'pro' : '') }, pro ? 'PRO' : 'FREE'), h('span', null, pro ? t('plans.pro.active') : t('side.upgrade')))),
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'logo' }, icon('target', 18)), h('b', null, 'First Client Finder')),
      h('a', { class: 'badge ' + (pro ? 'pro' : ''), href: '#/plans' }, pro ? 'PRO' : 'FREE')),
    h('main', { id: 'main', tabindex: '-1' }, view),
    h('nav', { class: 'bottomnav', 'aria-label': 'Principal' }, NAV.map((n) => link(n, 'tab'))));
}

function render() {
  const { route, params } = currentRoute();
  const root = document.getElementById('root');
  const st = store.getState();

  if (route === 'privacy') { location.href = 'privacy.html'; return; }
  if (!st.onboarded && route !== 'onboarding') { navigate('onboarding'); return; }

  let view;
  try {
    if (route === 'onboarding') {
      root.replaceChildren(renderOnboarding(params));
    } else {
      const r = NAV.find((n) => n.id === route)?.render || EXTRA[route];
      if (!r) { navigate('dashboard'); return; }
      view = r(params);
      root.replaceChildren(shell(route, view));
    }
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'view' }, h('div', { class: 'card empty' }, h('h2', null, t('error.title')), h('p', { class: 'muted' }, t('error.text')),
      h('button', { class: 'btn primary', onclick: () => { location.hash = '#/dashboard'; location.reload(); } }, t('error.reload')))));
  }
  if (lastRoute !== route) { window.scrollTo(0, 0); lastRoute = route; }
  document.documentElement.lang = getLang();
  document.title = 'First Client Finder';
}

async function initCloud() {
  if (!cloud.isConfigured()) return;
  try {
    ctx.user = await cloud.getUser();
    ctx.isAdmin = await cloud.isAdmin(ctx.user).catch(() => false);
    store.setSyncer(async (type, id) => {
      if (!ctx.user) return;
      if (type === 'profile') await cloud.pushProfile(ctx.user, store.getState());
      else if (type === 'tracked') await cloud.pushTracked(ctx.user, id, store.getState().tracker[id]);
      else if (type === 'untracked') await cloud.pushTracked(ctx.user, id, null);
    });
    const sync = async () => {
      const remote = await cloud.pull(ctx.user);
      if (remote) store.mergeRemote(remote);
      const s = store.getState();
      if (s.onboarded && !remote?.profile) await cloud.pushProfile(ctx.user, s);
    };
    if (ctx.user) await sync();
    cloud.onAuthChange(async (user) => {
      ctx.user = user;
      ctx.isAdmin = user ? await cloud.isAdmin(user).catch(() => false) : false;
      if (user) { try { await sync(); } catch (e) { console.warn(e); } }
      render();
    });
  } catch (e) { console.warn('[cloud]', e); toast(t('error.cloud'), 'err'); }
}

async function boot() {
  initLang();
  ctx.rerender = render;
  window.addEventListener('hashchange', render);
  store.subscribe(() => { /* las vistas se redibujan bajo demanda con ctx.rerender() */ });
  render();
  await initCloud();
  ctx.opps = await loadOpportunities();
  ctx.loading = false;
  document.getElementById('boot')?.remove();
  render();
}

boot();

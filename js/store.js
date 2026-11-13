// Estado de la app: localStorage + gancho opcional de sincronización con la nube.
const KEY = 'fcf:v1';
export const STATUSES = ['new', 'saved', 'preparing', 'sent', 'replied', 'won', 'lost'];

const now = () => new Date().toISOString();
const hasLS = () => { try { return typeof localStorage !== 'undefined'; } catch { return false; } };

const defaults = () => ({
  lang: null,
  onboarded: false,
  profile: { name: '', skills: [], level: 'none', services: [], hasPortfolio: false, portfolioUrl: '', goals: [] },
  tracker: {},
  drafts: {},
  plan: 'free',
  usage: { month: '', proposals: [] },
});

function load() {
  try {
    if (hasLS()) {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = defaults();
        const s = JSON.parse(raw);
        return { ...d, ...s, profile: { ...d.profile, ...(s.profile || {}) } };
      }
    }
  } catch { /* datos corruptos: empezamos limpio */ }
  return defaults();
}

let state = load();
const subs = new Set();
let syncer = null;

function persist() { try { if (hasLS()) localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* cuota */ } }
function emit(type, id) { try { syncer && syncer(type, id); } catch { /* sin red */ } }

export const getState = () => state;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const setSyncer = (fn) => { syncer = fn; };

export function update(mutator) {
  mutator(state);
  persist();
  subs.forEach((f) => f(state));
}

// ---- idioma / perfil ----
export function setLangState(code) { update((s) => { s.lang = code; }); }

export function saveProfile(profile, { finish = false } = {}) {
  update((s) => {
    s.profile = { ...s.profile, ...profile };
    if (finish) s.onboarded = true;
  });
  emit('profile');
}

// ---- tracker ----
const snap = (o) => JSON.parse(JSON.stringify(o));

export function track(opp, status) {
  update((s) => {
    const e = s.tracker[opp.id] || { status: 'new', notes: [], dates: {}, createdAt: now(), followUpAt: '', snapshot: snap(opp) };
    e.status = status;
    e.dates[status] = now();
    e.updatedAt = now();
    s.tracker[opp.id] = e;
  });
  emit('tracked', opp.id);
}

export function setStatus(id, status) {
  update((s) => {
    const e = s.tracker[id];
    if (!e) return;
    e.status = status;
    e.dates[status] = now();
    e.updatedAt = now();
  });
  emit('tracked', id);
}

export function untrack(id) {
  update((s) => { delete s.tracker[id]; });
  emit('untracked', id);
}

export function addNote(id, text) {
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) return;
  update((s) => {
    const e = s.tracker[id];
    if (!e) return;
    e.notes.push({ id: Math.random().toString(36).slice(2, 9), text: clean, at: now() });
    e.updatedAt = now();
  });
  emit('tracked', id);
}

export function removeNote(id, noteId) {
  update((s) => {
    const e = s.tracker[id];
    if (!e) return;
    e.notes = e.notes.filter((n) => n.id !== noteId);
    e.updatedAt = now();
  });
  emit('tracked', id);
}

export function setFollowUp(id, date) {
  update((s) => {
    const e = s.tracker[id];
    if (!e) return;
    e.followUpAt = date || '';
    e.updatedAt = now();
  });
  emit('tracked', id);
}

// ---- plan y cuotas ----
export const isPro = () => state.plan === 'pro';
export function setPlan(plan) { update((s) => { s.plan = plan === 'pro' ? 'pro' : 'free'; }); }

const monthKey = () => new Date().toISOString().slice(0, 7);

export function proposalsUsed() {
  return state.usage.month === monthKey() ? state.usage.proposals.length : 0;
}

export function canGenerateProposal(oppId, limit) {
  if (isPro()) return true;
  if (state.usage.month === monthKey() && state.usage.proposals.includes(oppId)) return true;
  return proposalsUsed() < limit;
}

export function registerProposal(oppId) {
  update((s) => {
    if (s.usage.month !== monthKey()) s.usage = { month: monthKey(), proposals: [] };
    if (!s.usage.proposals.includes(oppId)) s.usage.proposals.push(oppId);
  });
}

export function saveDraft(oppId, draft) {
  update((s) => { s.drafts[oppId] = { ...draft, at: now() }; });
}

// ---- nube ----
export function mergeRemote({ profile, tracker, plan }) {
  update((s) => {
    if (profile && !s.onboarded) { s.profile = { ...s.profile, ...profile }; s.onboarded = true; }
    for (const [id, r] of Object.entries(tracker || {})) {
      const l = s.tracker[id];
      if (!l || (r.updatedAt || '') > (l.updatedAt || '')) s.tracker[id] = r;
    }
    if (plan === 'pro') s.plan = 'pro';
  });
}

// ---- datos del usuario ----
export function exportData() { return JSON.stringify(state, null, 2); }

export function resetAll() {
  const lang = state.lang;
  state = defaults();
  state.lang = lang;
  persist();
  subs.forEach((f) => f(state));
}

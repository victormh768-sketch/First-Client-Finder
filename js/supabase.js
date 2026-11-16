// Capa de acceso a Supabase (auth + base de datos). Si no hay claves en config.js,
// la app funciona en modo local y estas funciones devuelven null/vacío.
import { CONFIG } from './config.js';

let client = null;
export const isConfigured = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export async function getClient() {
  if (!isConfigured()) return null;
  if (client) return client;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshSession: true },
  });
  return client;
}

// Comprueba que la nube responde (lectura pública de 1 fila). Devuelve { ok, error }.
export async function ping() {
  if (!isConfigured()) return { ok: false, error: 'no_config' };
  try {
    const c = await getClient();
    const { error } = await c.from('opportunities').select('id').limit(1);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

// ---- auth ----
export async function getUser() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data?.session?.user || null;
}

export async function signUp(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const c = await getClient();
  if (c) await c.auth.signOut();
}

export async function onAuthChange(cb) {
  const c = await getClient();
  if (!c) return;
  // No hacer llamadas a Supabase dentro del callback: se difiere con setTimeout.
  c.auth.onAuthStateChange((_event, session) => setTimeout(() => cb(session?.user || null), 0));
}

// ---- oportunidades (tabla curada, solo lectura) ----
export async function fetchOpportunities() {
  const c = await getClient();
  if (!c) return [];
  const { data, error } = await c.from('opportunities').select('*').eq('active', true).order('posted_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    isDemo: !!r.is_demo,
    title: r.title,
    description: r.description,
    client: r.client_name,
    budget: r.budget_min || r.budget_max ? { min: r.budget_min, max: r.budget_max, currency: r.currency || 'EUR', type: r.budget_type || 'fixed' } : null,
    skills: r.skills || [],
    category: r.category,
    experience: r.experience,
    complexity: r.complexity,
    portfolioRequired: r.portfolio_required,
    postedAt: r.posted_at,
    verifiedAt: r.verified_at,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    needs: { es: r.needs || [], en: r.needs || [] },
    platform: r.platform || r.source_name || null,
    verification: r.verification || 'unverified',
    lastCheckedAt: r.last_checked_at || null,
    reasons: r.reasons || [],
    estimated: r.estimated || [],
    ownerId: r.owner_id || null,
  }));
}

// ───────── administración (las políticas RLS lo limitan a administradores; aquí solo se consulta) ─────────
export async function isAdmin(user) {
  const c = await getClient();
  if (!c || !user) return false;
  const { data } = await c.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

export async function adminListSources() {
  const c = await getClient();
  const { data, error } = await c.from('sources').select('*').order('id');
  if (error) throw error;
  return data || [];
}

export async function adminListRuns(limit = 30) {
  const c = await getClient();
  const { data, error } = await c.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function adminSetSourceEnabled(id, enabled) {
  const c = await getClient();
  const { error } = await c.from('sources').update({ enabled }).eq('id', id);
  if (error) throw error;
}

export async function adminListOpportunities(limit = 300) {
  const c = await getClient();
  const { data, error } = await c.from('opportunities').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function adminReview(id, status, user) {
  const c = await getClient();
  const now = new Date().toISOString();
  const patch = { review_status: status, reviewed_by: user.id, reviewed_at: now };
  if (status === 'approved') Object.assign(patch, { verification: 'reviewed', verified_at: now, active: true });
  if (status === 'pending') Object.assign(patch, { duplicate_of: null, duplicate_info: null });
  const { error } = await c.from('opportunities').update(patch).eq('id', id);
  if (error) throw error;
}

export async function adminInsertManual(row) {
  const c = await getClient();
  const { error } = await c.from('opportunities').insert(row);
  if (error) throw error;
}

export async function adminRunSync(sourceId, action = 'sync') {
  const c = await getClient();
  const { data, error } = await c.functions.invoke('sync-sources', { body: { source: sourceId, force: true, action } });
  if (error) throw error;
  return data;
}

// ---- datos del usuario ----
export async function pull(user) {
  const c = await getClient();
  if (!c || !user) return null;
  const [p, t, s] = await Promise.all([
    c.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    c.from('tracked_opportunities').select('*').eq('user_id', user.id),
    c.from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle(),
  ]);
  const row = p.data;
  const tracker = {};
  for (const r of t.data || []) {
    tracker[r.opportunity_id] = {
      status: r.status, notes: r.notes || [], dates: r.dates || {}, followUpAt: r.follow_up_at || '',
      snapshot: r.snapshot || null, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }
  return {
    profile: row ? {
      name: row.display_name || '', skills: row.skills || [], level: row.level || 'none', services: row.services || [],
      hasPortfolio: !!row.has_portfolio, portfolioUrl: row.portfolio_url || '', goals: row.goals || [],
    } : null,
    tracker,
    plan: s.data?.plan || 'free',
  };
}

export async function pushProfile(user, state) {
  const c = await getClient();
  if (!c || !user) return;
  const p = state.profile;
  const { error } = await c.from('profiles').upsert({
    id: user.id, display_name: p.name, lang: state.lang, level: p.level, skills: p.skills, services: p.services,
    has_portfolio: p.hasPortfolio, portfolio_url: p.portfolioUrl, goals: p.goals, onboarded: state.onboarded,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('[pushProfile]', error.message);
}

export async function pushTracked(user, oppId, e) {
  const c = await getClient();
  if (!c || !user) return;
  if (!e) {
    await c.from('tracked_opportunities').delete().eq('user_id', user.id).eq('opportunity_id', oppId);
    return;
  }
  const { error } = await c.from('tracked_opportunities').upsert({
    user_id: user.id, opportunity_id: oppId, status: e.status, notes: e.notes, dates: e.dates,
    follow_up_at: e.followUpAt || null, snapshot: e.snapshot, updated_at: e.updatedAt || new Date().toISOString(),
  }, { onConflict: 'user_id,opportunity_id' });
  if (error) console.warn('[pushTracked]', error.message);
}

export async function deleteMyData(user) {
  const c = await getClient();
  if (!c || !user) return;
  await c.from('tracked_opportunities').delete().eq('user_id', user.id);
  await c.from('profiles').delete().eq('id', user.id);
}

// ───────── peticiones de empresas (Fase 1). La privacidad la garantizan las políticas RLS de 003_company_requests.sql ─────────
export async function getMyContact(user) {
  const c = await getClient();
  if (!c || !user) return null;
  const { data } = await c.from('company_contacts').select('*').eq('user_id', user.id).maybeSingle();
  return data || null;
}

export async function saveMyContact(user, { companyName, contactEmail }) {
  const c = await getClient();
  const { error } = await c.from('company_contacts').upsert({ user_id: user.id, company_name: companyName, contact_email: contactEmail, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listMyRequests(user) {
  const c = await getClient();
  const { data, error } = await c.from('opportunities').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createRequest(user, r) {
  const c = await getClient();
  const { error } = await c.from('opportunities').insert({
    title: r.title, description: r.description, client_name: r.companyName,
    budget_min: r.budgetMin ?? null, budget_max: r.budgetMax ?? null, currency: 'EUR', budget_type: 'fixed',
    skills: r.skills, category: r.category, experience: r.experience, complexity: r.complexity,
    portfolio_required: !!r.portfolioRequired, posted_at: new Date().toISOString(),
    source_name: 'First Client Finder', is_demo: false, owner_id: user.id, review_status: 'pending', active: true,
  });
  if (error) throw error;
}

export async function closeRequest(id) {
  const c = await getClient();
  const { error } = await c.rpc('close_my_request', { opp: id });
  if (error) throw error;
}

// Solicitudes recibidas por mis peticiones; el correo solo viene si la empresa ya aceptó (lo decide RLS).
export async function listInterestsForMyRequests(ids) {
  const c = await getClient();
  if (!ids.length) return [];
  const { data, error } = await c.from('opportunity_interests').select('*').in('opportunity_id', ids).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const accepted = rows.filter((r) => r.status === 'accepted').map((r) => r.id);
  let mails = {};
  if (accepted.length) {
    const m = await c.from('interest_contacts').select('*').in('interest_id', accepted);
    mails = Object.fromEntries((m.data || []).map((x) => [x.interest_id, x.email]));
  }
  return rows.map((r) => ({ ...r, email: mails[r.id] || null }));
}

export async function respondInterest(id, accept) {
  const c = await getClient();
  const { error } = await c.rpc('respond_interest', { interest: id, accept });
  if (error) throw error;
}

export async function getMyInterest(user, oppId) {
  const c = await getClient();
  if (!c || !user) return null;
  const { data } = await c.from('opportunity_interests').select('*').eq('opportunity_id', oppId).eq('user_id', user.id).maybeSingle();
  return data || null;
}

export async function sendInterest(user, oppId, { displayName, skills, level, portfolioUrl, message, email }) {
  const c = await getClient();
  const { data, error } = await c.from('opportunity_interests').insert({
    opportunity_id: oppId, user_id: user.id, display_name: displayName, skills, level: level || null,
    portfolio_url: portfolioUrl || null, message, status: 'pending',
  }).select('id').single();
  if (error) throw error;
  const r = await c.from('interest_contacts').insert({ interest_id: data.id, email });
  if (r.error) { await c.from('opportunity_interests').delete().eq('id', data.id); throw r.error; }
}

export async function withdrawInterest(id) {
  const c = await getClient();
  const { error } = await c.from('opportunity_interests').delete().eq('id', id);
  if (error) throw error;
}

// Contacto de la empresa: solo devuelve datos si la empresa aceptó mi solicitud.
export async function getRevealedCompanyContact(ownerId) {
  const c = await getClient();
  const { data } = await c.from('company_contacts').select('company_name,contact_email').eq('user_id', ownerId).maybeSingle();
  return data || null;
}

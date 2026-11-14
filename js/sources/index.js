// Fuentes de oportunidades. Cada fuente es un adaptador:
//   { id, name, enabled?(): boolean, async fetch(): Opportunity[] }
// Para añadir una fuente real (API oficial, feed autorizado, tabla curada):
//   1) crea un adaptador que devuelva objetos con el formato de normalize()
//   2) añádelo a SOURCES.
// No hacemos scraping indiscriminado: usa solo APIs/feeds con permiso.
import { CONFIG } from '../config.js';
import { DEMO_OPPORTUNITIES } from '../data/demo-opportunities.js';
import * as cloud from '../supabase.js';

const EXPERIENCE = ['none', 'junior', 'mid', 'senior'];

export function normalize(raw) {
  const text = (v) => (v && typeof v === 'object' ? v : String(v ?? ''));
  return {
    id: String(raw.id),
    isDemo: !!raw.isDemo,
    title: text(raw.title),
    description: text(raw.description),
    client: raw.client ? String(raw.client) : null,
    budget: raw.budget && (raw.budget.min || raw.budget.max) ? raw.budget : null,
    skills: Array.isArray(raw.skills) ? raw.skills.map(String) : [],
    category: String(raw.category || 'other'),
    experience: EXPERIENCE.includes(raw.experience) ? raw.experience : 'junior',
    complexity: Math.min(5, Math.max(1, Number(raw.complexity) || 3)),
    portfolioRequired: !!raw.portfolioRequired,
    postedAt: raw.postedAt || null,
    verifiedAt: raw.verifiedAt || null,
    sourceName: String(raw.sourceName || ''),
    sourceUrl: raw.sourceUrl || null,
    needs: raw.needs || { es: [], en: [] },
    // Campos del formato común para oportunidades importadas (las DEMO no los tienen).
    platform: raw.platform ? String(raw.platform) : null,
    verification: raw.isDemo ? null : (raw.verification || null),
    lastCheckedAt: raw.lastCheckedAt || null,
    reasons: Array.isArray(raw.reasons) ? raw.reasons.map(String) : [],
    estimated: Array.isArray(raw.estimated) ? raw.estimated.map(String) : [],
    ownerId: raw.ownerId ? String(raw.ownerId) : null,
  };
}

const demoSource = { id: 'demo', name: 'Demo', enabled: () => CONFIG.SHOW_DEMO_DATA, fetch: async () => DEMO_OPPORTUNITIES };
const curatedSource = { id: 'supabase', name: 'Curated', enabled: () => cloud.isConfigured(), fetch: () => cloud.fetchOpportunities() };

export const SOURCES = [curatedSource, demoSource];

export async function loadOpportunities() {
  const out = [];
  for (const s of SOURCES) {
    if (s.enabled && !s.enabled()) continue;
    try { out.push(...(await s.fetch()).map(normalize)); }
    catch (e) { console.warn(`[source:${s.id}]`, e); }
  }
  return out;
}

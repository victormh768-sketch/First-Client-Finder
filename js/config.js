// Configuración central. La clave "anon" de Supabase es pública por diseño:
// la seguridad real la dan las políticas RLS de supabase/schema.sql.
export const CONFIG = {
  SUPABASE_URL: 'https://zhmmnphooxbsrjuacrzp.supabase.co',      // https://xxxx.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_lGVkGzkqvceo71Om-eDoOw_lN1hLWsQ', // clave pública (anon / publishable)
  SHOW_DEMO_DATA: true,    // pon false cuando tengas fuentes reales
  FREE_LIMITS: {
    opportunitiesVisible: 8,  // oportunidades visibles en el buscador
    proposalsPerMonth: 3,     // propuestas distintas generadas por mes
    notesPerOpportunity: 2,   // notas por oportunidad en el tracker
  },
};

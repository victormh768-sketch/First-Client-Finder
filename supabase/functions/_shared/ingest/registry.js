// Registro de fuentes: metadatos legales y técnicos de cada adaptador. La tabla `sources` de Supabase
// guarda el estado (activada, última sincronización, errores); este archivo guarda lo que no cambia.
import { adapter as hn } from './adapters/hn-freelance.js';
import { adapter as remotive } from './adapters/remotive.js';
import { adapter as rss } from './adapters/rss.js';
import { adapter as jobicy } from './adapters/jobicy.js';
import { adapter as reddit } from './adapters/reddit.js';
import { adapter as linkedin } from './adapters/linkedin.js';

// legalStatus: 'open' (API pública abierta), 'terms' (permitida con condiciones), 'approval' (requiere aprobación),
//              'blocked' (sin vía autorizada).
export const SOURCES = [
  {
    id: 'hn-freelance', name: 'Hacker News · Freelancer? Seeking freelancer?', platform: 'Hacker News', adapter: hn,
    legalStatus: 'open', enabledByDefault: true, minIntervalHours: 12, maxAgeDays: 35, requires: [],
    attribution: 'Fuente: Hacker News (enlace al comentario original).',
    notes: 'API Algolia gratuita y sin clave. Solo comentarios de nivel superior; no se guarda el autor.',
  },
  {
    id: 'remotive', name: 'Remotive', platform: 'Remotive', adapter: remotive,
    legalStatus: 'terms', enabledByDefault: true, minIntervalHours: 12, maxAgeDays: 45, requires: [],
    attribution: 'Fuente: Remotive. Enlace a la oferta en remotive.com.',
    notes: 'Máx. 4 peticiones/día, 24 h de retraso, enlace y mención obligatorios. Solo freelance/contract/part-time.',
  },
  {
    id: 'jobicy', name: 'Jobicy', platform: 'Jobicy', adapter: jobicy,
    legalStatus: 'terms', enabledByDefault: false, minIntervalHours: 12, maxAgeDays: 45, requires: [], config: { count: 100 },
    attribution: 'Fuente: Jobicy. Enlace a la oferta en jobicy.com.',
    notes: 'Condiciones claras (README oficial): máx. 1 sondeo/hora, atribución y URL canónica. Desactivada hasta validar la calidad con la prueba en vivo. Solo Freelance/Contract/Part-time.',
  },
  {
    id: 'rss-example', name: 'Feed RSS (plantilla)', platform: 'RSS', adapter: rss,
    legalStatus: 'terms', enabledByDefault: false, minIntervalHours: 12, maxAgeDays: 45, requires: [], config: { url: '' },
    attribution: 'Según el sitio.',
    notes: 'Plantilla: copia esta fuente, pon la URL del feed y comprueba antes sus condiciones de uso.',
  },
  {
    id: 'reddit', name: 'Reddit (r/forhire)', platform: 'Reddit', adapter: reddit,
    legalStatus: 'approval', enabledByDefault: false, minIntervalHours: 6, maxAgeDays: 30,
    requires: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'], config: { subreddits: ['forhire'] },
    attribution: 'Fuente: Reddit.',
    notes: 'Requiere aprobación de Reddit y, para uso comercial, acuerdo aparte.',
  },
  {
    id: 'linkedin', name: 'LinkedIn', platform: 'LinkedIn', adapter: linkedin,
    legalStatus: 'blocked', enabledByDefault: false, minIntervalHours: 24, maxAgeDays: 30, requires: ['(acceso de socio LinkedIn)'],
    attribution: 'Fuente: LinkedIn.',
    notes: 'Sin API pública para publicaciones/ofertas; automatización prohibida. Usar entrada manual.',
  },
];

export const getSource = (id) => SOURCES.find((s) => s.id === id);

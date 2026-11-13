// Reddit · Data API oficial con OAuth (app-only). DESACTIVADO por defecto.
// Requisitos para activarlo:
//   1. Aprobación de Reddit para el acceso a la Data API y, si el uso es comercial, un acuerdo comercial.
//   2. Secretos de la Edge Function: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT.
//   3. En la tabla `sources`: legal_status = 'approved' y enabled = true.
// Sin esos secretos el adaptador falla con un mensaje claro y no hace ninguna petición a Reddit.
import { clip } from '../text.js';

export class NotConfiguredError extends Error {}

export const adapter = {
  id: 'reddit',
  async fetchItems({ fetch: f, env = {}, config = {} }) {
    const { REDDIT_CLIENT_ID: id, REDDIT_CLIENT_SECRET: secret, REDDIT_USER_AGENT: ua } = env;
    if (!id || !secret || !ua) throw new NotConfiguredError('Reddit no está configurado: faltan REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET o REDDIT_USER_AGENT (y la aprobación de Reddit).');
    const tokenRes = await f('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${id}:${secret}`), 'content-type': 'application/x-www-form-urlencoded', 'user-agent': ua },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) throw new Error(`Reddit rechazó las credenciales (${tokenRes.status})`);
    const { access_token: token } = await tokenRes.json();
    const out = [];
    for (const sub of config.subreddits || ['forhire']) {
      const res = await f(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new?limit=100&raw_json=1`, { headers: { authorization: `Bearer ${token}`, 'user-agent': ua } });
      if (!res.ok) throw new Error(`Reddit r/${sub} respondió ${res.status}`);
      const data = await res.json();
      for (const { data: p } of data.data?.children || []) {
        const title = String(p.title || '');
        // Convención de r/forhire: «[Hiring]» = demanda, «[For Hire]» = oferta.
        const hint = /^\s*\[hiring\]/i.test(title) ? 'request' : /^\s*\[for hire\]/i.test(title) ? 'supply' : null;
        out.push({
          externalId: String(p.id),
          title: clip(title.replace(/^\s*\[(hiring|for hire)\]\s*/i, ''), 160),
          description: clip(String(p.selftext || ''), 4000),
          client: null,
          postedAt: new Date((p.created_utc || 0) * 1000).toISOString(),
          url: `https://www.reddit.com${p.permalink}`,
          hint, jobType: null, rawCategory: null,
        });
      }
    }
    return out;
  },
};

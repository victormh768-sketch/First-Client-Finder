// Comprobaciones rápidas: claves i18n, scoring y propuestas. Uso: node scripts/check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { DICT, setLang } = await import('../js/i18n.js');
const { beginnerFit, skillMatch, recommend } = await import('../js/scoring.js');
const { generate, analyze } = await import('../js/proposal.js');
const { DEMO_OPPORTUNITIES } = await import('../js/data/demo-opportunities.js');
const { normalize } = await import('../js/sources/index.js');
const { CATEGORIES, LEVELS, GOALS } = await import('../js/data/catalog.js');

let errors = 0;
const fail = (m) => { errors++; console.error('✗', m); };

// 1) mismas claves en ES y EN
for (const k of Object.keys(DICT.es)) if (!(k in DICT.en)) fail(`falta en EN: ${k}`);
for (const k of Object.keys(DICT.en)) if (!(k in DICT.es)) fail(`falta en ES: ${k}`);

// 2) claves estáticas usadas en el código
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
for (const file of walk('js')) {
  if (file.endsWith('i18n.js')) continue; // contiene ejemplos en comentarios
  const src = readFileSync(file, 'utf8');
  // Solo claves estáticas completas: t('a.b') o t('a.b', {...}); las dinámicas (t('a.' + x)) se validan abajo.
  for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'\s*[,)]/g)) if (!(m[1] in DICT.es)) fail(`${file}: clave inexistente ${m[1]}`);
}

// 3) claves dinámicas
const need = [];
['new', 'saved', 'preparing', 'sent', 'replied', 'won', 'lost'].forEach((s) => need.push('status.' + s));
[...CATEGORIES, 'other'].forEach((c) => need.push('cat.' + c));
LEVELS.forEach((l) => need.push('level.' + l, 'level.' + l + '.d', 'exp.' + l, 'fit.exp.' + l));
GOALS.forEach((g) => need.push('goal.' + g));
[1, 2, 3, 4, 5].forEach((n) => need.push('fit.cx.' + n));
['unknown', 'small', 'medium', 'large', 'xl'].forEach((k) => need.push('fit.budget.' + k));
['experience', 'skills', 'complexity', 'budget', 'portfolio'].forEach((k) => need.push('fit.f.' + k));
[0, 1, 2, 3, 4].forEach((i) => need.push('dash.m.' + i, 'dash.next.' + i, 'dash.cta.' + i));
['budget', 'portfolio', 'missing'].forEach((f) => need.push('prop.flag.' + f));
['professional', 'friendly', 'direct'].forEach((k) => need.push('tone.' + k));
need.forEach((k) => { if (!(k in DICT.es) || !(k in DICT.en)) fail(`clave dinámica ausente: ${k}`); });

// 4) datos demo normalizables y marcados
for (const o of DEMO_OPPORTUNITIES) {
  const n = normalize(o);
  if (!n.isDemo) fail(`${o.id} no está marcada como DEMO`);
  if (!CATEGORIES.includes(n.category)) fail(`${o.id} categoría desconocida`);
  if (n.sourceUrl) fail(`${o.id} demo con enlace de fuente`);
}

// 5) scoring y propuestas, en ambos idiomas
const profile = { name: 'Victor', skills: ['Canva', 'Copywriting'], level: 'none', services: ['social'], hasPortfolio: false, portfolioUrl: '', goals: ['first_client'] };
for (const lang of ['es', 'en']) {
  setLang(lang);
  for (const o of DEMO_OPPORTUNITIES) {
    const f = beginnerFit(normalize(o));
    if (!(f.score >= 0 && f.score <= 100)) fail(`score fuera de rango: ${o.id}`);
    if (f.factors.some((x) => !x.reason || x.reason.startsWith('fit.'))) fail(`razón sin traducir: ${o.id} (${lang})`);
    for (const tone of ['professional', 'friendly', 'direct']) {
      const text = generate(normalize(o), profile, tone, lang);
      if (!text.includes('Victor')) fail(`propuesta sin nombre: ${o.id}`);
    }
  }
}
setLang('es');
const easy = beginnerFit(normalize(DEMO_OPPORTUNITIES[0])).score;
const hard = beginnerFit(normalize(DEMO_OPPORTUNITIES[13])).score;
if (!(easy > 80 && hard < 30)) fail(`scores inesperados: fácil=${easy}, difícil=${hard}`);
const top = recommend(DEMO_OPPORTUNITIES.map(normalize), profile, true)[0];
if (!top.match.matched.length) fail('la recomendación PRO no prioriza coincidencias');

console.log(errors ? `\n${errors} problema(s)` : `OK · ${Object.keys(DICT.es).length} claves · fácil=${easy} difícil=${hard} · top PRO=${top.opp.id}`);
process.exit(errors ? 1 : 0);

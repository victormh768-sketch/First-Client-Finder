#!/usr/bin/env node
// Live Probe: consulta las fuentes autorizadas y genera el informe. Necesita internet. No usa Supabase ni claves.
//   node scripts/live-probe.mjs [--sources hn-freelance,remotive,jobicy] [--sample 15] [--no-links] [--link-checks 30] [--out report]
// Salida (por defecto en report/): QUALITY_REPORT.md, live-probe.json, review/*.md y review/todas.csv.
// Código de salida: 0 si todas las fuentes consultadas respondieron; 1 si alguna falló u fue omitida por límite.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SOURCES } from '../supabase/functions/_shared/ingest/registry.js';
import { runProbe } from './probe-lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const die = (m) => { console.error(`Error: ${m}`); process.exit(2); };

const valid = new Set(SOURCES.filter((s) => s.id !== 'rss-example').map((s) => s.id)); // la plantilla RSS no es una fuente
const ids = String(opt('sources', 'hn-freelance,remotive,jobicy')).split(',').map((s) => s.trim()).filter(Boolean);
for (const id of ids) if (!valid.has(id)) die(`fuente desconocida «${id}». Válidas: ${[...valid].join(', ')}`);
const int = (name, d, min, max) => { const v = Number(opt(name, d)); if (!Number.isInteger(v) || v < min || v > max) die(`--${name} debe ser un entero entre ${min} y ${max}`); return v; };
const sample = int('sample', 15, 1, 200);
const linkCap = int('link-checks', 30, 0, 100);
const checkLinks = !args.includes('--no-links') && linkCap > 0;
const out = opt('out', 'report');

// Ejecuciones recientes del workflow (las calcula el workflow; vacío si se ejecuta en local).
const num = (v) => (v === undefined || v === '' ? null : Number(v));
const recent = { last1h: num(process.env.PROBE_RUNS_LAST_1H), last24h: num(process.env.PROBE_RUNS_LAST_24H) };
const startedAt = new Date();

const r = await runProbe({ ids, startedAt, sample, checkLinks, linkCap, recent: recent.last1h == null && recent.last24h == null ? null : recent });

for (const [rel, text] of Object.entries(r.files)) {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
for (const x of r.results) {
  console.log(x.status === 'ok'
    ? `✓ ${x.name}: total ${x.summary.total} · freelance ${x.summary.freelance} · puntuales ${x.summary.oneOff} · empleos ${x.summary.jobs} · relevantes ${x.summary.relevant} · aptas principiante ${x.summary.beginner} (posibles ${x.summary.possible})`
    : `✗ ${x.name}: ${x.status}${x.error ? ' — ' + x.error : ''}`);
}
if (process.env.GITHUB_ACTIONS) for (const a of r.annotations) console.log(`::${a.level} title=${a.title}::${a.message.replace(/[\r\n]+/g, ' ')}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, r.stepSummary + '\n');
console.log(`\nInforme: ${join(out, 'QUALITY_REPORT.md')}`);
process.exit(r.exitCode);

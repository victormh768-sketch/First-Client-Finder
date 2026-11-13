// Pruebas de la HERRAMIENTA Live Probe con respuestas sintéticas (no son datos reales de ninguna fuente).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runProbe, probeSource, classifyError } from '../scripts/probe-lib.mjs';
import { redact } from '../scripts/probe-report.mjs';
import { createPoliteFetch, guardDecision, RequestLimitError } from '../scripts/probe-http.mjs';
import { getSource } from '../supabase/functions/_shared/ingest/registry.js';

const NOW = new Date('2026-11-11T12:00:00Z');
const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
const noSleep = async () => {};
const job = (i, o = {}) => ({ id: i, title: `Logo for my small shop ${i}`, description: `<p>I need a simple logo for my small shop. Budget $120 fixed price. No experience needed. SECRETMARKER-DESC-${i}</p>`, url: `https://remotive.com/remote-jobs/design/logo-${i}`, job_type: 'freelance', category: 'Design', publication_date: NOW.toISOString(), company_name: 'Acme Persona', ...o });
const remotiveFetch = (jobs) => async (u) => (u.includes('/api/') ? ok({ jobs }) : { status: 200 });
const run = (fetchImpl, o = {}) => runProbe({ ids: ['remotive'], fetchImpl, sleep: noSleep, startedAt: NOW, sample: 3, checkLinks: false, ...o });

// ───── fallos: nunca se inventan cifras ─────
test('sin red: FALLA, sin cifras, código de salida 1 y anotación de error', async () => {
  const r = await run(async () => { throw new TypeError('fetch failed'); });
  assert.equal(r.results[0].status, 'sin_red');
  assert.equal(r.results[0].summary, undefined);
  assert.equal(r.exitCode, 1);
  assert.equal(r.annotations[0].level, 'error');
  assert.match(r.files['QUALITY_REPORT.md'], /FALLA: sin conexión/);
  assert.match(r.files['QUALITY_REPORT.md'], /No indica que la fuente esté caída/);
  assert.doesNotMatch(r.files['review/01-freelance.md'], /\| Remotive \|/);
  assert.match(r.files['review/01-freelance.md'], /La fuente falló/);
});
test('HTTP 429 y 403 se informan con su código y no se reintentan', async () => {
  let calls = 0;
  const r = await run(async () => { calls++; return { ok: false, status: 429, json: async () => ({}) }; });
  assert.equal(r.results[0].status, 'http_429');
  assert.equal(calls, 1, 'una sola petición: no hay reintentos');
  assert.equal(r.requests['remotive.com'].status['429'], 1);
});
test('hilo de HN caducado: estado sin_datos_vigentes, no cifras', async () => {
  const f = async (u) => ok({ hits: [{ objectID: '9', title: 'Ask HN: Freelancer? Seeking freelancer? (October 2025)', created_at: '2025-10-01T15:01:06Z' }] });
  const r = await runProbe({ ids: ['hn-freelance'], fetchImpl: f, sleep: noSleep, startedAt: NOW, checkLinks: false });
  assert.equal(r.results[0].status, 'sin_datos_vigentes');
  assert.equal(r.results[0].summary, undefined);
  assert.equal(r.exitCode, 1);
  assert.match(r.files['QUALITY_REPORT.md'], /no tiene datos vigentes/);
});
test('classifyError distingue red de otros errores', () => {
  assert.equal(classifyError(new Error('fetch failed')), 'sin_red');
  assert.equal(classifyError(new Error('boom')), 'error');
});
test('una fuente bloqueada (LinkedIn) nunca se consulta', async () => {
  let calls = 0;
  const r = await runProbe({ ids: ['linkedin', 'reddit'], fetchImpl: async () => { calls++; return ok({}); }, sleep: noSleep, startedAt: NOW });
  assert.equal(calls, 0);
  assert.deepEqual(r.results.map((x) => x.status), ['bloqueada', 'bloqueada']);
  assert.equal(r.exitCode, 0, 'bloqueada no es un fallo');
});

// ───── cifras y revisión ─────
test('Remotive sintético: total, descartados por etiqueta y coherencia de cifras', async () => {
  const jobs = [job(1), job(2, { title: 'Backend engineer', job_type: 'full_time', description: '<p>Full-time role. Salary.</p>' })];
  const res = await probeSource(getSource('remotive'), { fetch: remotiveFetch(jobs), now: NOW, checkLinks: false });
  const s = res.summary;
  assert.equal(s.total, 2); assert.equal(s.obtained, 1); assert.equal(s.droppedBySourceType, 1);
  assert.equal(s.relevant, s.freelance + s.oneOff);
  assert.ok(s.beginner <= s.relevant);
});
test('exit 0 cuando todas las fuentes responden', async () => {
  const r = await run(remotiveFetch([job(1)]));
  assert.equal(r.exitCode, 0);
  assert.equal(r.annotations.length, 0);
});
test('revisión: cada categoría trae TODAS las filas, no solo la muestra', async () => {
  const jobs = Array.from({ length: 20 }, (_, i) => job(i + 1));
  const r = await run(remotiveFetch(jobs), { sample: 3 });
  const n = (f) => (f.match(/\| Proyecto puntual \|/g) || []).length;
  assert.ok(n(r.files['review/02-proyectos-puntuales.md']) >= 20);
  assert.ok(n(r.files['QUALITY_REPORT.md']) < 12, 'el informe principal solo muestra una muestra');
  for (const f of ['01-freelance', '02-proyectos-puntuales', '03-empleos-descartados', '04-no-relevantes', '05-aptas-principiantes', '06-posibles-fraudes']) assert.ok(r.files[`review/${f}.md`], f);
  assert.ok(r.files['review/todas.csv'].split('\n').length > 20);
});
test('revisión: separa empleos descartados, aptas y posibles fraudes', async () => {
  const jobs = [
    job(1),
    job(2, { title: 'Marketing Specialist', job_type: 'contract', description: '<p>Contract role. Responsibilities and requirements below. Join our team. Salary and benefits.</p>' }),
    job(3, { title: 'Easy VA job', description: '<p>We need a virtual assistant. Pay a small registration fee, then contact us on Telegram.</p>' }),
  ];
  const r = await run(remotiveFetch(jobs));
  assert.match(r.files['review/05-aptas-principiantes.md'], /Logo for my small shop 1/);
  assert.match(r.files['review/03-empleos-descartados.md'], /Marketing Specialist/);
  assert.match(r.files['review/06-posibles-fraudes.md'], /Easy VA job/);
  assert.match(r.files['review/06-posibles-fraudes.md'], /Posible señal de fraude/);
  assert.doesNotMatch(r.files['review/05-aptas-principiantes.md'], /Easy VA job/, 'un posible fraude alto no cuenta como apta');
});
test('CSV: protegido frente a fórmulas', async () => {
  const r = await run(remotiveFetch([job(1, { title: '=HYPERLINK("http://evil","x") logo for shop' })]));
  assert.doesNotMatch(r.files['review/todas.csv'], /(^|,)=HYPERLINK/m);
});

// ───── seguridad: sin datos personales ni credenciales ─────
test('redact: correos, teléfonos, @usuarios y enlaces; no toca importes ni fechas', () => {
  assert.equal(redact('Contact ana@example.com'), 'Contact [email]');
  assert.equal(redact('Call +34 612 345 678 now'), 'Call [teléfono] now');
  assert.equal(redact('DM @ana_dev please'), 'DM [usuario] please');
  assert.equal(redact('see https://x.test/a?b=1 and t.me/ana'), 'see [enlace] and [enlace]');
  assert.equal(redact('Budget $1,000-2,000 on 2026-11-12'), 'Budget $1,000-2,000 on 2026-11-12');
});
test('los informes no contienen descripciones, clientes, autores, correos ni teléfonos', async () => {
  const jobs = [job(1, { title: 'Logo, write to ana@example.com or +34 612 345 678 or @ana_dev', company_name: 'Persona Privada SL' })];
  const r = await run(remotiveFetch(jobs));
  const all = Object.values(r.files).join('\n');
  for (const bad of ['SECRETMARKER-DESC', 'ana@example.com', '612 345 678', '@ana_dev', 'Persona Privada', 'Acme Persona']) assert.ok(!all.includes(bad), `no debe aparecer «${bad}»`);
  assert.match(all, /\[email\]/);
});
test('los informes no contienen credenciales ni valores de entorno', async () => {
  process.env.FAKE_SECRET_FOR_TEST = 'ghp_ABCDEF0123456789SECRET';
  const r = await run(remotiveFetch([job(1)]));
  const all = Object.values(r.files).join('\n');
  assert.ok(!all.includes('ghp_ABCDEF0123456789SECRET'));
  assert.doesNotMatch(all, /\b(ghp_|github_pat_|sk-[A-Za-z0-9]{10}|eyJ[A-Za-z0-9_-]{15}|Bearer |authorization|api[_-]?key|service_role)/i);
  delete process.env.FAKE_SECRET_FOR_TEST;
});
test('el código del probe no lee variables de entorno salvo las ejecuciones recientes y el resumen de Actions', () => {
  for (const f of ['probe-lib.mjs', 'probe-http.mjs', 'probe-report.mjs']) assert.doesNotMatch(readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8'), /process\.env|Deno\.env/);
  const cli = readFileSync(new URL('../scripts/live-probe.mjs', import.meta.url), 'utf8');
  const used = [...cli.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(used)], ['GITHUB_ACTIONS', 'GITHUB_STEP_SUMMARY', 'PROBE_RUNS_LAST_1H', 'PROBE_RUNS_LAST_24H']);
});

// ───── límites de peticiones ─────
test('cliente educado: espacia peticiones por host y cuenta respuestas', async () => {
  let t = 0; const waits = [];
  const f = createPoliteFetch({ fetchImpl: async () => ({ status: 200 }), now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
  await f('https://remotive.com/api/remote-jobs'); await f('https://remotive.com/remote-jobs/x/1'); await f('https://news.ycombinator.com/item?id=1');
  assert.deepEqual(waits, [1500], 'solo espera entre peticiones al mismo host (1,5 s en Remotive)');
  assert.equal(f.requests()['remotive.com'].count, 2);
  assert.equal(f.requests()['remotive.com'].status['200'], 2);
});
test('cliente educado: tope por host (enlaces) y se cuenta lo bloqueado', async () => {
  const f = createPoliteFetch({ fetchImpl: async () => ({ status: 200 }), sleep: noSleep, linkCap: 2 });
  await f('https://news.ycombinator.com/item?id=1'); await f('https://news.ycombinator.com/item?id=2'); await f('https://news.ycombinator.com/item?id=3');
  await assert.rejects(f('https://news.ycombinator.com/item?id=4'), RequestLimitError);
  assert.equal(f.requests()['news.ycombinator.com'].count, 3);
  assert.equal(f.requests()['news.ycombinator.com'].limited, 1);
});
test('comprobación de enlaces limitada: lo no comprobado queda sin verificar, nunca como caducado', async () => {
  const topics = ['bakery logo', 'podcast intro video', 'newsletter template', 'etsy shop banner', 'wedding invitation design', 'gym poster'];
  const jobs = topics.map((t, i) => job(i + 1, { title: `Need ${t}`, description: `<p>I need a ${t} for my small business, simple job, budget $${100 + i * 10}. No experience needed. Unique text number ${i * 7919}.</p>` }));
  const r = await run(remotiveFetch(jobs), { checkLinks: true, linkCap: 2 });
  const s = r.results[0].summary;
  assert.ok(s.linkOk >= 1 && s.linkOk < s.relevant, 'solo algunos enlaces comprobados');
  assert.equal(s.quality.linkBroken, 0);
  assert.equal(s.relevant, 6);
  assert.ok(r.requests['remotive.com'].limited >= 1);
});
test('guardas de la fuente: Remotive ≤4/día, Jobicy ≤1/hora', async () => {
  assert.equal(guardDecision('remotive', { last24h: 3 }).skip, false);
  assert.equal(guardDecision('remotive', { last24h: 4 }).skip, true);
  assert.equal(guardDecision('jobicy', { last1h: 0 }).skip, false);
  assert.equal(guardDecision('jobicy', { last1h: 1 }).skip, true);
  assert.equal(guardDecision('hn-freelance', { last1h: 9 }).skip, false);
  assert.match(guardDecision('remotive', null).warn, /no se verificó/);
  let calls = 0;
  const r = await run(async () => { calls++; return ok({ jobs: [] }); }, { recent: { last24h: 5, last1h: 0 } });
  assert.equal(calls, 0, 'si se supera el límite no se hace ninguna petición');
  assert.equal(r.results[0].status, 'omitida_por_limite');
  assert.equal(r.exitCode, 1);
  assert.equal(r.annotations[0].level, 'warning');
});
test('una ejecución hace una sola petición a la API de Remotive', async () => {
  const r = await run(remotiveFetch([job(1)]));
  assert.equal(r.requests['remotive.com'].count, 1);
});

// ───── workflow de GitHub Actions ─────
const wfFull = readFileSync(new URL('../.github/workflows/live-probe.yml', import.meta.url), 'utf8');
const wf = wfFull.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'); // sin comentarios
test('workflow: manual, permisos mínimos, sin secretos ni Supabase', () => {
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /\n\s*schedule:|\n\s*push:|\n\s*pull_request/);
  assert.doesNotMatch(wf, /secrets\.|SUPABASE|service_role/i);
  assert.match(wf, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
  assert.match(wf, /timeout-minutes:/);
});
test('workflow: las entradas del usuario no se interpolan en el shell', () => {
  const runs = wf.split('\n').filter((l) => /^\s*(run:|-\s*run:)/.test(l) || /^\s{10,}[^#\s].*\$\{\{/.test(l));
  for (const l of wf.split('\n')) if (/\$\{\{\s*inputs\./.test(l)) assert.match(l, /^\s*[A-Z_]+:\s*\$\{\{/, `solo vía env: ${l.trim()}`);
  assert.ok(runs.length >= 0);
});
test('workflow: sube el informe también si falla y conserva QUALITY_REPORT.md', () => {
  assert.match(wf, /if: always\(\)/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /path: report\//);
});

// Pruebas del pipeline de ingesta. Los datos son SINTÉTICOS (inventados para probar la lógica con la forma de
// cada API). No son oportunidades reales y no se usan en la app.  Uso: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent } from '../supabase/functions/_shared/ingest/intent.js';
import { classifyType, isImportable as importableType } from '../supabase/functions/_shared/ingest/opptype.js';
// Atajo de estas pruebas: ¿se importaría el texto tal cual? (decide el TIPO, no la intención)
const isImportable = (intent, jobType, item = {}) => importableType(classifyType({ ...item, jobType }, intent, null).type);
import { detectCategory, detectSkills, extractBudget } from '../supabase/functions/_shared/ingest/extract.js';
import { fitScore, estimateRequirements } from '../supabase/functions/_shared/ingest/fit.js';
import { findDuplicate } from '../supabase/functions/_shared/ingest/dedupe.js';
import { checkLink, isExpiredByAge } from '../supabase/functions/_shared/ingest/expiry.js';
import { stripHtml, canonicalUrl } from '../supabase/functions/_shared/ingest/text.js';
import { runSource, enrich } from '../supabase/functions/_shared/ingest/pipeline.js';
import { SOURCES, getSource } from '../supabase/functions/_shared/ingest/registry.js';
import { parseFeed } from '../supabase/functions/_shared/ingest/adapters/rss.js';
import { parseManual } from '../supabase/functions/_shared/ingest/adapters/manual.js';
import { NotAuthorizedError } from '../supabase/functions/_shared/ingest/adapters/linkedin.js';
import { NotConfiguredError } from '../supabase/functions/_shared/ingest/adapters/reddit.js';

const NOW = new Date('2026-11-11T12:00:00Z');
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 864e5).toISOString();

// ───── intención ─────
test('detecta una solicitud de servicio (EN)', () => {
  const r = classifyIntent({ title: 'Looking for a video editor', description: 'We need someone to edit 10 short YouTube videos. Budget $300 fixed price.' });
  assert.equal(r.kind, 'service_request');
  assert.ok(isImportable(r, null, { title: 'Looking for a video editor', description: 'We need someone to edit 10 short YouTube videos. Budget $300 fixed price.' }));
});
test('detecta una solicitud de servicio (ES)', () => {
  const r = classifyIntent({ title: 'Busco diseñador para logo', description: 'Necesito un logotipo para mi tienda online. Presupuesto 150 €.' });
  assert.equal(r.kind, 'service_request');
});
test('descarta a quien ofrece sus servicios', () => {
  const r = classifyIntent({ title: 'SEEKING WORK', description: 'Available for hire. Freelance designer, my rates are $50/hr.' });
  assert.equal(r.kind, 'seeking_work');
  assert.ok(!isImportable(r));
});
test('descarta empleo tradicional a tiempo completo', () => {
  const r = classifyIntent({ title: 'Senior Backend Engineer', description: 'Full-time position. Salary, equity and health insurance. Apply now. Responsibilities and requirements below.' });
  assert.equal(r.kind, 'job');
  assert.ok(!isImportable(r, null));
});
test('una etiqueta contract con lenguaje de puesto de trabajo NO es un cliente', () => {
  const item = { title: 'Contract web designer', description: 'Responsibilities: design landing pages. Requirements: Figma.', jobType: 'contract' };
  const r = classifyIntent(item);
  assert.equal(classifyType(item, r).type, 'job');
  assert.ok(!isImportable(r, 'contract', item));
});
test('la pista explícita de la plataforma manda', () => {
  assert.equal(classifyIntent({ title: 'x', description: 'texto', hint: 'supply' }).kind, 'seeking_work');
  assert.equal(classifyIntent({ title: 'x', description: 'logo design', hint: 'request' }).kind, 'service_request');
});
test('ruido sin intención no se importa', () => {
  const r = classifyIntent({ title: 'Interesting article about databases', description: 'I read this piece on indexing and found it useful.' });
  assert.ok(!isImportable(r));
});

// ───── extracción ─────
test('presupuesto: solo si está escrito', () => {
  assert.deepEqual(extractBudget('Budget is $300 for the project'), { min: 300, max: 300, currency: 'USD', type: 'fixed' });
  assert.deepEqual(extractBudget('We can pay €200-€400'), { min: 200, max: 400, currency: 'EUR', type: 'fixed' });
  assert.deepEqual(extractBudget('Paying $25/hour'), { min: 25, max: 25, currency: 'USD', type: 'hourly' });
  assert.deepEqual(extractBudget('Presupuesto: 150 € total'), { min: 150, max: 150, currency: 'EUR', type: 'fixed' });
  assert.equal(extractBudget('Great project, competitive pay'), null);
  assert.equal(extractBudget('Salary $90k per year'), null, 'un salario anual no es un presupuesto de proyecto');
});
test('categoría y habilidades salen del texto', () => {
  assert.equal(detectCategory('Edit YouTube videos with Premiere').category, 'video');
  assert.equal(detectCategory('Need a WordPress website').category, 'web');
  assert.equal(detectCategory('Automate invoices with Zapier').category, 'automation');
  assert.equal(detectCategory('Run our Google Ads and SEO').category, 'marketing');
  assert.equal(detectCategory('something vague').category, 'other');
  assert.deepEqual(detectSkills('Edit with Premiere and add subtitles'), ['Video editing', 'Subtitles']);
  assert.deepEqual(detectSkills('texto sin nada técnico'), []);
});
test('estimaciones marcan lo que no dice el texto', () => {
  const a = estimateRequirements('Need a simple logo, no experience needed', 1);
  assert.equal(a.experience, 'none'); assert.ok(!a.estimated.includes('experience'));
  const b = estimateRequirements('We need a designer for a logo', 1);
  assert.ok(b.estimated.includes('experience'));
  assert.equal(estimateRequirements('5+ years of experience required', 2).experience, 'senior');
  assert.equal(estimateRequirements('send your portfolio', 1).portfolioRequired, true);
});

// ───── la puntuación del servidor coincide con js/scoring.js ─────
test('fitScore = beginnerFit de la app para las 16 oportunidades demo', async () => {
  const { beginnerFit } = await import('../js/scoring.js');
  const { DEMO_OPPORTUNITIES } = await import('../js/data/demo-opportunities.js');
  const { normalize } = await import('../js/sources/index.js');
  for (const d of DEMO_OPPORTUNITIES) {
    const o = normalize(d);
    assert.equal(fitScore(o), beginnerFit(o).score, d.id);
  }
});

// ───── duplicados, caducidad, enlaces ─────
test('duplicados: mismo id, misma URL y texto casi idéntico', () => {
  const pool = [{ id: 'a', platform: 'P', externalId: '1', url: 'https://x.com/a?utm_source=z', title: 'Need a logo designer', description: 'We need a logo designer for our new coffee shop brand and social media kit' }];
  assert.equal(findDuplicate({ platform: 'P', externalId: '1', url: 'https://other', title: 't', description: 'd' }, pool).reason, 'same_id');
  assert.equal(findDuplicate({ platform: 'Q', externalId: '9', url: 'https://www.x.com/a/', title: 't', description: 'd' }, pool).reason, 'same_url');
  const near = findDuplicate({ platform: 'Q', externalId: '9', url: 'https://y.com/b', title: 'Need a logo designer', description: 'We need a logo designer for our new coffee shop brand and social media kit!' }, pool);
  assert.equal(near.reason, 'similar_text');
  assert.equal(findDuplicate({ platform: 'Q', externalId: '9', url: 'https://y.com/b', title: 'Translate a manual', description: 'Spanish to English translation of a technical product manual' }, pool), null);
});
test('caducidad por antigüedad: sin fecha no se afirma que caducó', () => {
  assert.equal(isExpiredByAge(iso(40), 35, NOW), true);
  assert.equal(isExpiredByAge(iso(10), 35, NOW), false);
  assert.equal(isExpiredByAge(null, 35, NOW), false);
});
test('comprobación de enlace: 404→gone, 200→ok, error→unknown (nunca caducada)', async () => {
  const mk = (status) => async () => ({ status });
  assert.equal(await checkLink('https://x.com/a', mk(404)), 'gone');
  assert.equal(await checkLink('https://x.com/a', mk(410)), 'gone');
  assert.equal(await checkLink('https://x.com/a', mk(200)), 'ok');
  assert.equal(await checkLink('https://x.com/a', mk(403)), 'unknown');
  assert.equal(await checkLink('https://x.com/a', mk(429)), 'unknown');
  assert.equal(await checkLink('https://x.com/a', async () => { throw new Error('red'); }), 'unknown');
  let calls = 0;
  assert.equal(await checkLink('https://x.com/a', async (u, o) => (++calls === 1 ? { status: 405 } : { status: 200 })), 'ok');
});
test('texto: HTML → texto y URL canónica', () => {
  assert.equal(stripHtml('<p>Hola &amp; adiós</p><p>Línea</p>'), 'Hola & adiós\n\nLínea');
  assert.equal(canonicalUrl('https://WWW.Ejemplo.com/a/?utm_medium=x&id=3#top'), 'https://ejemplo.com/a?id=3');
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
});

// ───── adaptadores con respuestas simuladas (sintéticas) ─────
const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

function mockHnFetch() {
  return async (url) => {
    if (url.includes('tags=story&')) return json({ hits: [{ objectID: '900', title: 'Ask HN: Freelancer? Seeking freelancer? (November 2026)', created_at: iso(10) }] });
    if (url.includes('story_900')) {
      return json({ nbPages: 1, hits: [
        { objectID: '1', parent_id: 900, created_at: iso(2), comment_text: '<p>SEEKING FREELANCER | Remote | Video editor</p><p>We need someone to edit 8 short product videos with subtitles. Budget $400 fixed price. No experience needed, send examples.</p>' },
        { objectID: '2', parent_id: 900, created_at: iso(3), comment_text: '<p>SEEKING WORK | Remote</p><p>Available for hire. Full-stack developer, my rates are $90/hr.</p>' },
        { objectID: '3', parent_id: 1, created_at: iso(1), comment_text: '<p>Reply that is not top level, need a logo.</p>' },
        { objectID: '4', parent_id: 900, created_at: iso(3), comment_text: '<p>SEEKING FREELANCER | Remote | Video editor</p><p>We need someone to edit 8 short product videos with subtitles. Budget $400 fixed price. No experience needed, send examples!</p>' },
        { objectID: '5', parent_id: 900, created_at: iso(40), comment_text: '<p>SEEKING FREELANCER | Logo</p><p>We need a logo designer for our shop. Budget €150.</p>' },
        { objectID: '6', parent_id: 900, created_at: iso(1), comment_text: '<p>Nice thread, thanks for organising it.</p>' },
      ] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
const withLinks = (inner) => async (url, opts) => (url.startsWith('https://news.ycombinator.com/') ? { status: 200 } : inner(url, opts));

test('HN: importa solo solicitudes de nivel superior, descarta ofertas, duplicados y caducadas', async () => {
  const source = getSource('hn-freelance');
  const { rows, stats } = await runSource({ source, now: NOW, fetch: withLinks(mockHnFetch()) });
  assert.equal(stats.fetched, 5); // el comentario no-nivel-superior no cuenta
  assert.equal(stats.skipped.seeking_work, 1);
  assert.equal(stats.skipped.not_request, 1);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.expired, 1);
  assert.equal(stats.imported, 1);
  const ok = rows.find((r) => r.reviewStatus === 'pending');
  assert.equal(ok.externalId, '1');
  assert.equal(ok.category, 'video');
  assert.deepEqual(ok.budget, { min: 400, max: 400, currency: 'USD', type: 'fixed' });
  assert.equal(ok.url, 'https://news.ycombinator.com/item?id=1');
  assert.equal(ok.platform, 'Hacker News');
  assert.equal(ok.verification, 'link_ok');
  assert.equal(ok.client, null, 'no se inventa el cliente');
  assert.ok(!('author' in ok));
  assert.ok(ok.reasons.includes('budget_stated') && ok.reasons.includes('beginners_welcome'));
  assert.equal(rows.find((r) => r.reviewStatus === 'duplicate').duplicateOf, 'Hacker News:1');
});
test('un enlace caído (404) deja la oportunidad como caducada', async () => {
  const f = async (url) => (url.startsWith('https://news.ycombinator.com/') ? { status: 404 } : mockHnFetch()(url));
  const { rows, stats } = await runSource({ source: getSource('hn-freelance'), now: NOW, fetch: f });
  assert.equal(stats.imported, 0);
  assert.ok(stats.linkGone >= 1);
  assert.ok(rows.some((r) => r.reviewStatus === 'expired' && r.verification === 'expired'));
});
test('un fallo de la fuente se propaga con mensaje claro', async () => {
  await assert.rejects(runSource({ source: getSource('hn-freelance'), now: NOW, fetch: async () => ({ ok: false, status: 503 }) }), /503/);
});
test('lo ya guardado no se reimporta, solo se refresca', async () => {
  const existing = [{ id: 'x', platform: 'Hacker News', externalId: '1', url: 'https://news.ycombinator.com/item?id=1', title: 't', description: 'd' }];
  const { rows, refresh } = await runSource({ source: getSource('hn-freelance'), existing, now: NOW, fetch: withLinks(mockHnFetch()) });
  assert.deepEqual(refresh, ['1']);
  assert.ok(!rows.some((r) => r.externalId === '1'));
});

test('Remotive: solo freelance/contract, enlace a Remotive, salario anual ignorado', async () => {
  const f = async () => json({ jobs: [
    { id: 11, url: 'https://remotive.com/remote-jobs/design/logo-contract-11', title: 'Contract logo designer', company_name: 'Acme (ficticia)', category: 'Design', job_type: 'contract', publication_date: '2026-11-09T10:00:00', salary: '$80k - $100k', description: '<p>We need a logo designer on a contract basis for a small project. Figma and Illustrator.</p>' },
    { id: 12, url: 'https://remotive.com/remote-jobs/dev/backend-12', title: 'Backend engineer', company_name: 'Beta', category: 'Software Development', job_type: 'full_time', publication_date: '2026-11-09T10:00:00', description: '<p>Full-time role</p>' },
  ] });
  const { rows } = await runSource({ source: getSource('remotive'), now: NOW, fetch: async (u, o) => (u.startsWith('https://remotive.com/api') ? f() : { status: 200 }) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://remotive.com/remote-jobs/design/logo-contract-11');
  assert.equal(rows[0].platform, 'Remotive');
  assert.equal(rows[0].budget, null);
  assert.equal(rows[0].client, 'Acme (ficticia)');
  assert.equal(rows[0].category, 'design');
});

test('RSS: lee RSS 2.0 y Atom', () => {
  const rss = '<rss><channel><item><title><![CDATA[Need a web designer]]></title><link>https://ex.org/1</link><guid>g1</guid><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Landing page&lt;/p&gt;</description></item></channel></rss>';
  const a = parseFeed(rss);
  assert.equal(a.length, 1); assert.equal(a[0].title, 'Need a web designer'); assert.equal(a[0].description, 'Landing page'); assert.equal(a[0].postedAt, '2026-11-09T10:00:00.000Z');
  const atom = '<feed><entry><title>Hola</title><id>tag:1</id><link href="https://ex.org/2"/><updated>2026-11-09T10:00:00Z</updated><summary>texto</summary></entry></feed>';
  assert.equal(parseFeed(atom)[0].url, 'https://ex.org/2');
});

test('LinkedIn: nunca accede; siempre lanza NotAuthorizedError', async () => {
  let touched = false;
  const f = async () => { touched = true; return {}; };
  await assert.rejects(runSource({ source: getSource('linkedin'), fetch: f }), NotAuthorizedError);
  assert.equal(touched, false, 'no debe hacer ninguna petición');
  assert.equal(getSource('linkedin').legalStatus, 'blocked');
  assert.equal(getSource('linkedin').enabledByDefault, false);
});
test('Reddit: sin claves falla sin hacer peticiones', async () => {
  let touched = false;
  await assert.rejects(runSource({ source: getSource('reddit'), env: {}, fetch: async () => { touched = true; return {}; } }), NotConfiguredError);
  assert.equal(touched, false);
});

test('entrada manual: no inventa fecha ni descarga la URL', () => {
  const r = parseManual({ url: 'https://www.linkedin.com/posts/abc?utm_source=x', text: 'We are looking for a freelance video editor for 5 reels. Budget $250.' });
  assert.equal(r.platform, 'LinkedIn (manual)');
  assert.equal(r.postedAt, null);
  assert.equal(r.url, 'https://linkedin.com/posts/abc');
  assert.throws(() => parseManual({ text: 'corto' }), /demasiado corto/);
  assert.throws(() => parseManual({ url: 'ftp://x', text: 'x'.repeat(40) }), /http/);
  const o = enrich({ ...r }, { id: 'manual', platform: 'Manual' }, NOW);
  assert.equal(o.platform, 'LinkedIn (manual)');
  assert.equal(o.postedAt, null);
});

test('registro: ninguna fuente que requiera aprobación nace activada', () => {
  for (const s of SOURCES) {
    if (s.legalStatus === 'approval' || s.legalStatus === 'blocked') assert.equal(s.enabledByDefault, false, s.id);
  }
  assert.ok(SOURCES.every((s) => s.adapter && typeof s.adapter.fetchItems === 'function'));
});

test('HN: un hilo antiguo no se importa como si fuera actual', async () => {
  const f = async (url) => (url.includes('tags=story&')
    ? json({ hits: [{ objectID: '900', title: 'Ask HN: Freelancer? Seeking freelancer? (October 2025)', created_at: iso(400) }] })
    : { ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(runSource({ source: getSource('hn-freelance'), now: NOW, fetch: f }), (e) => e.code === 'STALE_SOURCE' && /no hay hilo vigente/.test(e.message));
});

test('HN: elige el hilo más reciente aunque lo publique otra cuenta y venga desordenado', async () => {
  const seen = [];
  const f = async (url) => {
    seen.push(url);
    if (url.includes('tags=story&')) return json({ hits: [
      { objectID: '1', title: 'Ask HN: Freelancer? Seeking freelancer? (October 2025)', created_at: iso(400) },
      { objectID: '2', title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)', created_at: iso(12) },
      { objectID: '3', title: 'Ask HN: Who is hiring? (October 2026)', created_at: iso(10) },
    ] });
    return json({ nbPages: 1, hits: [] });
  };
  await runSource({ source: getSource('hn-freelance'), now: NOW, fetch: f });
  assert.ok(seen.some((u) => u.includes('story_2')), 'usa el hilo 2');
  assert.ok(!seen.some((u) => u.includes('author_whoishiring')));
});

test('RemoteJobs.org: mapea campos, usa el filtro freelance y falla claro si la forma no es la esperada', async () => {
  let asked = '';
  const body = { jobs: [{ id: 7, title: 'Need a logo', description: '<p>I need a simple logo. Budget $100.</p>', url: 'https://remotejobs.org/jobs/7', posted_at: iso(2), employment_types: ['freelance'], company: { name: 'X' }, category: 'Design' }, { id: 8, title: 'Sin url' }] };
  const r = await runSource({ source: getSource('remotejobs'), now: NOW, checkLinks: false, fetch: async (u) => { asked = u; return json(body); }, collect: true });
  assert.match(asked, /type=freelance/);
  assert.equal(r.stats.fetched, 1, 'descarta filas sin url');
  assert.equal(r.rows[0].reviewStatus, 'pending');
  await assert.rejects(runSource({ source: getSource('remotejobs'), now: NOW, fetch: async () => json({ foo: 1 }) }), /forma de respuesta inesperada/);
});

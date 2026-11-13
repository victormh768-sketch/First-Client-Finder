// Clasificación de tipo, Beginner Friendly Score y calidad. Textos SINTÉTICOS escritos para probar las reglas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enrich, runSource } from '../supabase/functions/_shared/ingest/pipeline.js';
import { assessQuality } from '../supabase/functions/_shared/ingest/quality.js';
import { fitScore } from '../supabase/functions/_shared/ingest/fit.js';
import { getSource } from '../supabase/functions/_shared/ingest/registry.js';

const NOW = new Date('2026-11-11T12:00:00Z');
const src = { id: 's', platform: 'Test' };
const E = (title, description, extra = {}) => enrich({ externalId: '1', title, description, url: 'https://ex.test/1', postedAt: NOW.toISOString(), ...extra }, src, NOW);

// ───── tipo ─────
test('tipo: solicitud acotada = proyecto puntual', () => {
  const o = E('Need a logo for my shop', 'I need a logo designed for my small online shop. Budget $120 fixed price. One-off job.');
  assert.equal(o.opportunityType, 'one_off');
});
test('tipo: trabajo continuo = freelance', () => {
  const o = E('Looking for a social media manager', 'We need someone to manage our Instagram and social media on an ongoing basis, monthly retainer. Budget $400 per month.');
  assert.equal(o.opportunityType, 'freelance');
});
test('tipo: empleo tradicional NO se confunde con servicio', () => {
  const o = E('Marketing Specialist', 'Full-time position. Salary and health insurance. Responsibilities and requirements below. Apply now.');
  assert.equal(o.opportunityType, 'job');
});
test('tipo: etiqueta contract + lenguaje de puesto = empleo', () => {
  const o = E('Video editor (contract)', 'We are looking for a video editor. Responsibilities: edit videos. Requirements: Premiere. Join our team.', { jobType: 'contract' });
  assert.equal(o.opportunityType, 'job');
});
test('tipo: busca socio sin pago = colaboración', () => {
  const o = E('Looking for a technical co-founder', 'Early-stage startup looking for a technical partner. Equity only, revenue share when we launch.');
  assert.equal(o.opportunityType, 'collaboration');
});
test('tipo: quien ofrece servicios y ruido = no relevante', () => {
  assert.equal(E('SEEKING WORK', 'Available for hire. Freelance designer, my rates are $50/hr.', { hint: 'supply' }).opportunityType, 'not_relevant');
  assert.equal(E('Interesting article', 'I read this piece on indexing and found it useful for my team.').opportunityType, 'not_relevant');
});

// ───── Beginner Friendly Score ─────
test('principiante: explícita sin experiencia + alcance y presupuesto accesibles = apta, con razones', () => {
  const o = E('Need a logo for my shop', 'I need a simple logo designed for my small shop. Budget $120 fixed price. No experience needed, beginners welcome.');
  assert.equal(o.beginner.level, 'apta');
  assert.ok(o.beginner.score >= 60);
  assert.equal(o.beginner.factors.length, 5);
  assert.ok(o.beginner.factors.every((f) => f.reason && f.reason.length > 5), 'cada factor trae su razón');
});
test('principiante: NO es apta solo porque no menciona experiencia', () => {
  const o = E('Need a video editor', 'We need someone to edit our videos.');
  assert.ok(o.estimated.includes('experience'));
  assert.notEqual(o.beginner.level, 'apta');
  assert.equal(o.beginner.factors.find((f) => f.key === 'experience').basis, 'unknown');
});
test('principiante: sin experiencia indicada, con 2 señales explícitas = solo «posible», nunca apta', () => {
  const o = E('Need a logo', 'I need a simple logo for my small shop. Budget $100. No portfolio required.');
  assert.equal(o.beginner.level, 'posible');
});
test('principiante: senior, portfolio o proyecto grande bloquean', () => {
  assert.equal(E('Need a web app', 'Looking for a senior developer, 6+ years experience. Budget $5000 to build a platform.').beginner.level, 'no_apta');
  assert.ok(E('Need a designer', 'We need a designer. Please send your portfolio and work samples. Budget $100. Junior welcome.').beginner.blockers.includes('portfolio_required'));
});
test('principiante: un empleo nunca es apta aunque diga junior', () => {
  const o = E('Junior Marketing Assistant', 'Full-time, entry level, no experience. Salary and benefits. Apply now. Responsibilities below.');
  assert.equal(o.opportunityType, 'job');
  assert.equal(o.beginner.level, 'no_apta');
  assert.ok(o.beginner.blockers.includes('not_a_service_request'));
});
test('principiante: la puntuación suma 100 como máximo y es entera', () => {
  const o = E('Need a logo', 'No experience needed. Simple logo, budget $50. No portfolio needed. Canva.');
  assert.ok(o.beginner.score <= 100 && Number.isInteger(o.beginner.score));
  assert.equal(o.beginner.factors.reduce((s, f) => s + f.max, 0), 100);
});
test('el Beginner Fit de la app (fit) no cambia por el nuevo clasificador', () => {
  const o = E('Need a logo', 'I need a simple logo. Budget $100. Beginners welcome.');
  assert.equal(o.fit, fitScore(o));
});

// ───── calidad ─────
test('calidad: presupuesto, información, fecha', () => {
  const o = E('Need help', 'Help.', { postedAt: null });
  const codes = o.quality.flags.map((f) => f.code);
  assert.ok(codes.includes('no_budget') && codes.includes('insufficient_info') && codes.includes('no_date'));
  assert.equal(o.quality.level, 'review');
});
test('calidad: señales de fraude (avisos, no veredictos)', () => {
  const o = E('Easy job', 'Hiring a virtual assistant. You must pay a small registration fee first, then contact us on Telegram. We will send you a cheque.');
  assert.equal(o.quality.fraud.level, 'high');
  assert.ok(o.quality.fraud.signals.length >= 2);
  assert.ok(o.quality.fraud.signals.every((s) => !/es un fraude/i.test(s.text)));
  assert.equal(o.quality.level, 'poor');
});
test('calidad: texto normal no genera señales de fraude', () => {
  const o = E('Need a logo', 'I need a logo for my shop. Budget $120. Send me your portfolio link by message here.');
  assert.equal(o.quality.fraud.level, 'none');
});
test('calidad: pipeline añade caducada, enlace roto y duplicada', async () => {
  const hn = getSource('hn-freelance');
  const iso = (d) => new Date(NOW.getTime() - d * 864e5).toISOString();
  const f = async (url) => {
    if (url.includes('author_whoishiring')) return { ok: true, status: 200, json: async () => ({ hits: [{ objectID: '900', title: 'Ask HN: Freelancer? Seeking freelancer? (X)', created_at: iso(5) }] }) };
    if (url.includes('story_900')) return { ok: true, status: 200, json: async () => ({ nbPages: 1, hits: [
      { objectID: '5', parent_id: 900, created_at: iso(60), comment_text: '<p>SEEKING FREELANCER | Logo</p><p>We need a logo designer for our shop. Budget €150.</p>' },
      { objectID: '6', parent_id: 900, created_at: iso(1), comment_text: '<p>SEEKING FREELANCER | Video</p><p>We need a video editor for 5 short videos. Budget $200.</p>' },
    ] }) };
    return { status: 404 };
  };
  const { rows } = await runSource({ source: hn, now: NOW, fetch: f });
  const flags = (id) => rows.find((r) => r.externalId === id).quality.flags.map((x) => x.code);
  assert.ok(flags('5').includes('expired'));
  assert.ok(flags('6').includes('link_broken'));
});
test('humano en el circuito: todo se importa como pendiente', async () => {
  const f = async (u) => (u.includes('/api/') ? { ok: true, status: 200, json: async () => ({ jobs: [{ id: 1, title: 'Logo for my shop', description: '<p>I need a logo for a small project. Budget $100.</p>', url: 'https://remotive.com/x/1', job_type: 'freelance', category: 'Design', publication_date: NOW.toISOString() }] }) } : { status: 200 });
  const { rows } = await runSource({ source: getSource('remotive'), now: NOW, fetch: f });
  assert.ok(rows.length >= 1 && rows.every((r) => r.reviewStatus === 'pending'));
});

test('pedidos de banner, póster o plantilla en un tablón con etiqueta freelance son proyectos, no empleo', () => {
  for (const what of ['etsy shop banner', 'gym poster', 'newsletter template']) {
    const o = E(`Need ${what}`, `I need a ${what} for my small business, simple job, budget $100.`, { jobType: 'freelance' });
    assert.equal(o.opportunityType, 'one_off', what);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRequestForm, isEmail } from '../js/views/company.js';

const ok = { title: 'Logo para cafetería local', description: 'Necesitamos un logo sencillo y tres variantes para redes sociales de nuestra cafetería.', skills: 'Canva, Logo design, canva', budgetMin: '50', budgetMax: '120', category: 'design', experience: 'none', complexity: '2' };

test('formulario válido se normaliza', () => {
  const r = parseRequestForm(ok);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.skills, ['Canva', 'Logo design', 'canva'].slice(0, 3).filter((s, i, a) => a.indexOf(s) === i));
  assert.equal(r.value.budgetMin, 50);
});
test('rechaza título corto, descripción corta y presupuesto invertido', () => {
  assert.ok(parseRequestForm({ ...ok, title: 'Logo' }).errors.includes('title'));
  assert.ok(parseRequestForm({ ...ok, description: 'corta' }).errors.includes('desc'));
  assert.ok(parseRequestForm({ ...ok, budgetMin: '200', budgetMax: '100' }).errors.includes('budget'));
});
test('categoría y experiencia desconocidas caen a valores seguros', () => {
  const v = parseRequestForm({ ...ok, category: 'x', experience: 'god', complexity: '99' }).value;
  assert.equal(v.category, 'other'); assert.equal(v.experience, 'none'); assert.equal(v.complexity, 5);
});
test('correo', () => { assert.ok(isEmail('a@b.co')); assert.ok(!isEmail('a@b')); assert.ok(!isEmail('a b@c.com')); });

test('la migración protege contactos e impide auto-aprobación', () => {
  const sql = readFileSync(new URL('../supabase/migrations/003_company_requests.sql', import.meta.url), 'utf8');
  for (const t of ['company_contacts', 'opportunity_interests', 'interest_contacts']) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
  assert.match(sql, /review_status = 'pending'/);               // la empresa solo inserta pendientes
  assert.doesNotMatch(sql, /on public\.opportunities for update/); // sin UPDATE directo para empresas
  assert.match(sql, /status = 'accepted'/);                      // contacto solo tras aceptar
});

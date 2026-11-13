// Edge Function `sync-sources`: importa oportunidades desde las fuentes activadas.
// Se ejecuta en el servidor de Supabase: los secretos (service role, claves de plataformas) nunca llegan al navegador.
//
// Quién puede llamarla:
//   · programación (pg_cron) con la cabecera  x-cron-secret: <CRON_SECRET>
//   · un administrador autenticado (Authorization: Bearer <jwt>), desde el panel
// Cuerpo opcional: { "source": "hn-freelance", "force": true, "action": "sync" | "recheck" }
//
// Despliegue:  supabase functions deploy sync-sources --no-verify-jwt
//              supabase secrets set CRON_SECRET=<un-valor-largo-aleatorio>
// (--no-verify-jwt porque la función valida ella misma el secreto o el rol de administrador.)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SOURCES, getSource } from '../_shared/ingest/registry.js';
import { runSource } from '../_shared/ingest/pipeline.js';
import { toRow, toPoolItem } from '../_shared/ingest/db.js';
import { checkLink, isExpiredByAge } from '../_shared/ingest/expiry.js';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-cron-secret, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const RUNNABLE = new Set(['open', 'terms', 'approved']);
const HARD_FLOOR_HOURS = 1; // protección de los límites de las plataformas, incluso con force

async function authorize(req: Request): Promise<'cron' | 'admin' | null> {
  const given = req.headers.get('x-cron-secret');
  if (cronSecret && given && given === cronSecret) return 'cron';
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return null;
  const { data: adm } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return adm ? 'admin' : null;
}

async function ensureSources() {
  const { data } = await db.from('sources').select('id');
  const have = new Set((data || []).map((r: { id: string }) => r.id));
  const missing = SOURCES.filter((s) => !have.has(s.id)).map((s) => ({
    id: s.id, name: s.name, platform: s.platform, enabled: s.enabledByDefault, config: s.config || {},
    legal_status: s.legalStatus === 'approval' ? 'approval' : s.legalStatus, min_interval_hours: s.minIntervalHours, max_age_days: s.maxAgeDays, notes: s.notes,
  }));
  if (missing.length) await db.from('sources').insert(missing);
}

async function sync(row: any, force: boolean) {
  const def = getSource(row.id);
  const started = new Date();
  const { data: run } = await db.from('sync_runs').insert({ source_id: row.id, started_at: started.toISOString() }).select('id').single();
  const finish = async (ok: boolean, stats: unknown, error: string | null) => {
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok, stats, error }).eq('id', run!.id);
    await db.from('sources').update({ last_sync_at: new Date().toISOString(), last_status: ok ? 'ok' : 'error', last_error: error }).eq('id', row.id);
  };
  try {
    if (!def) throw new Error('La fuente no tiene adaptador registrado');
    if (!RUNNABLE.has(row.legal_status)) throw new Error(`Fuente bloqueada (legal_status=${row.legal_status}). Requiere autorización antes de activarse.`);
    const env: Record<string, string> = {};
    for (const k of def.requires || []) { const v = Deno.env.get(k); if (v) env[k] = v; }
    // Pool de deduplicación: TODAS las fuentes (una misma petición puede aparecer en dos plataformas).
    const { data: existingRows } = await db.from('opportunities').select('id, platform, external_id, source_url, title, description').order('created_at', { ascending: false }).limit(5000);
    const source = { ...def, config: { ...(def.config || {}), ...(row.config || {}) }, maxAgeDays: row.max_age_days };
    const { rows, refresh, stats } = await runSource({ source, existing: (existingRows || []).map(toPoolItem), env });
    if (rows.length) {
      const { error } = await db.from('opportunities').upsert(rows.map((o: any) => toRow(o, def)), { onConflict: 'source_id,external_id', ignoreDuplicates: true });
      if (error) throw new Error('No se pudieron guardar las oportunidades: ' + error.message);
    }
    for (let i = 0; i < refresh.length; i += 100) {
      await db.from('opportunities').update({ last_checked_at: new Date().toISOString() }).eq('source_id', row.id).in('external_id', refresh.slice(i, i + 100));
    }
    await finish(true, stats, null);
    return { source: row.id, ok: true, stats };
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 500);
    await finish(false, {}, msg);
    return { source: row.id, ok: false, error: msg };
  }
}

// Revisa las oportunidades YA aprobadas: caduca las antiguas o con enlace caído (404/410). Nunca borra.
async function recheck(row: any) {
  const { data } = await db.from('opportunities').select('id, source_url, posted_at').eq('source_id', row.id).eq('review_status', 'approved').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(100);
  let expired = 0, ok = 0, unknown = 0;
  for (const o of data || []) {
    let expire = isExpiredByAge(o.posted_at, row.max_age_days);
    let state = 'unknown';
    if (!expire && o.source_url) { state = await checkLink(o.source_url); expire = state === 'gone'; }
    if (expire) { await db.from('opportunities').update({ review_status: 'expired', verification: 'expired', last_checked_at: new Date().toISOString() }).eq('id', o.id); expired++; }
    else { await db.from('opportunities').update({ last_checked_at: new Date().toISOString(), ...(state === 'ok' ? { verified_at: new Date().toISOString() } : {}) }).eq('id', o.id); state === 'ok' ? ok++ : unknown++; }
  }
  return { source: row.id, action: 'recheck', checked: (data || []).length, expired, ok, unknown };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  const who = await authorize(req);
  if (!who) return reply({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  await ensureSources();
  let q = db.from('sources').select('*');
  if (body.source) q = q.eq('id', body.source); else q = q.eq('enabled', true);
  const { data: rows, error } = await q;
  if (error) return reply({ error: error.message }, 500);
  if (!rows?.length) return reply({ results: [], message: body.source ? 'Fuente no encontrada' : 'No hay fuentes activadas' });

  const results = [];
  for (const row of rows) {
    if (!row.enabled && who === 'cron') continue;
    if (body.action === 'recheck') { results.push(await recheck(row)); continue; }
    const hours = who === 'admin' && body.force ? HARD_FLOOR_HOURS : row.min_interval_hours;
    if (row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < hours * 3600e3) {
      results.push({ source: row.id, ok: true, skipped: `Sincronizada hace menos de ${hours} h` });
      continue;
    }
    results.push(await sync(row, !!body.force));
  }
  return reply({ results });
});

// Panel de administración (privado). Reutiliza los componentes y estilos existentes.
// La seguridad no depende de esta pantalla: las políticas RLS de Supabase solo dejan leer/escribir a admins.
import { h, icon, toast } from '../ui.js';
import { t, loc } from '../i18n.js';
import { ctx, navigate } from '../ctx.js';
import * as cloud from '../supabase.js';
import { chip, safeUrl, fmtDate, emptyState, select } from '../components.js';

let tab = 'sources';
let statusFilter = '';
let busy = new Set();

const TABS = ['sources', 'review', 'imported', 'duplicates', 'manual'];
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('admin.src.never'));
const statusChipCls = { pending: 'warn', approved: 'ok', rejected: 'ghost', duplicate: 'ghost', expired: 'ghost' };
const legalCls = { open: 'ok', terms: 'ok', approved: 'ok', approval: 'warn', blocked: 'warn' };

export function renderAdmin() {
  const root = h('div', { class: 'view fade-up' });
  if (!cloud.isConfigured() || !ctx.user) {
    root.append(header(), h('div', { class: 'card' }, h('p', null, t('admin.needcloud'))));
    return root;
  }
  if (!ctx.isAdmin) {
    root.append(header(), h('div', { class: 'card' }, h('p', null, t('admin.denied'))));
    return root;
  }

  const data = { sources: [], runs: [], opps: [] };
  const body = h('div', { class: 'stack' });
  const tabsEl = h('div', { class: 'filter-chips', role: 'tablist' });
  root.append(header(), tabsEl, body);

  function paintTabs() {
    const counts = {
      review: data.opps.filter((o) => o.review_status === 'pending').length,
      duplicates: data.opps.filter((o) => o.review_status === 'duplicate').length,
    };
    tabsEl.replaceChildren(...TABS.map((k) => h('button', {
      class: 'pick' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(tab === k),
      onclick: () => { tab = k; paint(); },
    }, t('admin.tab.' + k) + (counts[k] ? ` (${counts[k]})` : ''))));
  }

  async function load() {
    try {
      const [sources, runs, opps] = await Promise.all([cloud.adminListSources(), cloud.adminListRuns(), cloud.adminListOpportunities()]);
      Object.assign(data, { sources, runs, opps });
    } catch (e) {
      console.warn('[admin]', e);
      toast(t('admin.toast.error'), 'err');
    }
    paint();
  }

  async function act(key, fn, okMsg) {
    if (busy.has(key)) return;
    busy.add(key); paint();
    try { await fn(); if (okMsg) toast(okMsg); await load(); }
    catch (e) { console.warn('[admin]', e); toast(e?.message ? `${t('admin.toast.error')}: ${String(e.message).slice(0, 120)}` : t('admin.toast.error'), 'err'); }
    finally { busy.delete(key); paint(); }
  }

  const byId = () => new Map(data.opps.map((o) => [o.id, o]));

  function oppRow(o, actions) {
    const url = safeUrl(o.source_url);
    return h('article', { class: 'card' },
      h('div', { class: 'opp-top' },
        h('div', { class: 'opp-badges' },
          chip(t('admin.status.' + o.review_status), statusChipCls[o.review_status] || 'ghost'),
          o.platform ? chip(o.platform) : null,
          o.verification ? chip(t('verif.' + o.verification), 'ghost') : null),
        o.fit_score != null ? chip(`${o.fit_score}/100`, 'ghost') : null),
      h('h3', null, o.title),
      h('p', { class: 'muted clamp' }, o.description),
      h('div', { class: 'opp-meta' },
        h('span', null, icon('clock', 14), ' ', fmtDate(o.posted_at)),
        o.last_checked_at ? h('span', null, icon('check', 14), ' ', fmtDate(o.last_checked_at)) : null,
        o.category ? h('span', null, t('cat.' + o.category)) : null),
      o.reasons?.length ? h('div', { class: 'chips' }, o.reasons.map((r) => chip(t('reason.' + r), 'ghost'))) : null,
      o.analysis?.intent ? h('p', { class: 'muted small' }, `${t('admin.intent')}: ${o.analysis.intent.kind} (${Math.round((o.analysis.intent.confidence || 0) * 100)} %)`) : null,
      h('div', { class: 'row wrap' }, ...(actions || []),
        url ? h('a', { class: 'btn ghost sm', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 16), t('admin.review.open')) : null));
  }

  // ───── pestañas ─────
  function sourcesTab() {
    if (!data.sources.length) return [emptyState('admin.src.empty', 'admin.src.empty')];
    return data.sources.map((s) => {
      const runs = data.runs.filter((r) => r.source_id === s.id).slice(0, 4);
      const blocked = s.legal_status === 'blocked' || s.legal_status === 'approval';
      const working = busy.has('sync:' + s.id) || busy.has('check:' + s.id) || busy.has('toggle:' + s.id);
      return h('article', { class: 'card' },
        h('div', { class: 'opp-top' },
          h('div', { class: 'opp-badges' }, chip(s.enabled ? t('admin.src.on') : t('admin.src.off'), s.enabled ? 'ok' : 'ghost'), chip(t('admin.src.legal.' + s.legal_status), legalCls[s.legal_status] || 'ghost'))),
        h('h3', null, s.name),
        s.notes ? h('p', { class: 'muted small' }, s.notes) : null,
        h('div', { class: 'opp-meta' },
          h('span', null, icon('clock', 14), ' ', `${t('admin.src.last')}: ${fmtTime(s.last_sync_at)}`),
          s.last_status ? h('span', null, s.last_status === 'ok' ? t('admin.src.ok') : t('admin.src.error')) : null),
        s.last_error ? h('p', { class: 'flag' }, icon('info', 14), ' ', s.last_error) : null,
        blocked ? h('p', { class: 'muted small' }, icon('lock', 14), ' ', t('admin.src.blocked')) : null,
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn ' + (s.enabled ? 'ghost' : 'primary') + ' sm', disabled: working || (blocked && !s.enabled), onclick: () => act('toggle:' + s.id, () => cloud.adminSetSourceEnabled(s.id, !s.enabled), s.enabled ? t('admin.toast.disabled') : t('admin.toast.enabled')) }, s.enabled ? t('admin.src.disable') : t('admin.src.enable')),
          h('button', { class: 'btn ghost sm', disabled: working || blocked, onclick: () => act('sync:' + s.id, () => cloud.adminRunSync(s.id, 'sync'), t('admin.toast.synced')) }, working ? t('admin.src.running') : t('admin.src.sync')),
          h('button', { class: 'btn ghost sm', disabled: working || blocked, onclick: () => act('check:' + s.id, () => cloud.adminRunSync(s.id, 'recheck'), t('admin.toast.synced')) }, t('admin.src.recheck'))),
        h('div', null, h('h4', null, t('admin.src.runs')),
          runs.length
            ? h('ul', { class: 'list' }, runs.map((r) => h('li', null,
              `${fmtTime(r.started_at)} · ${r.ok ? t('admin.src.ok') : t('admin.src.error')}`,
              r.ok && r.stats?.fetched != null ? h('div', { class: 'muted small' }, t('admin.src.stats', { fetched: r.stats.fetched ?? 0, imported: r.stats.imported ?? 0, duplicates: r.stats.duplicates ?? 0, expired: (r.stats.expired ?? 0) + (r.stats.linkGone ?? 0) })) : null,
              !r.ok && r.error ? h('div', { class: 'flag' }, r.error) : null)))
            : h('p', { class: 'muted small' }, t('admin.src.runs.empty'))));
    });
  }

  function reviewTab() {
    const list = data.opps.filter((o) => o.review_status === 'pending');
    if (!list.length) return [emptyState('admin.review.empty', 'admin.review.hint')];
    return [h('p', { class: 'muted small' }, icon('info', 14), ' ', t('admin.review.hint')), ...list.map((o) => oppRow(o, [
      h('button', { class: 'btn primary sm', disabled: busy.has('r:' + o.id), onclick: () => act('r:' + o.id, () => cloud.adminReview(o.id, 'approved', ctx.user), t('admin.toast.approved')) }, icon('check', 16), t('admin.review.approve')),
      h('button', { class: 'btn ghost sm', disabled: busy.has('r:' + o.id), onclick: () => act('r:' + o.id, () => cloud.adminReview(o.id, 'rejected', ctx.user), t('admin.toast.rejected')) }, t('admin.review.reject')),
    ]))];
  }

  function importedTab() {
    const statuses = ['pending', 'approved', 'rejected', 'duplicate', 'expired'];
    const list = data.opps.filter((o) => !statusFilter || o.review_status === statusFilter);
    const filter = h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('filter.all')),
      select([{ v: '', l: t('filter.all') }, ...statuses.map((s) => ({ v: s, l: `${t('admin.status.' + s)} (${data.opps.filter((o) => o.review_status === s).length})` }))], statusFilter, (v) => { statusFilter = v; paint(); }));
    return [filter, ...(list.length ? list.map((o) => oppRow(o)) : [emptyState('admin.imported.empty', 'admin.imported.empty')])];
  }

  function duplicatesTab() {
    const list = data.opps.filter((o) => o.review_status === 'duplicate');
    if (!list.length) return [emptyState('admin.dup.empty', 'admin.dup.empty')];
    const map = byId();
    return list.map((o) => {
      const orig = map.get(o.duplicate_of) || data.opps.find((x) => `${x.platform}:${x.external_id}` === o.duplicate_of);
      const info = o.duplicate_info || {};
      const why = info.reason ? t('admin.dup.' + info.reason, { pct: Math.round((info.similarity || 0) * 100) }) : '';
      return h('div', { class: 'stack tight' },
        oppRow(o, [h('button', { class: 'btn ghost sm', onclick: () => act('r:' + o.id, () => cloud.adminReview(o.id, 'pending', ctx.user)) }, t('admin.dup.notdup'))]),
        h('p', { class: 'muted small' }, `${t('admin.dup.of')}: `, orig ? orig.title : t('admin.dup.missing'), why ? ` · ${why}` : ''));
    });
  }

  function manualTab() {
    const url = h('input', { class: 'input', id: 'manual-url', type: 'url', inputmode: 'url', placeholder: 'https://', maxlength: '500' });
    const text = h('textarea', { class: 'input', id: 'manual-text', rows: '8', maxlength: '6000' });
    const out = h('div', { class: 'stack' });
    let analyzed = null;

    async function analyze() {
      out.replaceChildren();
      analyzed = null;
      try {
        const [{ parseManual }, { enrich }] = await Promise.all([
          import('../../supabase/functions/_shared/ingest/adapters/manual.js'),
          import('../../supabase/functions/_shared/ingest/pipeline.js'),
        ]);
        const raw = parseManual({ url: url.value.trim(), text: text.value });
        const o = enrich(raw, { id: null, platform: raw.platform }, new Date());
        o.sourceId = null;
        analyzed = o;
        const yes = o.intent.kind === 'service_request';
        out.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'opp-badges' }, chip(yes ? t('admin.manual.yes') : t('admin.manual.no'), yes ? 'ok' : 'warn'), chip(o.platform), chip(t('cat.' + o.category)), chip(`${o.fit}/100`, 'ghost')),
          h('h3', null, o.title),
          o.skills.length ? h('div', { class: 'chips' }, o.skills.map((s) => chip(s, 'ghost'))) : null,
          o.reasons.length ? h('ul', { class: 'list' }, o.reasons.map((r) => h('li', null, t('reason.' + r)))) : null,
          h('p', { class: 'muted small' }, t('admin.manual.date')),
          h('button', { class: 'btn primary', onclick: save }, t('admin.manual.save'))));
      } catch (e) {
        toast(e.message || t('admin.toast.error'), 'err');
      }
    }

    async function save() {
      if (!analyzed) return;
      try {
        const [{ toRow }, { findDuplicate }] = await Promise.all([
          import('../../supabase/functions/_shared/ingest/db.js'),
          import('../../supabase/functions/_shared/ingest/dedupe.js'),
        ]);
        const pool = data.opps.map((x) => ({ id: x.id, platform: x.platform, externalId: x.external_id, url: x.source_url, title: x.title, description: x.description }));
        const dup = findDuplicate(analyzed, pool);
        if (dup) { toast(t('admin.manual.dup'), 'err'); return; }
        // La entrada manual queda SIEMPRE pendiente de revisión; no tiene fecha de publicación ni comprobación de enlace.
        const row = toRow({ ...analyzed, verification: 'unverified', reviewStatus: 'pending' }, { attribution: null });
        await cloud.adminInsertManual(row);
        toast(t('admin.manual.saved'));
        url.value = ''; text.value = ''; out.replaceChildren(); analyzed = null;
        await load();
      } catch (e) { toast(e.message || t('admin.toast.error'), 'err'); }
    }

    return [h('div', { class: 'card' },
      h('h3', null, t('admin.manual.title')),
      h('p', { class: 'muted small' }, t('admin.manual.sub')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('admin.manual.url')), url),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('admin.manual.text')), text),
      h('button', { class: 'btn ghost', onclick: analyze }, icon('search', 18), t('admin.manual.analyze'))), out];
  }

  function paint() {
    paintTabs();
    // Se conserva lo que se está escribiendo en la pestaña manual si se repinta por otro motivo.
    const keep = tab === 'manual' ? null : undefined;
    const views = { sources: sourcesTab, review: reviewTab, imported: importedTab, duplicates: duplicatesTab, manual: manualTab };
    if (tab === 'manual' && body.dataset.tab === 'manual') return; // no destruir el formulario
    body.dataset.tab = tab;
    body.replaceChildren(...views[tab]());
    void keep;
  }

  body.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  load();
  return root;
}

function header() {
  return h('header', { class: 'view-head' },
    h('div', null, h('h1', null, t('admin.title')), h('p', { class: 'muted' }, t('admin.sub'))),
    h('button', { class: 'btn ghost sm', onclick: () => navigate('profile') }, icon('back', 16), t('nav.profile')));
}

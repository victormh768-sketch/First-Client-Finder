// Componentes de UI reutilizables.
import { h, icon, openSheet, toast } from './ui.js';
import { t, getLang, loc } from './i18n.js';
import * as store from './store.js';
import { beginnerFit, skillMatch } from './scoring.js';
import { ctx, navigate } from './ctx.js';
import { interestSection } from './interest.js';

export const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
export const badge = (text, cls = '') => h('span', { class: `badge ${cls}` }, text);
export const statusChip = (s) => h('span', { class: `status s-${s}` }, t('status.' + s));

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function select(options, value, onchange, { disabled = false } = {}) {
  const el = h('select', { class: 'input', disabled, onchange: (e) => onchange(e.target.value) },
    options.map((o) => h('option', { value: o.v }, o.l)));
  el.value = value;
  return el;
}

export function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

export function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
}

export function relDate(iso) {
  const d = daysSince(iso);
  if (d === null) return '—';
  if (d === 0) return t('time.today');
  if (d === 1) return t('time.yesterday');
  return t('time.days', { n: d });
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function budgetText(o) {
  const b = o.budget;
  if (!b) return t('opp.budget.unknown');
  const f = (n) => new Intl.NumberFormat(getLang(), { style: 'currency', currency: b.currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  const suffix = b.type === 'hourly' ? '/h' : '';
  return b.min && b.max && b.min !== b.max ? `${f(b.min)}–${f(b.max)}${suffix}` : `${f(b.max || b.min)}${suffix}`;
}

export function fitRing(score, size = 48) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const band = score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low';
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="3.5"/><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - score / 100)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  return h('div', { class: `ring ${band}`, style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': `${t('fit.label')} ${score}/100` },
    tpl.content.firstElementChild, h('span', null, String(score)));
}

export function progressBar(value, max, cls = '') {
  return h('div', { class: `bar ${cls}` }, h('i', { style: { width: Math.round((value / max) * 100) + '%' } }));
}

export function lockedBanner(textKey) {
  return h('div', { class: 'locked' }, icon('lock', 18), h('span', null, t(textKey)),
    h('button', { class: 'btn sm primary', onclick: () => navigate('plans') }, t('plans.see')));
}

export function emptyState(titleKey, textKey, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon('target', 28)), h('h3', null, t(titleKey)), h('p', { class: 'muted' }, t(textKey)), action);
}

export function oppCard(o, { onOpen }) {
  const fit = beginnerFit(o);
  const tr = store.getState().tracker[o.id];
  return h('article', {
    class: 'card opp', tabindex: '0', role: 'button',
    onclick: () => onOpen(o),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(o); } },
  },
  h('div', { class: 'opp-top' },
    h('div', { class: 'opp-badges' }, o.isDemo ? badge('DEMO', 'demo') : null, tr ? statusChip(tr.status) : null, chip(t('cat.' + o.category))),
    fitRing(fit.score)),
  h('h3', null, loc(o.title)),
  h('p', { class: 'muted clamp' }, loc(o.description)),
  h('div', { class: 'opp-meta' },
    h('span', null, icon('target', 14), ' ', budgetText(o)),
    h('span', null, icon('clock', 14), ' ', relDate(o.postedAt))),
  h('div', { class: 'chips' }, o.skills.slice(0, 4).map((s) => chip(s, 'ghost'))));
}

// Hoja de detalle de una oportunidad (incluye la explicación del Beginner Fit Score).
export function openOppSheet(o) {
  const fit = beginnerFit(o);
  const m = skillMatch(o, store.getState().profile);
  const tr = store.getState().tracker[o.id];
  const url = safeUrl(o.sourceUrl);
  return openSheet((close) => {
    const act = (fn) => () => { fn(); close(); ctx.rerender(); };
    return h('div', { class: 'stack' },
      o.isDemo ? h('div', { class: 'notice demo' }, icon('info', 18), h('span', null, t('demo.notice'))) : null,
      h('div', { class: 'opp-top' },
        h('div', { class: 'opp-badges' }, o.isDemo ? badge('DEMO', 'demo') : null, chip(t('cat.' + o.category)), tr ? statusChip(tr.status) : null),
        fitRing(fit.score, 56)),
      h('h3', { class: 'sheet-title' }, loc(o.title)),
      h('p', null, loc(o.description)),
      h('dl', { class: 'facts' },
        fact(t('opp.client'), o.client || t('opp.client.unknown')),
        fact(t('opp.budget'), budgetText(o)),
        fact(t('opp.experience'), t('exp.' + o.experience)),
        fact(t('opp.posted'), fmtDate(o.postedAt)),
        fact(t('opp.verified'), fmtDate(o.verifiedAt)),
        o.platform ? fact(t('opp.platform'), o.platform) : null,
        o.verification ? fact(t('opp.verification'), t('verif.' + o.verification)) : null,
        o.lastCheckedAt ? fact(t('opp.checked'), fmtDate(o.lastCheckedAt)) : null),
      o.reasons && o.reasons.length
        ? h('div', null, h('h4', null, t('opp.why')), h('ul', { class: 'list' }, o.reasons.map((r) => h('li', null, t('reason.' + r)))))
        : null,
      o.estimated && o.estimated.length ? h('p', { class: 'muted small disclaimer' }, icon('info', 14), ' ', t('opp.estimated')) : null,
      h('div', null, h('h4', null, t('opp.skills')),
        h('div', { class: 'chips' }, o.skills.map((s) => chip(s, m.matched.includes(s) ? 'ok' : 'ghost')))),
      o.needs && (o.needs[getLang()] || []).length
        ? h('div', null, h('h4', null, t('opp.needs')), h('ul', { class: 'list' }, o.needs[getLang()].map((n) => h('li', null, n)))) : null,
      h('div', { class: 'fit-box' },
        h('h4', null, t('fit.title', { n: fit.score })),
        fit.factors.map((f) => h('div', { class: 'factor' },
          h('div', { class: 'factor-top' }, h('span', null, t('fit.f.' + f.key)), h('b', null, `${f.pts}/${f.max}`)),
          progressBar(f.pts, f.max),
          h('p', { class: 'muted small' }, f.reason))),
        h('p', { class: 'muted small disclaimer' }, icon('info', 14), ' ', t('fit.disclaimer'))),
      o.ownerId ? interestSection(o) : null,
      h('div', { class: 'source' }, h('h4', null, t('opp.source')),
        url
          ? h('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' }, o.sourceName || url, ' ', icon('external', 14))
          : h('p', { class: 'muted small' }, o.isDemo ? t('opp.source.demo') : o.ownerId ? t('int.source') : t('opp.source.none')),
        h('p', { class: 'muted small' }, t('opp.age.notice'))),
      h('div', { class: 'row wrap sticky-actions' },
        tr && tr.status !== 'saved'
          ? null
          : h('button', { class: 'btn ' + (tr ? 'ghost' : 'primary'), onclick: act(() => (tr ? store.untrack(o.id) : (store.track(o, 'saved'), toast(t('toast.saved'))))) },
            icon('bookmark', 18), tr ? t('opp.unsave') : t('opp.save')),
        h('button', { class: 'btn primary', onclick: () => { close(); navigate('proposal?opp=' + encodeURIComponent(o.id)); } }, icon('file', 18), t('opp.prepare'))));
  }, { title: t('opp.detail'), wide: true });
}

function fact(k, v) { return h('div', null, h('dt', null, k), h('dd', null, v)); }

// Zona de empresas (Fase 1): publicar peticiones, ver solicitudes de interés y aceptarlas o rechazarlas.
// La privacidad real la imponen las políticas RLS (003_company_requests.sql); aquí solo se muestra lo que la base devuelve.
import { h, icon, toast, confirmSheet } from '../ui.js';
import { t } from '../i18n.js';
import { ctx, navigate } from '../ctx.js';
import * as cloud from '../supabase.js';
import { chip, field, select, fmtDate, safeUrl, emptyState } from '../components.js';
import { CATEGORIES, LEVELS } from '../data/catalog.js';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()) && String(v).length <= 200;

export function parseRequestForm(f) {
  const title = String(f.title || '').trim();
  const description = String(f.description || '').trim();
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
  const budgetMin = num(f.budgetMin), budgetMax = num(f.budgetMax);
  const skills = [...new Set(String(f.skills || '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 8).map((s) => s.slice(0, 40));
  const errors = [];
  if (title.length < 8 || title.length > 120) errors.push('title');
  if (description.length < 40 || description.length > 3000) errors.push('desc');
  if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) errors.push('budget');
  return { errors, value: { title, description, budgetMin, budgetMax, skills, category: CATEGORIES.includes(f.category) ? f.category : 'other', experience: LEVELS.includes(f.experience) ? f.experience : 'none', complexity: Math.min(5, Math.max(1, Number(f.complexity) || 2)), portfolioRequired: !!f.portfolioRequired } };
}

export function renderCompany() {
  const root = h('div', { class: 'view fade-up' });
  const head = h('header', { class: 'view-head' },
    h('div', null, h('h1', null, t('co.title')), h('p', { class: 'muted' }, t('co.sub'))),
    h('button', { class: 'btn ghost sm', onclick: () => navigate('profile') }, icon('back', 16), t('nav.profile')));
  if (!cloud.isConfigured() || !ctx.user) {
    root.append(head, h('div', { class: 'card' }, h('p', null, t('co.needcloud'))));
    return root;
  }
  const body = h('div', { class: 'stack' });
  root.append(head, body);
  const S = { contact: null, mine: [], interests: [], busy: false };

  async function load() {
    try {
      S.contact = await cloud.getMyContact(ctx.user);
      S.mine = await cloud.listMyRequests(ctx.user);
      S.interests = await cloud.listInterestsForMyRequests(S.mine.map((o) => o.id));
    } catch (e) { toast(e.message || t('admin.toast.error'), 'err'); }
    paint();
  }
  async function act(fn, okKey) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); if (okKey) toast(t(okKey)); await load(); } catch (e) { toast(e.message || t('admin.toast.error'), 'err'); }
    S.busy = false;
  }

  function contactCard() {
    const name = h('input', { class: 'input', maxlength: '120', value: S.contact?.company_name || '', autocomplete: 'organization' });
    const mail = h('input', { class: 'input', type: 'email', maxlength: '200', value: S.contact?.contact_email || ctx.user.email || '', autocomplete: 'email' });
    return h('section', { class: 'card' }, h('h3', null, t('co.contact.title')),
      h('p', { class: 'muted small' }, icon('lock', 14), ' ', t('co.contact.sub')),
      field(t('co.company'), name), field(t('co.email'), mail),
      h('button', { class: 'btn primary', onclick: () => {
        if (name.value.trim().length < 2) return toast(t('co.err.company'), 'err');
        if (!isEmail(mail.value)) return toast(t('co.err.email'), 'err');
        act(() => cloud.saveMyContact(ctx.user, { companyName: name.value.trim(), contactEmail: mail.value.trim() }), 'co.saved');
      } }, t('co.save')));
  }

  function formCard() {
    const F = h('div', { class: 'stack' });
    const el = (tag, attrs) => h(tag, { class: 'input', ...attrs });
    const title = el('input', { maxlength: '120' });
    const desc = el('textarea', { rows: '6', maxlength: '3000' });
    const skills = el('input', { maxlength: '200' });
    const min = el('input', { inputmode: 'decimal', maxlength: '8' });
    const max = el('input', { inputmode: 'decimal', maxlength: '8' });
    let cat = 'design', exp = 'none', cx = '2';
    const port = h('input', { type: 'checkbox' });
    const catSel = select(CATEGORIES.map((c) => ({ v: c, l: t('cat.' + c) })), cat, (v) => { cat = v; });
    const expSel = select(['none', 'junior'].map((l) => ({ v: l, l: t('exp.' + l) })), exp, (v) => { exp = v; });
    const cxSel = select([1, 2, 3, 4, 5].map((n) => ({ v: String(n), l: t('fit.cx.' + n) })), cx, (v) => { cx = v; });
    F.append(
      h('p', { class: 'muted small' }, icon('info', 14), ' ', t('co.new.sub')),
      field(t('co.f.title'), title), field(t('co.f.desc'), desc, t('co.f.desc.hint')),
      field(t('co.f.cat'), catSel), field(t('co.f.skills'), skills, t('co.f.skills.hint')),
      h('div', { class: 'row wrap' }, field(t('co.f.min'), min), field(t('co.f.max'), max)),
      field(t('co.f.exp'), expSel), field(t('co.f.cx'), cxSel),
      h('label', { class: 'row' }, port, h('span', null, t('co.f.portfolio'))),
      h('button', { class: 'btn primary', onclick: () => {
        if (!S.contact) return toast(t('co.needcontact'), 'err');
        const r = parseRequestForm({ title: title.value, description: desc.value, skills: skills.value, budgetMin: min.value, budgetMax: max.value, category: cat, experience: exp, complexity: cx, portfolioRequired: port.checked });
        if (r.errors.length) return toast(t('co.err.' + r.errors[0]), 'err');
        act(() => cloud.createRequest(ctx.user, { ...r.value, companyName: S.contact.company_name }), 'co.submitted');
      } }, icon('plus', 18), t('co.submit')));
    return h('section', { class: 'card' }, h('h3', null, t('co.new.title')), F);
  }

  function interestRow(i) {
    const url = safeUrl(i.portfolio_url);
    return h('div', { class: 'card inner' },
      h('div', { class: 'row wrap' }, h('b', null, i.display_name), chip(t('co.i.' + i.status), i.status === 'accepted' ? 'ok' : i.status === 'declined' ? 'ghost' : 'warn'),
        h('span', { class: 'muted small' }, fmtDate(i.created_at))),
      i.level ? h('p', { class: 'muted small' }, t('exp.' + i.level)) : null,
      i.skills?.length ? h('div', { class: 'chips' }, i.skills.slice(0, 8).map((s) => chip(s, 'ghost'))) : null,
      i.message ? h('p', { style: { whiteSpace: 'pre-wrap' } }, i.message) : null,
      url ? h('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' }, url, ' ', icon('external', 14)) : null,
      i.status === 'pending'
        ? h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary sm', onclick: async () => { if (await confirmSheet({ title: t('co.accept'), message: t('co.accept.msg'), confirmLabel: t('co.accept') })) act(() => cloud.respondInterest(i.id, true), 'co.accepted.toast'); } }, icon('check', 16), t('co.accept')),
          h('button', { class: 'btn ghost sm', onclick: () => act(() => cloud.respondInterest(i.id, false), 'co.declined.toast') }, t('co.decline')))
        : null,
      i.status === 'accepted' ? h('p', { class: 'notice' }, icon('mail', 16), ' ', t('co.revealed'), ' ', h('b', null, i.email || '—')) : null);
  }

  function requestCard(o) {
    const st = !o.active ? 'closed' : ['pending', 'approved', 'rejected'].includes(o.review_status) ? o.review_status : 'pending';
    const list = S.interests.filter((i) => i.opportunity_id === o.id);
    return h('section', { class: 'card' },
      h('div', { class: 'row wrap' }, chip(t('co.status.' + st), st === 'approved' ? 'ok' : st === 'pending' ? 'warn' : 'ghost'), chip(t('cat.' + o.category), 'ghost')),
      h('h3', null, o.title),
      st === 'pending' ? h('p', { class: 'muted small' }, t('co.review.note')) : null,
      h('h4', null, `${t('co.interests')} (${list.length})`),
      list.length ? h('div', { class: 'stack tight' }, list.map(interestRow)) : h('p', { class: 'muted small' }, t('co.nointerests')),
      o.active ? h('button', { class: 'btn ghost sm', onclick: async () => { if (await confirmSheet({ title: t('co.close'), message: t('co.close.msg'), confirmLabel: t('co.close') })) act(() => cloud.closeRequest(o.id), 'co.closed.toast'); } }, t('co.close')) : null);
  }

  function paint() {
    body.replaceChildren(contactCard(), formCard(), h('h2', null, t('co.mine')),
      ...(S.mine.length ? S.mine.map(requestCard) : [emptyState('co.empty', 'co.empty')]));
  }
  body.replaceChildren(h('div', { class: 'skeleton' }));
  load();
  return root;
}

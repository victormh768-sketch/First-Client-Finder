import { h, icon, toast } from '../ui.js';
import { t } from '../i18n.js';
import * as store from '../store.js';
import { ctx } from '../ctx.js';
import { CONFIG } from '../config.js';
import { badge } from '../components.js';

export function renderPlans() {
  const pro = store.isPro();
  const L = CONFIG.FREE_LIMITS;
  const li = (text, on = true) => h('li', { class: on ? '' : 'off' }, icon(on ? 'check' : 'lock', 16), h('span', null, text));

  return h('div', { class: 'view fade-up' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', null, t('plans.title')), h('p', { class: 'muted' }, t('plans.sub')))),
    h('div', { class: 'plans' },
      h('section', { class: 'card plan' + (!pro ? ' current' : '') },
        h('div', { class: 'plan-head' }, h('h2', null, 'FREE'), !pro ? badge(t('plans.current'), 'ok') : null),
        h('p', { class: 'price' }, '0 €'),
        h('ul', { class: 'features' },
          li(t('plans.f.opps', { n: L.opportunitiesVisible })), li(t('plans.f.filters.basic')),
          li(t('plans.f.proposals', { n: L.proposalsPerMonth })), li(t('plans.f.tracker.basic', { n: L.notesPerOpportunity })),
          li(t('plans.f.rec.generic'))),
        h('button', { class: 'btn ghost', disabled: !pro, onclick: () => { store.setPlan('free'); ctx.rerender(); } }, pro ? t('plans.switch.free') : t('plans.current'))),
      h('section', { class: 'card plan pro' + (pro ? ' current' : '') },
        h('div', { class: 'plan-head' }, h('h2', null, 'PRO'), pro ? badge(t('plans.current'), 'ok') : badge(t('plans.soon'), 'pro')),
        h('p', { class: 'price' }, t('plans.price.soon')),
        h('ul', { class: 'features' },
          li(t('plans.f.opps.all')), li(t('plans.f.filters.adv')), li(t('plans.f.proposals.all')),
          li(t('plans.f.tracker.adv')), li(t('plans.f.rec.personal'))),
        h('button', { class: 'btn primary', disabled: true }, t('plans.soon.btn')),
        h('div', { class: 'notice' }, icon('info', 18), h('span', null, t('plans.nopayments'))),
        pro ? null : h('button', { class: 'btn ghost', onclick: () => { store.setPlan('pro'); toast(t('plans.preview.on')); ctx.rerender(); } }, t('plans.preview')))));
}

import { h, icon, toast } from '../ui.js';
import { t, setLang, getLang, LANGS } from '../i18n.js';
import * as store from '../store.js';
import { navigate } from '../ctx.js';
import { SKILLS, CATEGORIES, LEVELS, GOALS } from '../data/catalog.js';
import { field, safeUrl } from '../components.js';

const TOTAL = 7;
let step = 0;
let draft = null;

export function renderOnboarding(params) {
  const edit = params.get('edit') === '1';
  if (draft === null) {
    draft = JSON.parse(JSON.stringify(store.getState().profile));
    step = edit ? 1 : 0;
  }
  const wrap = h('div', { class: 'onb' });

  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  const pick = (label, on, fn) => h('button', { type: 'button', class: 'pick' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: fn }, on ? icon('check', 16) : null, label);

  function valid() {
    if (step === 1 && !draft.name.trim()) return t('onb.err.name');
    if (step === 2 && !draft.skills.length) return t('onb.err.skills');
    if (step === 4 && !draft.services.length) return t('onb.err.services');
    if (step === 5 && draft.hasPortfolio && draft.portfolioUrl.trim() && !safeUrl(draft.portfolioUrl.trim())) return t('onb.err.url');
    if (step === 6 && !draft.goals.length) return t('onb.err.goals');
    return '';
  }

  function next() {
    const err = valid();
    if (err) { toast(err, 'err'); return; }
    if (step === TOTAL - 1) {
      store.saveProfile({ ...draft, name: draft.name.trim(), portfolioUrl: draft.hasPortfolio ? draft.portfolioUrl.trim() : '' }, { finish: true });
      draft = null;
      toast(t('onb.done'));
      navigate('dashboard');
      return;
    }
    step += 1;
    paint();
  }

  function back() {
    if (step > 0 && !(edit && step === 1)) { step -= 1; paint(); return; }
    if (edit) { draft = null; navigate('profile'); }
  }

  function body() {
    switch (step) {
      case 0:
        return h('div', { class: 'stack' },
          h('div', { class: 'logo big' }, icon('target', 28)),
          h('h1', null, t('onb.welcome')),
          h('p', { class: 'muted' }, t('onb.welcome.sub')),
          h('h3', null, icon('globe', 18), ' ', t('onb.lang.title')),
          h('div', { class: 'picks' }, LANGS.map((l) => pick(l.label, getLang() === l.code, () => { setLang(l.code); paint(); }))));
      case 1:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.name.title')),
          h('p', { class: 'muted' }, t('onb.name.sub')),
          field(t('onb.name.label'), h('input', { class: 'input', type: 'text', maxlength: '60', autocomplete: 'given-name', value: draft.name, placeholder: t('onb.name.ph'), oninput: (e) => { draft.name = e.target.value; } })));
      case 2:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.skills.title')),
          h('p', { class: 'muted' }, t('onb.skills.sub')),
          Object.entries(SKILLS).map(([cat, list]) => h('div', null,
            h('h4', null, t('cat.' + cat)),
            h('div', { class: 'picks' }, list.map((s) => pick(s, draft.skills.includes(s), () => { toggle(draft.skills, s); paint(); }))))),
          customSkill());
      case 3:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.level.title')),
          h('div', { class: 'radios' }, LEVELS.map((l) => h('button', { type: 'button', class: 'radio' + (draft.level === l ? ' on' : ''), 'aria-pressed': String(draft.level === l), onclick: () => { draft.level = l; paint(); } },
            h('b', null, t('level.' + l)), h('span', { class: 'muted small' }, t('level.' + l + '.d'))))));
      case 4:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.services.title')),
          h('p', { class: 'muted' }, t('onb.services.sub')),
          h('div', { class: 'picks' }, CATEGORIES.map((c) => pick(t('cat.' + c), draft.services.includes(c), () => { toggle(draft.services, c); paint(); }))));
      case 5:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.portfolio.title')),
          h('p', { class: 'muted' }, t('onb.portfolio.sub')),
          h('div', { class: 'radios' },
            h('button', { type: 'button', class: 'radio' + (draft.hasPortfolio ? ' on' : ''), onclick: () => { draft.hasPortfolio = true; paint(); } }, h('b', null, t('onb.portfolio.yes'))),
            h('button', { type: 'button', class: 'radio' + (!draft.hasPortfolio ? ' on' : ''), onclick: () => { draft.hasPortfolio = false; paint(); } }, h('b', null, t('onb.portfolio.no')))),
          draft.hasPortfolio ? field(t('onb.portfolio.url'), h('input', { class: 'input', type: 'url', inputmode: 'url', maxlength: '200', value: draft.portfolioUrl, placeholder: 'https://', oninput: (e) => { draft.portfolioUrl = e.target.value; } }), t('onb.portfolio.hint')) : h('p', { class: 'muted small' }, t('onb.portfolio.tip')));
      default:
        return h('div', { class: 'stack' },
          h('h1', null, t('onb.goals.title')),
          h('div', { class: 'picks' }, GOALS.map((g) => pick(t('goal.' + g), draft.goals.includes(g), () => { toggle(draft.goals, g); paint(); }))),
          h('div', { class: 'notice' }, icon('shield', 18), h('span', null, t('onb.age.notice'))));
    }
  }

  function customSkill() {
    const input = h('input', { class: 'input', type: 'text', maxlength: '30', placeholder: t('onb.skills.custom') });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      if (!draft.skills.some((s) => s.toLowerCase() === v.toLowerCase())) draft.skills.push(v);
      paint();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const custom = draft.skills.filter((s) => !Object.values(SKILLS).flat().includes(s));
    return h('div', null, h('h4', null, t('onb.skills.other')),
      custom.length ? h('div', { class: 'picks' }, custom.map((s) => pick(s, true, () => { toggle(draft.skills, s); paint(); }))) : null,
      h('div', { class: 'row' }, input, h('button', { class: 'btn ghost', type: 'button', onclick: add }, icon('plus', 18), t('common.add'))));
  }

  function paint() {
    wrap.replaceChildren(
      h('div', { class: 'onb-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(TOTAL), 'aria-valuenow': String(step + 1) },
        Array.from({ length: TOTAL }, (_, i) => h('i', { class: i <= step ? 'on' : '' }))),
      h('div', { class: 'onb-card fade-up' }, body()),
      h('div', { class: 'onb-nav' },
        step > 0 || edit ? h('button', { class: 'btn ghost', onclick: back }, icon('back', 18), edit && step === 1 ? t('common.cancel') : t('common.back')) : h('span'),
        h('button', { class: 'btn primary', onclick: next }, step === TOTAL - 1 ? t('onb.finish') : t('common.next'), icon('arrow', 18))));
  }

  paint();
  return wrap;
}

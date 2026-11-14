// «Me interesa»: sección de la ficha de una petición de empresa. El correo solo llega a la empresa si ella acepta.
import { h, icon, toast } from './ui.js';
import { t } from './i18n.js';
import * as store from './store.js';
import { ctx } from './ctx.js';
import * as cloud from './supabase.js';
import { field } from './components.js';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()) && String(v).length <= 200;

export function interestSection(o) {
  const box = h('div', { class: 'stack fit-box' }, h('h4', null, t('int.title')));
  if (!o.ownerId || !cloud.isConfigured()) return null;
  if (!ctx.user) { box.append(h('p', { class: 'muted small' }, t('int.signin'))); return box; }
  if (o.ownerId === ctx.user.id) { box.append(h('p', { class: 'muted small' }, t('int.own'))); return box; }

  async function paint() {
    let mine = null;
    try { mine = await cloud.getMyInterest(ctx.user, o.id); } catch { /* sin red */ }
    const kids = [h('h4', null, t('int.title'))];
    if (mine) {
      kids.push(h('p', null, t('int.state.' + mine.status)));
      if (mine.status === 'accepted') {
        let c = null;
        try { c = await cloud.getRevealedCompanyContact(o.ownerId); } catch { /* */ }
        kids.push(h('p', { class: 'notice' }, icon('mail', 16), ' ', c ? `${c.company_name} · ` : '', h('b', null, c?.contact_email || '—')));
      }
      if (mine.status === 'pending') kids.push(h('button', { class: 'btn ghost sm', onclick: async () => { try { await cloud.withdrawInterest(mine.id); toast(t('int.withdrawn')); paint(); } catch (e) { toast(e.message, 'err'); } } }, t('int.withdraw')));
    } else {
      const p = store.getState().profile;
      const msg = h('textarea', { class: 'input', rows: '5', maxlength: '1500', placeholder: t('int.message.ph') });
      const mail = h('input', { class: 'input', type: 'email', maxlength: '200', value: ctx.user.email || '' });
      let sending = false;
      kids.push(h('p', { class: 'muted small' }, icon('lock', 14), ' ', t('int.privacy')),
        field(t('int.message'), msg), field(t('int.email'), mail, t('int.email.hint')),
        h('button', { class: 'btn primary', onclick: async () => {
          if (sending) return;
          if (!isEmail(mail.value)) return toast(t('co.err.email'), 'err');
          sending = true;
          try {
            await cloud.sendInterest(ctx.user, o.id, { displayName: p.name || '—', skills: p.skills.slice(0, 12), level: p.level, portfolioUrl: /^https:\/\//i.test(p.portfolioUrl || '') ? p.portfolioUrl : null, message: msg.value.trim(), email: mail.value.trim() });
            toast(t('int.sent')); paint();
          } catch (e) { toast(e.message || t('admin.toast.error'), 'err'); }
          sending = false;
        } }, icon('check', 18), t('int.send')));
    }
    box.replaceChildren(...kids);
  }
  paint();
  return box;
}

// Calidad de la oportunidad: avisos de contenido, estado (caducada, enlace roto, duplicada) y posibles señales de fraude.
// Son AVISOS para la revisión humana, no veredictos: nada se rechaza automáticamente por esto, y nunca se afirma que algo sea un fraude.
import { normalizeText } from './text.js';

const FLAG = {
  expired: ['critical', 'Publicación caducada por antigüedad.'],
  link_broken: ['critical', 'El enlace original ya no existe (404/410).'],
  duplicate: ['warn', 'Duplicada de otra oportunidad ya guardada.'],
  no_budget: ['warn', 'Presupuesto no especificado.'],
  insufficient_info: ['warn', 'Información insuficiente para valorarla.'],
  no_date: ['info', 'Sin fecha de publicación: no se puede saber si sigue vigente.'],
  unpaid_or_equity_only: ['warn', 'Parece no ofrecer pago (solo participación o experiencia).'],
};

// Señales de posible fraude: [expresión sobre texto normalizado, gravedad, texto]
const FRAUD = [
  [/\b(registration|processing|training|application|starter|security) fee\b|refundable deposit|\b(pay|send|deposit) (us |a |an )?(small )?(fee|deposit)\b|cuota de inscripcion|pagar (una )?(cuota|tasa)/, 'critical', 'Pide un pago previo (cuota o depósito) al candidato.'],
  [/cashier s? check|we will (send|mail) you a (check|cheque)|(buy|purchase)[^.]{0,40}(equipment|laptop|software)[^.]{0,60}(reimburs|refund)|te enviaremos un cheque/, 'critical', 'Cheque o compra de equipo con reembolso posterior.'],
  [/gift cards?|western union|moneygram|tarjetas regalo/, 'critical', 'Menciona pagos con tarjetas regalo o transferencias de efectivo.'],
  [/\b(ssn|social security|passport (copy|scan|number)|bank (login|password|account details)|copy of (your )?id|copia de tu dni|contrasena del banco)\b/, 'critical', 'Pide datos sensibles (identificación o bancarios) en la oferta.'],
  [/(contact|message|text|dm|reach|escribeme|contacta)[^.]{0,25}(telegram|whatsapp|signal)|\bwa me\b|\btelegram [a-z0-9_]{4,}/, 'warn', 'Dirige a Telegram/WhatsApp en lugar de la plataforma.'],
  [/(earn|make|gana(r)?) \$?€?\d{3,}[^.]{0,30}(per|a|al|por|\/) ?(day|hour|week|dia|hora|semana)[^.]{0,80}(no experience|easy|simple|sin experiencia|facil)|guaranteed (income|earnings)|ingresos garantizados/, 'warn', 'Promete ingresos altos y fáciles sin experiencia.'],
  [/(urgent(ly)?|asap|immediately|urgente)[^.]{0,60}(send|pay|deposit|envia|paga)|keep (this )?(confidential|secret)/, 'warn', 'Urgencia o secretismo junto a una petición de dinero o datos.'],
  [/\b(bit ly|tinyurl|cutt ly|goo gl|t co|is gd)\b/, 'warn', 'Usa enlaces acortados que ocultan el destino.'],
];
const UNPAID = /\b(unpaid|no pay|equity only|sin remuneracion|no remunerad[oa]|for exposure|por visibilidad|a cambio de experiencia|for experience only)\b/;
const DELIVERABLE_RE = /\b(logo|website|landing|video|design|translat|traduc|copywrit|social media|seo|automation|wordpress|shopify|ads|marketing|illustrat|animation|thumbnail|presentation|spreadsheet|data entry|assistant|chatbot|script|bot|edit)/;

export function assessQuality(o) {
  const t = normalizeText(`${o.title || ''} ${o.description || ''}`.slice(0, 6000));
  const flags = [];
  const add = (code) => { if (!flags.some((x) => x.code === code)) flags.push({ code, severity: FLAG[code][0], text: FLAG[code][1] }); };
  if (!o.budget) add('no_budget');
  if (!o.postedAt) add('no_date');
  if (t.length < 100 || (!DELIVERABLE_RE.test(t) && !(o.skills || []).length && o.category === 'other')) add('insufficient_info');
  if (UNPAID.test(t)) add('unpaid_or_equity_only');
  const signals = FRAUD.filter(([re]) => re.test(t)).map(([, sev, text]) => ({ severity: sev, text }));
  const level = signals.some((s) => s.severity === 'critical') || signals.length >= 2 ? 'high' : signals.length === 1 ? 'possible' : 'none';
  return finalize({ flags, fraud: { level, signals } });
}

function finalize(q) {
  const crit = q.flags.some((f) => f.severity === 'critical');
  const warns = q.flags.filter((f) => f.severity === 'warn').length;
  q.level = crit || q.fraud.level === 'high' ? 'poor' : warns >= 1 || q.fraud.level === 'possible' ? 'review' : 'good';
  return q;
}

/** Añade un aviso de estado (expired | link_broken | duplicate) que solo se conoce después del pipeline. */
export function addStatusFlag(o, code) {
  if (!o.quality || o.quality.flags.some((x) => x.code === code)) return;
  o.quality.flags.push({ code, severity: FLAG[code][0], text: FLAG[code][1] });
  finalize(o.quality);
}

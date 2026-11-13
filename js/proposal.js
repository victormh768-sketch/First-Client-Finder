// Asistente de propuestas basado en plantillas (gratuito, sin API de IA).
// Punto de ampliación: sustituir generate() por una llamada a un LLM (servicio de pago).
// IMPORTANTE: este módulo solo genera texto. Nunca envía nada.
import { loc } from './i18n.js';
import { skillMatch } from './scoring.js';

const QUESTIONS = {
  design: { es: ['¿Tienes referencias o ejemplos de estilos que te gusten?', '¿En qué formatos necesitas los archivos finales?'], en: ['Do you have references or styles you like?', 'Which file formats do you need for delivery?'] },
  writing: { es: ['¿Hay una guía de tono o textos de ejemplo?', '¿Quién proporciona la información de base?'], en: ['Is there a tone guide or sample text?', 'Who provides the background information?'] },
  video: { es: ['¿Ya tienes el material grabado y la música?', '¿Dónde se publicarán los vídeos?'], en: ['Do you already have the footage and music?', 'Where will the videos be published?'] },
  social: { es: ['¿Qué objetivo tiene la cuenta (ventas, comunidad…)?', '¿Quién aprueba las publicaciones antes de salir?'], en: ['What is the account’s goal (sales, community…)?', 'Who approves posts before they go live?'] },
  web: { es: ['¿Tienes contenidos e imágenes listos?', '¿Dónde está alojada o se alojará la web?'], en: ['Do you have content and images ready?', 'Where is or will the site be hosted?'] },
  translation: { es: ['¿Hay un glosario o términos que deba respetar?', '¿Cuál es la fecha límite?'], en: ['Is there a glossary or terms I should follow?', 'What is the deadline?'] },
  data: { es: ['¿Me puedes enviar una muestra de los datos?', '¿Qué formato final prefieres?'], en: ['Can you send a sample of the data?', 'Which final format do you prefer?'] },
  support: { es: ['¿Qué horarios necesitas cubrir exactamente?', '¿Hay plantillas o una guía de respuestas?'], en: ['Which hours exactly do you need covered?', 'Are there templates or a reply guide?'] },
  other: { es: ['¿Puedes detallar el alcance y los plazos?'], en: ['Can you detail the scope and timeline?'] },
};

const T = {
  es: {
    hello: { professional: (c) => `Hola${c ? ` ${c}` : ''},`, friendly: (c) => `¡Hola${c ? ` ${c}` : ''}!`, direct: () => 'Hola,' },
    intro: (title) => `He visto tu publicación «${title}» y me gustaría ayudarte.`,
    needs: (list) => `Por lo que describes, necesitas: ${list}.`,
    about: (name, skills) => `Soy ${name}${skills ? ` y trabajo con ${skills}` : ''}.`,
    level: { none: 'Estoy dando mis primeros pasos como freelance, así que cuido mucho cada detalle y la comunicación.', junior: 'Tengo algo de experiencia en proyectos pequeños y me gusta comunicar el avance con claridad.', mid: 'Tengo experiencia en proyectos similares y trabajo con plazos claros.', senior: 'Tengo amplia experiencia en proyectos de este tipo.' },
    portfolio: (url) => `Puedes ver mi trabajo aquí: ${url}`,
    noPortfolio: '[Añade aquí un enlace a una muestra o ejemplo de tu trabajo, o ofrece preparar una pequeña prueba.]',
    questions: 'Antes de empezar, me gustaría confirmar:',
    close: { professional: 'Quedo a tu disposición para concretar alcance, plazos y presupuesto. Gracias por tu tiempo.', friendly: '¡Cuéntame y lo vemos! Gracias por leerme.', direct: '¿Hablamos de plazos y presupuesto? Gracias.' },
    regards: 'Un saludo,',
    yourName: '[Tu nombre]',
  },
  en: {
    hello: { professional: (c) => `Hello${c ? ` ${c}` : ''},`, friendly: (c) => `Hi${c ? ` ${c}` : ''}!`, direct: () => 'Hello,' },
    intro: (title) => `I saw your post “${title}” and I’d like to help.`,
    needs: (list) => `From your description, you need: ${list}.`,
    about: (name, skills) => `I’m ${name}${skills ? ` and I work with ${skills}` : ''}.`,
    level: { none: 'I’m just starting out as a freelancer, so I pay close attention to detail and communication.', junior: 'I have some experience with small projects and I like to keep clients updated clearly.', mid: 'I have experience with similar projects and work with clear deadlines.', senior: 'I have extensive experience with projects like this.' },
    portfolio: (url) => `You can see my work here: ${url}`,
    noPortfolio: '[Add a link to a sample of your work here, or offer to prepare a small trial.]',
    questions: 'Before starting, I’d like to confirm:',
    close: { professional: 'I’m happy to agree on scope, timeline and budget. Thank you for your time.', friendly: 'Let me know and we can sort it out! Thanks for reading.', direct: 'Shall we talk timeline and budget? Thanks.' },
    regards: 'Best regards,',
    yourName: '[Your name]',
  },
};

export function analyze(o, profile, lang) {
  const m = skillMatch(o, profile);
  const questions = (QUESTIONS[o.category] || QUESTIONS.other)[lang] || [];
  const needs = (o.needs && o.needs[lang]) || [];
  const flags = [];
  if (!o.budget) flags.push('budget');
  if (o.portfolioRequired && !profile.hasPortfolio) flags.push('portfolio');
  if (m.missing.length) flags.push('missing');
  return { needs, matched: m.matched, missing: m.missing, questions, flags };
}

export function generate(o, profile, tone, lang) {
  const L = T[lang] || T.es;
  const a = analyze(o, profile, lang);
  const name = (profile.name || '').trim();
  const mySkills = (a.matched.length ? a.matched : profile.skills || []).slice(0, 3).join(', ');
  const portfolio = profile.hasPortfolio && /^https?:\/\//i.test(profile.portfolioUrl || '')
    ? L.portfolio(profile.portfolioUrl)
    : L.noPortfolio;
  const parts = [
    L.hello[tone] ? L.hello[tone](o.client && !o.isDemo ? o.client : '') : L.hello.professional(''),
    '',
    L.intro(loc(o.title)),
  ];
  if (a.needs.length) parts.push(L.needs(a.needs.map((n) => n.replace(/\.$/, '').toLowerCase()).join(', ')));
  parts.push('', `${L.about(name || L.yourName, mySkills)} ${L.level[profile.level] || ''}`.trim(), portfolio);
  if (a.questions.length) {
    parts.push('', L.questions, ...a.questions.map((q, i) => `${i + 1}) ${q}`));
  }
  parts.push('', L.close[tone] || L.close.professional, '', L.regards, name || L.yourName);
  return parts.join('\n');
}

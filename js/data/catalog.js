// Catálogos neutros de idioma (las etiquetas se traducen en i18n.js).
export const CATEGORIES = ['design', 'writing', 'video', 'social', 'web', 'translation', 'data', 'support', 'marketing', 'automation'];
export const LEVELS = ['none', 'junior', 'mid', 'senior'];
export const GOALS = ['first_client', 'side_income', 'portfolio', 'full_time', 'test'];

export const SKILLS = {
  design: ['Canva', 'Figma', 'Logo design', 'Photoshop', 'Illustrator'],
  writing: ['Copywriting', 'SEO writing', 'Proofreading', 'Research'],
  video: ['Video editing', 'Subtitles', 'Motion graphics'],
  social: ['Social media', 'Community management', 'Email marketing'],
  web: ['HTML/CSS', 'JavaScript', 'WordPress', 'Responsive design'],
  translation: ['Translation', 'Localization'],
  data: ['Excel/Sheets', 'Data entry', 'Data visualization'],
  support: ['Customer support', 'Virtual assistance'],
  marketing: ['SEO', 'Google Ads', 'Meta Ads'],
  automation: ['Zapier', 'Make', 'n8n', 'Scripting'],
};

export const ALL_SKILLS = Object.values(SKILLS).flat();

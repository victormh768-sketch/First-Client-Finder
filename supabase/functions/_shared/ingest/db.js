// Traducción entre el formato común (camelCase) y las columnas de la tabla `opportunities` (snake_case).
export function toRow(o, source) {
  return {
    title: o.title,
    description: o.description,
    client_name: o.client,
    category: o.category,
    budget_min: o.budget?.min ?? null,
    budget_max: o.budget?.max ?? null,
    currency: o.budget?.currency ?? 'EUR',
    budget_type: o.budget?.type ?? 'fixed',
    skills: o.skills,
    experience: o.experience,
    complexity: o.complexity,
    portfolio_required: o.portfolioRequired,
    needs: [],
    posted_at: o.postedAt,
    last_checked_at: o.lastCheckedAt,
    // «Última verificación» visible para el usuario: solo cuando el enlace se comprobó de verdad.
    verified_at: o.verification === 'link_ok' ? o.lastCheckedAt : null,
    source_name: o.platform,
    source_url: o.url,
    license_note: source?.attribution ?? null,
    is_demo: false,
    active: true,
    platform: o.platform,
    external_id: o.externalId,
    source_id: o.sourceId,
    review_status: o.reviewStatus,
    verification: o.verification,
    fingerprint: o.fingerprint,
    duplicate_of: o.duplicateOf ?? null,
    duplicate_info: o.duplicateInfo ?? null,
    reasons: o.reasons,
    estimated: o.estimated,
    fit_score: o.fit,
    analysis: { intent: o.intent, type: o.typeInfo, beginner: o.beginner, quality: o.quality },
  };
}

// Fila de BD → objeto que usa el pool de deduplicación.
export const toPoolItem = (r) => ({ id: r.id, platform: r.platform, externalId: r.external_id, url: r.source_url, title: r.title, description: r.description });

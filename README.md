# First Client Finder

Plataforma para que jóvenes emprendedores y principiantes consigan su **primer cliente**: encuentra oportunidades adecuadas, entiende qué necesita cada cliente, prepara propuestas y haz seguimiento.

HTML + CSS + JavaScript (módulos ES, **sin build**) · Supabase opcional · desplegable tal cual en Vercel.

## Probar en local

```bash
npx serve . -l 3000     # o cualquier servidor estático
```

Abre http://localhost:3000. Sin configurar nada funciona en **modo local** (datos en `localStorage`).

## Estructura

```
index.html            shell de la app
privacy.html          política de privacidad (plantilla a revisar legalmente)
css/styles.css        tema oscuro + acento lima, responsive mobile-first
js/
  app.js              router por hash, shell, arranque, sincronización con la nube
  ctx.js              contexto compartido + navegación
  store.js            estado (localStorage), tracker, planes y cuotas
  i18n.js             traducciones ES/EN
  scoring.js          Beginner Fit Score (0-100, explicado) y recomendaciones
  proposal.js         análisis + generador de propuestas por plantillas (no envía nada)
  supabase.js         auth + base de datos (opcional)
  config.js           claves de Supabase y límites del plan FREE
  sources/index.js    adaptadores de fuentes de oportunidades
  data/               catálogos y oportunidades DEMO
  views/              onboarding, dashboard, finder, tracker, proposal, profile, plans
supabase/schema.sql   tablas + RLS
supabase/migrations/  002_ingestion.sql (fuentes, revisión, admins)
supabase/functions/   sync-sources (Edge Function) + _shared/ingest (adaptadores y pipeline)
docs/                 FEASIBILITY.md, INGESTION.md
tests/                pruebas del pipeline (datos sintéticos)
scripts/check.mjs     comprobaciones (i18n, scoring, propuestas)
```

## Datos y fuentes reales

- Las oportunidades de `js/data/demo-opportunities.js` son **ficticias** y se muestran con la etiqueta DEMO, sin enlace de origen.
- Cada oportunidad guarda `sourceName`, `sourceUrl`, `postedAt` y `verifiedAt`.
- Para conectar fuentes reales, crea un adaptador `{ id, name, enabled(), fetch() }` en `js/sources/index.js` (APIs oficiales, feeds autorizados o la tabla `opportunities` de Supabase). **No hagas scraping indiscriminado** ni automatices contactos.
- Cuando tengas fuentes reales, pon `SHOW_DEMO_DATA: false` en `js/config.js`.

## Conectar Supabase (gratis)

1. Crea un proyecto en supabase.com y ejecuta `supabase/schema.sql` en el SQL Editor.
2. En *Project Settings → API* copia la URL y la clave pública (anon/publishable).
3. Pégalas en `js/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). La clave anon es pública; la seguridad la dan las políticas RLS.
4. En *Authentication → URL Configuration* añade la URL de tu despliegue de Vercel.

El plan (`free`/`pro`) vive en la tabla `subscriptions`, que los usuarios **no** pueden modificar.

## Desplegar

1. Sube el proyecto a GitHub.
2. En Vercel: *Add New → Project*, importa el repo (Framework: *Other*, sin build command ni output directory).
3. `vercel.json` ya incluye cabeceras de seguridad y CSP (permite `esm.sh`, Google Fonts y `*.supabase.co`).

## Oportunidades reales (ingesta)

Hay un pipeline modular que importa solicitudes de servicios desde fuentes autorizadas (Hacker News, Remotive; Reddit y LinkedIn desactivados), las clasifica, detecta duplicados y caducidad, y las deja **pendientes de revisión** en un panel de administración privado. Ver `docs/FEASIBILITY.md` (viabilidad por plataforma) y `docs/INGESTION.md` (puesta en marcha). Hasta que lo actives, la app sigue mostrando solo los datos DEMO.

## Planes

| | FREE | PRO |
|---|---|---|
| Oportunidades | 8 visibles | todas |
| Filtros | categoría + búsqueda | + presupuesto, dificultad, experiencia, fecha, adecuación |
| Propuestas | 3 por mes | sin límite |
| Seguimiento | 2 notas por oportunidad | notas ilimitadas + recordatorios |
| Recomendaciones | por adecuación general | personalizadas con tu perfil |

No hay pagos todavía. En *Planes* hay una **vista previa PRO local** para probar las funciones.

## Notas de producto

- El **Beginner Fit Score** es orientativo (experiencia, habilidades, complejidad, presupuesto/alcance, portfolio) y se explica factor a factor. No es una probabilidad de conseguir el trabajo.
- El **Proposal Assistant** funciona con plantillas gratuitas. Alternativa de pago futura: sustituir `generate()` en `js/proposal.js` por un modelo de lenguaje. Nunca envía mensajes.
- Muchas plataformas externas exigen una edad mínima (a menudo 18): la app lo avisa en el onboarding y en cada oportunidad.

## Comprobaciones

```bash
node scripts/check.mjs
```

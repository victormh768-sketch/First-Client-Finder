# Oportunidades reales: puesta en marcha

Ver `docs/FEASIBILITY.md` para el análisis de cada plataforma. Esto explica cómo activar la ingesta.

## Cómo funciona

```
Fuente (API/feed autorizado)
   └─ adaptador (supabase/functions/_shared/ingest/adapters/*)      → RawItem
        └─ pipeline: intención → categoría/habilidades/presupuesto → estimaciones → Beginner Fit
             → duplicados → caducidad (edad + enlace) → motivos
                  └─ tabla opportunities  (review_status = 'pending')
                       └─ panel Administración: revisar → 'approved'
                            └─ solo entonces la ven los usuarios (RLS)
```

- Todo se ejecuta en una **Edge Function** (`sync-sources`). El navegador nunca ve claves privadas.
- Nada se publica sin que un administrador lo apruebe.
- Un enlace que responde 404/410 pasa a «caducada». Un fallo de red o un 403/429 **no** caduca la oportunidad: se queda «sin verificar».
- No se inventa ningún dato: cliente, presupuesto y fecha son `null` si el texto no los trae. La experiencia y la complejidad pueden ser estimaciones y la interfaz lo avisa (`estimated`).

## Pasos

1. **Proyecto de Supabase propio para esta app.** No reutilices el de otra aplicación. Ejecuta `supabase/schema.sql` y después `supabase/migrations/002_ingestion.sql` en el SQL Editor.
2. **Hazte administrador** (SQL Editor, tras crear tu cuenta en la app):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'tu@correo.com';
   ```
3. **Conecta el frontend:** pega la URL y la clave pública en `js/config.js`.
4. **Despliega la función:**
   ```bash
   supabase functions deploy sync-sources --no-verify-jwt
   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   ```
5. **Primera sincronización:** en la app, *Perfil → Administración → Fuentes → Sincronizar ahora*. Las fuentes se crean la primera vez.
6. **Revisa** en la pestaña *Revisión*: abre el original, comprueba que sigue vigente y aprueba.
7. **Programa** la sincronización cada 12 h con el bloque de `pg_cron` que hay al final de `002_ingestion.sql`.

## Fuentes

| Fuente | Estado inicial | Requisitos |
|---|---|---|
| `hn-freelance` | Activada | Ninguno |
| `remotive` | Activada | Ninguno. Respeta 4 peticiones/día, enlace y mención |
| `rss-example` | Desactivada | Copiar la fuente, poner la URL del feed y leer antes sus condiciones |
| `reddit` | Desactivada y sin autorización | Aprobación de Reddit + secretos `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` + `legal_status = 'approved'` |
| `linkedin` | Bloqueada | Acceso de socio de LinkedIn. Mientras tanto, entrada manual |

Una fuente con `legal_status` `blocked` o `approval` **no se ejecuta** aunque se active (la función lo rechaza).

## Añadir una fuente

1. Crea `adapters/mi-fuente.js` con `{ id, fetchItems({ fetch, env, config }) → RawItem[] }`.
2. Regístrala en `registry.js` con su `legalStatus`, intervalo, caducidad y requisitos.
3. Añade pruebas en `tests/ingest.test.mjs` con respuestas sintéticas de la API.

`RawItem`: `externalId, title, description, client?, postedAt?, url, hint?('request'|'supply'), jobType?, rawCategory?`.

## Pruebas

```bash
node --test tests/ingest.test.mjs   # pipeline, adaptadores con respuestas simuladas, 25 pruebas
node scripts/check.mjs              # traducciones, scoring y propuestas
```

Los datos de `tests/` son sintéticos y no se usan en la app.

## Límites conocidos

- La Edge Function no se ha podido ejecutar en la sesión de desarrollo (sin internet ni proyecto propio). Su compilación está comprobada; la ejecución real, no.
- El clasificador de intención es por reglas (ES/EN). Funciona bien con peticiones claras y falla con textos ambiguos: por eso hay revisión humana.
- Las condiciones de uso de HN/Algolia, RemoteOK, Jobicy y Arbeitnow no se han podido leer en la sesión: confírmalas antes de depender de ellas en producción.


## Clasificación de oportunidades (tipo, Beginner Friendly Score, calidad)

Todo vive en `supabase/functions/_shared/ingest/` y se guarda en `opportunities.analysis` (jsonb: `intent`, `type`, `beginner`, `quality`); no hace falta migración.

- **Tipo** (`opptype.js`): `freelance` (alguien necesita contratar un servicio), `one_off` (proyecto puntual, necesidad concreta y acotada), `job` (empleo), `collaboration` (busca socio sin pago indicado), `not_relevant`. Una etiqueta *contract/freelance* de un tablón de empleo **con lenguaje de puesto de trabajo se clasifica como empleo**, no como cliente. Solo `freelance` y `one_off` se importan, siempre como *pendiente de revisión humana*.
- **Beginner Friendly Score** (`beginner.js`, 0-100): experiencia 30, dificultad 20, habilidades 15, presupuesto y alcance 20, portfolio 15. Cada factor trae su razón y si el dato era del texto o *no indicado*. Lo no indicado puntúa bajo y nunca cuenta como señal a favor. Niveles: **apta** (experiencia escrita como none/junior + otra señal explícita, sin bloqueos), **posible** (experiencia no indicada, ≥2 señales explícitas; no se cuenta como apta), **no apta**. No sustituye a `fit` (Beginner Fit de la app), que no cambia.
- **Calidad** (`quality.js`): avisos de caducada, enlace roto, duplicada, sin presupuesto, información insuficiente, sin fecha, sin pago, y posibles señales de fraude (pago previo, cheques, tarjetas regalo, datos sensibles, Telegram/WhatsApp, promesas de ingresos fáciles, urgencia, enlaces acortados). Son avisos para la persona que revisa; no rechazan nada solos. Las razones están en español; el panel admin aún no las muestra (sin cambios de interfaz en esta fase).

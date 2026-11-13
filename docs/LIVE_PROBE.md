# Live Probe — primera validación con datos reales (sin Supabase)

Consulta las fuentes públicas autorizadas desde un runner de GitHub (que tiene internet), clasifica lo que encuentra y genera un informe para que lo revises a mano. **No usa Supabase, claves ni secretos, y no escribe en tu repositorio.**

> Estado: el workflow **no se ha ejecutado todavía en GitHub** y ninguna fuente se ha probado en vivo. Todo lo que está verificado se probó con respuestas sintéticas. La primera ejecución puede revelar ajustes.

## 1. Archivos que debes subir
Lo más simple: sube **todo el proyecto**. El mínimo imprescindible para que el workflow funcione es:

```
package.json                                  ← necesario ("type": "module")
.github/workflows/live-probe.yml
scripts/live-probe.mjs
scripts/probe-lib.mjs
scripts/probe-http.mjs
scripts/probe-report.mjs
supabase/functions/_shared/ingest/**          ← los 20 archivos (adapters/ incluido)
```
Recomendados: `tests/`, `docs/`, `.gitignore` (evita subir `report/`). Se comprobó copiando solo esos archivos a una carpeta vacía: el script arranca sin ningún otro archivo del proyecto.

## 2. Configuración
- **Ninguna clave ni secreto.** No añadas `secrets` ni variables.
- Usa un repositorio **privado** (recomendado): el informe contiene títulos y enlaces de publicaciones de terceros y las condiciones de Remotive prohíben reutilizar sus ofertas en otros sitios. Los *Artifacts* de un repo público los puede descargar cualquier usuario de GitHub.
- El workflow debe estar en la **rama por defecto** (`main`) para aparecer en Actions.
- GitHub → Settings → Actions → General: Actions habilitadas. Los permisos por defecto sirven (el workflow pide solo lectura de contenido y de Actions).
- No cambies el nombre `live-probe.yml` (lo usa el contador de ejecuciones recientes).

## 3. Ejecutarlo, paso a paso
1. En GitHub abre tu repositorio → pestaña **Actions** → en la izquierda **Live probe**.
2. **Run workflow** → rama `main`. Opciones: fuentes (por defecto `hn-freelance,remotive,jobicy`), comprobar enlaces (sí) y máximo de enlaces por sitio (30).
3. Espera a que termine (unos minutos: hay pausas entre peticiones para no saturar a las fuentes).
4. Abre la ejecución: la pestaña **Summary** muestra la tabla de resultados y las peticiones realizadas. Si una fuente falla, sale como **FALLA** y como error rojo en la ejecución.
5. Abajo del todo, en **Artifacts**, descarga `live-probe-report-N` (zip).

Sin GitHub (con internet): `node scripts/live-probe.mjs` → escribe en `report/`.

## 4. Dónde está el informe
Dentro del zip:
```
QUALITY_REPORT.md          resumen, fuentes que fallan, peticiones hechas y muestras con razones
live-probe.json            las mismas filas en formato de datos
review/01-freelance.md           todas las oportunidades freelance
review/02-proyectos-puntuales.md todos los proyectos puntuales
review/03-empleos-descartados.md empleos que NO se tratan como cliente (revisa falsos negativos)
review/04-no-relevantes.md       resultados no relevantes (revisa falsos negativos)
review/05-aptas-principiantes.md aptas para principiantes
review/06-posibles-fraudes.md    posibles fraudes / calidad baja (avisos, no veredictos)
review/07-colaboracion.md        busca socio o colaborador
review/todas.csv                 todo en una hoja; rellena la columna «util»
```
Cómo valorar: abre `todas.csv` en una hoja de cálculo, marca `util` (s/n) en unas 30 filas por fuente y mira sobre todo los empleos descartados y no relevantes para detectar ofertas buenas mal clasificadas. Si quieres conservar el informe, copia `QUALITY_REPORT.md` a `docs/`.

## 5. Límites de peticiones
- **Una sola petición a la API de Remotive y de Jobicy por ejecución.** Hacker News: 1 búsqueda del hilo + hasta 4 páginas.
- Pausas entre peticiones al mismo sitio (0,5–2 s), tope propio de peticiones por sitio y **sin reintentos**: un 429 o 5xx se informa tal cual.
- Límites publicados por las fuentes (de sus condiciones): Remotive ≤ 4 peticiones/día, Jobicy ≤ 1 sondeo/hora. El workflow cuenta sus ejecuciones recientes y **omite** la fuente si se superaría el límite (aparece como «omitida para respetar el límite»). Si no puede contarlas, lo avisa en el informe y no bloquea. Cuenta toda ejecución, aunque haya fallado: es conservador.
- Los topes de enlaces (30 por sitio) y las pausas son decisiones mías, no límites publicados. No pude leer el `robots.txt` ni las condiciones de la API de Hacker News: revisa `https://news.ycombinator.com/robots.txt` antes de subir el máximo de enlaces.
- Los enlaces que no se comprueban por el tope quedan **sin verificar**, nunca como caducados.

## 6. Qué contiene y qué no (seguridad)
- Solo se guardan: título (saneado: correos, teléfonos, @usuarios y enlaces sustituidos), enlace público, fecha, tipo, puntuaciones, razones y avisos.
- **No** se guardan descripciones completas, nombre del autor, empresa/cliente, cabeceras HTTP, variables de entorno ni credenciales. Hay tests que lo comprueban.
- El CSV neutraliza fórmulas (`=`, `+`, `-`, `@`) para que no se ejecuten al abrirlo.
- Los avisos de fraude son señales para revisar a mano; pueden ser falsos positivos y nunca rechazan nada solos.

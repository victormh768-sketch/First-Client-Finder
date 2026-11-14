# Viabilidad de integración por plataforma

Fecha del análisis: 2026-11-11. Marcado como **[verificado]** lo que he podido leer en la fuente oficial o en la documentación del propio servicio durante esta sesión, y como **[sin verificar]** lo que consta por conocimiento previo o por fuentes secundarias. **Antes de activar cualquier fuente hay que releer sus condiciones vigentes.** Esto no es asesoramiento legal.

Limitación de la sesión: desde el entorno de desarrollo no hay salida a internet hacia estas APIs, así que ninguna se ha podido probar en vivo.

| Plataforma | API oficial | Qué da | Uso comercial | Aprobación | Coste | Decisión |
|---|---|---|---|---|---|---|
| Hacker News (hilo mensual «Freelancer? Seeking freelancer?») | Sí: API Firebase y buscador Algolia, sin clave [sin verificar] | Comentarios de personas y empresas que buscan freelancers: texto, autor, fecha, enlace | No hay cláusula comercial explícita que haya podido leer [sin verificar]. Volumen bajo, enlace de vuelta y atribución | No | Gratis | **Activar** |
| Remotive | Sí: `GET /api/remote-jobs` [verificado] | Ofertas con `job_type` (incl. freelance/contract), categoría, fecha, enlace, salario | La API pública es para «pasar» ofertas; para otros usos, API privada de pago [verificado] | No | Gratis (privada: de pago) | **Activar** con sus reglas |
| RSS / Atom genérico | Depende de cada sitio | Título, resumen, enlace, fecha | Depende de cada sitio | No | Gratis | **Adaptador listo, cada feed desactivado** hasta comprobar sus condiciones |
| Entrada manual (pegar enlace o texto) | n/a | Lo que el usuario pega | Es contenido que el usuario aporta | No | Gratis | **Activar** (alternativa legal para LinkedIn y comunidades) |
| Reddit | Sí: Data API con OAuth [verificado por fuente secundaria] | Posts de r/forhire, r/slavelabour, etc. | Uso comercial exige acuerdo aparte [verificado por fuente secundaria] | Sí: el alta self-service se cerró el 11/11/2025 [fuente secundaria, no confirmado con Reddit] | Gratis no comercial (100 consultas/min); comercial de pago | **Adaptador implementado y desactivado** (requiere aprobación y claves) |
| LinkedIn | No hay API pública de búsqueda de publicaciones ni de ofertas. Las APIs son para socios aprobados [sin verificar en detalle] | — | — | Programa de socios | — | **Adaptador desactivado, sin scraping.** Su política prohíbe el software y las extensiones de automatización [página oficial identificada, no pude abrirla] |
| Upwork | RSS retirado desde el 20/08/2024 [verificado] | — | — | La API exige aprobación [sin verificar] | — | **No integrar** |
| Jobicy | API pública JSON [leído en su README oficial] | Empleo remoto con tipo Freelance/Contract/Part-time | Sin clave; máx. 1 sondeo/hora; mantener Jobicy como fuente y URL canónica; uso en productos propios permitido | No | Gratis | **Adaptador listo, desactivado.** Sin probar en vivo |
| RemoteOK | API pública JSON | Empleo remoto | Su página legal solo exige enlazar de vuelta; **no** he podido leer el aviso del JSON ni encontré cláusula sobre API/automatización [sin verificar] | No | Gratis | **No añadido**: términos sin confirmar |
| Arbeitnow | API pública JSON sin clave | Empleo de empresas europeas (ATS) | No declara límites ni atribución; un tercero indica que piden enlace [sin verificar] | No | Gratis | **No añadido**: es empleo tradicional, sin campo freelance |
| RemoteJobs.org | API pública v1 sin clave, `type=freelance` [leído en su página de desarrolladores] | Empleo remoto filtrable por freelance/contract | <200 peticiones/h/IP; enlace visible; mantener enlace de solicitud. **Sus términos de servicio no se han leído** [sin verificar] | No | Gratis | Adaptador listo, **desactivado**; sin probar en vivo |
| Hacker News (Algolia) | API pública sin clave | Hilo mensual «Freelancer? Seeking freelancer?» | Límite de peticiones y términos **no verificados** (la cifra de ~10.000/h es de memoria, no confirmada) | No | Gratis | Adaptador listo; sin probar en vivo |
| We Work Remotely | Feeds RSS | Empleo remoto | No leídas [sin verificar] | No | Gratis | No añadido |
| Webs de empresas | `schema.org/JobPosting` o feeds propios | Variable | Con permiso del sitio y respetando `robots.txt` | No | Gratis | **Pendiente**, por solicitud de cada empresa |
| Freelancer.com | API con OAuth [sin verificar] | Proyectos | [sin verificar] | Probable | [sin verificar] | **Pendiente de investigar** |

## Reglas de Remotive (leídas de su página y README)

- Enlazar a la URL de la oferta en Remotive **y** nombrar a Remotive como fuente.
- Las ofertas llegan con 24 horas de retraso.
- Máximo 4 peticiones al día; más de 2 por minuto puede bloquearse.
- No reenviar sus ofertas a terceros (Jooble, Google Jobs, LinkedIn Jobs…) ni usarlas para captar altas o correos.
- Su ámbito es **empleo remoto**, no necesariamente encargos para principiantes. Se filtra `job_type` freelance/contract y se pasa por el clasificador.

## LinkedIn: cómo se activaría en el futuro

1. Solicitar acceso a un programa de socios de LinkedIn con un caso de uso aprobado.
2. Guardar las credenciales OAuth solo como secretos de Supabase (nunca en el frontend).
3. Implementar `fetch()` en `adapters/linkedin.js` contra la API autorizada y poner `legal_status = 'approved'` en la fuente.

Mientras tanto: el usuario puede **pegar el enlace o el texto** de una publicación en la entrada manual (contenido que aporta él, sin acceso automático), y se usan las fuentes alternativas de arriba.

## Dónde corre la ingesta

En una **Edge Function de Supabase** (`sync-sources`) lanzada por programación o por un administrador. Las claves viven como secretos de la función y nunca llegan al navegador. El navegador solo lee oportunidades **aprobadas**.

| Himalayas | API pública sin clave; datos refrescados cada 24 h; `employment_type=Contractor` (no existe «Freelance») [leído en su documentación] | Empleo remoto | Crédito visible a Himalayas, usar su `applicationLink`, **no pasar las ofertas a otros tablones/agregadores** | No | Gratis | Candidata, sin adaptador: encaja mal si First Client Finder se considera agregador |
# Informe de calidad de oportunidades reales

**Fecha:** 2026-11-11 · **Resultado principal: no se ha podido probar ninguna fuente en vivo.**

> Este archivo es el estado de la validación a fecha de arriba. El informe con datos reales lo genera el workflow *Live probe* como `QUALITY_REPORT.md` dentro del Artifact de la ejecución (ver `docs/LIVE_PROBE.md`). Cuando lo tengas, puedes sustituir este archivo por ese.

El entorno de desarrollo no tiene salida a internet (todas las peticiones fallan, incluso a hosts neutros). Ninguna cifra de este informe sale de datos reales de una fuente; por eso todas las cifras de resultados son **no medidas**, no cero.

## 1. Fuentes probadas en vivo
Ninguna. Se ejecutó `node scripts/live-probe.mjs` contra Hacker News, Remotive y Jobicy: las tres devolvieron `sin_red` (`fetch failed`). Eso no indica que las fuentes fallen; indica que no se pudo comprobar.

| Fuente | Obtenidas | Relevantes | Adecuadas principiante | Enlaces OK |
|---|---|---|---|---|
| Hacker News | no medido | no medido | no medido | no medido |
| Remotive | no medido | no medido | no medido | no medido |
| Jobicy | no medido | no medido | no medido | no medido |

## 2. Condiciones de uso (leídas de fuentes primarias)
Ver `docs/FEASIBILITY.md`. Resumen: Remotive y Jobicy permiten nuestro uso con atribución, enlace y límites de frecuencia (ya implementados); RemoteOK, Arbeitnow, remotejobs.org y los límites de HN/Algolia quedan **sin verificar**.

## 3. Calidad: lo que NO está medido
Preocupación estructural, no medida: Remotive, Jobicy, RemoteOK y Arbeitnow son tablones de empleo; filtrar por freelance/contract deja pocas ofertas y muchas de perfil senior. El hilo de HN es la única fuente identificada con solicitudes reales de servicios, pero probablemente muy técnica. El clasificador solo se ha validado con textos sintéticos: su precisión real es desconocida.

## 4. Cómo medirlo (una vez, ~5 minutos)
1. Sigue `docs/LIVE_PROBE.md` (GitHub → Actions → **Live probe** → Run workflow).
2. Descargar el Artifact: `QUALITY_REPORT.md`, carpeta `review/` y `todas.csv` con la columna «util».
3. Marcar útiles/no útiles en ~30 filas por fuente. Criterio sugerido para seguir invirtiendo: ≥ 30 % de las relevantes marcadas útiles y ≥ 10 relevantes adecuadas para principiantes por sincronización. Es un umbral propuesto, no un dato.

## 5. Recomendación (condicional)
Mantener Hacker News y Remotive; Jobicy como candidata desactivada; no añadir RemoteOK ni Arbeitnow; revisar términos de remotejobs.org. Decidir tras la prueba en vivo.

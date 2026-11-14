# Peticiones de empresas (Fase 1)

Las empresas se registran, publican lo que necesitan y las personas que empiezan muestran interés. Un administrador revisa cada petición antes de publicarla.

## Flujo
1. La empresa inicia sesión → **Perfil → Zona de empresas**, guarda nombre y correo (privados) y envía una petición.
2. La petición queda `pending` y NO es visible. Un administrador la aprueba en **#/admin → Revisión** (misma cola que las importadas).
3. Aprobada, aparece en el buscador con su Beginner Fit y la sección «Petición de una empresa».
4. La persona pulsa **Me interesa** (mensaje + correo privado). La empresa ve nombre, habilidades, nivel, portfolio y mensaje.
5. Si la empresa **acepta**, se revelan los correos en ambos sentidos. Si rechaza, no se revela nada.

## Seguridad (todo impuesto por RLS en `supabase/migrations/003_company_requests.sql`)
- La empresa solo puede insertar peticiones `pending`, no demo, a su nombre; no puede editarlas ni aprobarse sola. Cerrar va por `close_my_request`.
- Correos en tablas aparte (`company_contacts`, `interest_contacts`); visibles solo para su dueño o, tras aceptar, para la otra parte.
- Solo se puede mostrar interés en peticiones aprobadas, activas y ajenas.
- Las peticiones de empresa se publican como contenido de usuario: revisa cada una (sin pagos por adelantado, sin datos personales, sin enlaces raros).

## Puesta en marcha (tu propio proyecto de Supabase)
1. Crea un proyecto nuevo (NO uses el de Domino Planner).
2. SQL Editor: ejecuta en orden `supabase/schema.sql`, `supabase/migrations/002_ingestion.sql`, `supabase/migrations/003_company_requests.sql`.
3. Hazte administrador: `insert into public.admins (user_id) select id from auth.users where email = 'tu@correo.com';`
4. Pon la URL y la clave anon en `js/config.js` y despliega.
5. Authentication → activa registro por correo.

## Pendiente (Fase 2)
Escaparate opcional de principiantes que las empresas puedan explorar; captación inicial de empresas (manual).

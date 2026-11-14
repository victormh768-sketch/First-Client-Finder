# Acceso a fuentes con peticiones reales de clientes (Reddit y Freelancer.com)

Las fuentes públicas probadas (Remotive, Jobicy, RemoteJobs.org, Hacker News) son sobre todo tablones de empleo: casi no hay clientes pidiendo trabajos pequeños. Estas dos plataformas sí los tienen, pero exigen acceso. **Estado a 2026-11-14: ninguna está conectada ni probada.**

## Qué dicen sus condiciones (lectura de fuentes; no es asesoramiento legal)

### Freelancer.com — API Terms (página oficial `freelancer.com/about/apiterms`, leída)
- No describe un paso de aprobación: se aceptan los términos al usar la API. La documentación para desarrolladores no se pudo abrir (bloqueada en este entorno): **endpoints, autenticación y límites sin verificar**.
- Se puede guardar en caché solo «por rendimiento» y hay que **refrescarla al menos cada 24 h**. Los datos deben guardarse y servirse con cifrado fuerte, y hay que **borrar todo lo guardado** si termina el acuerdo.
- **«No puedes usar la API para replicar o competir con los servicios de Freelancer».** Un buscador de proyectos de Freelancer.com para principiantes podría interpretarse así. **Es el punto que hay que aclarar por escrito antes de construir nada.**
- Se permite cobrar por tu aplicación, pero no revender, sublicenciar ni redistribuir el acceso a la API. Pueden cambiar o suspender la API cuando quieran.
- No exige atribución, y no dice nada sobre mostrar listados ni agregarlos.

### Reddit — Data API (según un artículo secundario de 2026; **hay que comprobarlo en las páginas oficiales**)
- Hay que registrar una app en `reddit.com/prefs/apps`, aceptar los Data API Terms y explicar el uso. El acceso sin autenticar está bloqueado desde el 30-05-2026.
- Uso comercial = acuerdo directo con Reddit. First Client Finder prevé un plan PRO: conviene decirlo desde el principio.
- Límite gratuito citado: 100 peticiones/min por cliente. Prohibido entrenar modelos de IA con el contenido; hay que borrar lo que el autor borre en Reddit.
- El adaptador de Reddit (`adapters/reddit.js`) ya está hecho y desactivado; solo necesita `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` y `REDDIT_USER_AGENT` como secretos.

## Qué tienes que hacer tú (yo no puedo crear cuentas ni aceptar términos)

### 1. Reddit (tarda más: empieza por aquí)
1. Entra en Reddit con la cuenta que quieras asociar al proyecto.
2. Ve a `reddit.com/prefs/apps` → **create another app** → tipo **script**. Guarda el *client id* y el *secret* (no los compartas ni los pegues en el chat).
3. Si Reddit pide solicitar acceso a la API, usa el texto de abajo.

> **Texto para la solicitud (inglés)**
> I'm building First Client Finder, a small web app that helps beginners and young entrepreneurs find their first freelance clients. It would read new posts of r/forhire (only [HIRING] posts) through the official Data API, read-only, at most a few requests per hour, and show each post as a short title with a link back to Reddit. Nothing is posted, voted or messaged automatically, no content is used to train AI models, deleted posts are removed, and every item is reviewed by a person before being shown. The app is free today and may add a paid plan later; please tell me if that needs a separate agreement.

### 2. Freelancer.com
1. Crea o usa tu cuenta de Freelancer.com y entra en su portal de desarrolladores para registrar una aplicación y obtener un token. Revisa ahí la documentación de proyectos activos, la autenticación y los límites.
2. **Antes de usar los datos en la app**, escribe al soporte/desarrolladores de Freelancer.com para aclarar si encaja con «no replicar ni competir con sus servicios». Texto propuesto:

> **Texto para el correo (inglés)**
> Subject: API Terms question: read-only listing of public projects in a free tool for beginners
> Hello, I'm building First Client Finder, a free web app that helps beginners find their first freelance clients. We would read public active projects through your API (title, short excerpt, budget, skills), show them with a clear "View on Freelancer.com" link that sends users to your site to bid, refresh/delete cached data at least every 24 hours, encrypt stored data, and never bid, contact clients or copy bids automatically. Could you confirm in writing whether this use is permitted under your API Terms, in particular the clause on not replicating or competing with Freelancer's services? Thank you.

## Qué hago yo cuando tengas acceso
- Reddit: activar el adaptador existente con los secretos en GitHub (nunca en el código ni en el chat) y lanzar el Live Probe.
- Freelancer.com: con la respuesta por escrito y el token, preparar el adaptador siguiendo su documentación real y probarlo en el Live Probe. **No lo construyo antes**: sin endpoints verificados ni permiso claro sería código especulativo.

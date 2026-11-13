// LinkedIn · adaptador DESACTIVADO. No hay API pública para buscar publicaciones ni ofertas, y sus
// condiciones prohíben el software y las extensiones de automatización y la extracción automática.
// Este adaptador NO accede a LinkedIn de ninguna forma: fetchItems siempre lanza NotAuthorizedError.
//
// Para activarlo en el futuro (solo por una vía autorizada):
//   1. Obtener acceso a un programa de socios de LinkedIn cuyo caso de uso incluya leer este contenido.
//   2. Guardar las credenciales OAuth como secretos de Supabase (nunca en el frontend).
//   3. Implementar fetchItems() contra la API autorizada, devolver RawItem[] y poner
//      sources.legal_status = 'approved' en la fuente 'linkedin'.
//
// Alternativa disponible hoy: la entrada manual del panel de administración (adapters/manual.js),
// donde una persona pega el texto o el enlace de una publicación. No se descarga nada de LinkedIn.
export class NotAuthorizedError extends Error {}

export const adapter = {
  id: 'linkedin',
  async fetchItems() {
    throw new NotAuthorizedError('LinkedIn no ofrece acceso autorizado a publicaciones públicas. Fuente desactivada; usa la entrada manual.');
  },
};

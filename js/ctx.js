// Contexto compartido entre vistas (evita importaciones circulares con app.js).
export const ctx = {
  opps: [],
  loading: true,
  user: null,
  isAdmin: false,
  rerender: () => {},
};

export function navigate(path) {
  const target = '#/' + path;
  if (location.hash === target) ctx.rerender();
  else location.hash = target;
}

export function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { route: path || 'dashboard', params: new URLSearchParams(qs || '') };
}

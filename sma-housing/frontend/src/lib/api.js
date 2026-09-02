/* Talks to the Express API. In development Vite proxies /api to the backend,
   in production the backend serves this bundle, so the path is the same either way. */

let token = localStorage.getItem('sma:token') || null;
let onSessionExpired = () => {};

export function getToken() { return token; }
export function setToken(value) {
  token = value;
  if (value) localStorage.setItem('sma:token', value);
  else localStorage.removeItem('sma:token');
}
export function onExpired(fn) { onSessionExpired = fn; }

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...options, headers });
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    setToken(null);
    onSessionExpired();
    throw new Error('Session expired');
  }
  return res;
}

export async function apiJson(path, options) {
  const res = await api(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

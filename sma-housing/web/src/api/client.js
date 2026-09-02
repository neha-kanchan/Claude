/* Thin transport layer. Everything above this file talks to the server through
   TanStack Query hooks in queries.js, never through fetch directly. */

const TOKEN_KEY = 'sma:token';
const ENV_KEY = 'sma:env';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getEnv = () => localStorage.getItem(ENV_KEY) || 'prod';
export const setEnv = (e) => localStorage.setItem(ENV_KEY, e);

/* A 401 anywhere means the session is gone; the auth provider listens for this
   rather than every call site having to handle it. */
export const onUnauthorized = (fn) => {
  window.addEventListener('sma:unauthorized', fn);
  return () => window.removeEventListener('sma:unauthorized', fn);
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
  get isForbidden() { return this.status === 403; }
}

export async function request(path, { method = 'GET', body, env, raw = false } = {}) {
  const headers = { 'X-Env': env || getEnv(), 'X-Source': 'ui' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new CustomEvent('sma:unauthorized'));
    throw new ApiError('Your session has expired — please sign in again.', 401);
  }
  if (raw) {
    if (!res.ok) throw new ApiError('Request failed', res.status);
    return res;
  }
  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

/* Collections the server stores as { id: record } rather than a list. */
export const DICT_COLLECTIONS = new Set(['files']);
/* Collections that are a single document, not a record set. */
export const DOC_COLLECTIONS = new Set(['settings']);

export const toList = (collection, value) =>
  DICT_COLLECTIONS.has(collection)
    ? Object.entries(value || {}).map(([id, rec]) => ({ ...rec, id }))
    : Array.isArray(value) ? value : [];

/**
 * Role permissions, enforced on the server. `perms` is either the string "ALL"
 * or { page: { view, actions: { action: true } } } - the same structure the UI
 * uses to hide pages and buttons, but the API is the enforcement point.
 */

import { COLLECTIONS } from './collections';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: string;
  perms: 'ALL' | Record<string, { view?: boolean; actions?: Record<string, boolean> }>;
  isAdmin: boolean;
}

export function can(user: AuthUser | undefined, page: string, action?: string): boolean {
  if (!user) return false;
  if (user.isAdmin || user.perms === 'ALL') return true;
  const p = user.perms[page];
  if (!p || !p.view) return false;
  if (!action) return true;
  return Boolean(p.actions && p.actions[action]);
}

/** Reference data any signed-in user may read, because most pages need it to render. */
const OPEN_READ = new Set(['buildings', 'rooms', 'master', 'notifications', 'calendar',
  'users', 'roles', 'settings', 'allocations', 'files', 'documents', 'students', 'audit']);

const ADMIN_ONLY_WRITES = new Set(['roles', 'users', 'audit']);

/** Collections any staff role writes as a side effect of normal work. */
const SIDE_EFFECT_WRITES = new Set(['notifications', 'settings', 'students', 'files']);

export function canRead(user: AuthUser, collection: string): boolean {
  if (user.isAdmin) return true;
  if (OPEN_READ.has(collection)) return true;
  return can(user, COLLECTIONS[collection]?.page ?? collection);
}

export function canWrite(user: AuthUser, collection: string): boolean {
  if (user.isAdmin) return true;
  if (ADMIN_ONLY_WRITES.has(collection)) return false;
  if (SIDE_EFFECT_WRITES.has(collection)) return hasAnyAction(user);
  const page = COLLECTIONS[collection]?.page ?? collection;
  if (user.perms === 'ALL') return true;
  const p = user.perms[page];
  return Boolean(p && p.view && p.actions && Object.values(p.actions).some(Boolean));
}

function hasAnyAction(user: AuthUser): boolean {
  if (user.isAdmin || user.perms === 'ALL') return true;
  return Object.values(user.perms).some((p) => p && p.view && p.actions && Object.values(p.actions).some(Boolean));
}

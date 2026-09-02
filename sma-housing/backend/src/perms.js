// Role-based permissions, enforced on the server (requirement 4).
// perms is 'ALL' or { page: { view: bool, actions: { actionKey: bool } } } - the same
// structure the SPA uses to hide pages and buttons; the API is the enforcement point.

export function can(user, page, action) {
  if (!user) return false;
  if (user.isAdmin || user.perms === 'ALL') return true;
  const p = user.perms?.[page];
  if (!p || !p.view) return false;
  if (!action) return true;
  return Boolean(p.actions && p.actions[action]);
}

// Which page governs each collection.
export const COLLECTION_PAGE = {
  students: 'students', buildings: 'master', rooms: 'master', allocations: 'students',
  attendance: 'attendance', movements: 'movements', violations: 'violations',
  complaints: 'complaints', requests: 'requests', documents: 'documents', files: 'documents',
  calendar: 'calendar', notifications: 'notifications', master: 'master',
  roles: 'roles', users: 'roles', audit: 'audit', settings: 'dashboard'
};

// Reference data that any signed-in user may read (needed to render most pages).
const OPEN_READ = new Set(['buildings','rooms','master','notifications','calendar','users','roles','settings','allocations','files','documents','students','audit']);
const ADMIN_ONLY_WRITES = new Set(['roles','users','audit']);
// Collections any signed-in staff role may write as a side effect of normal work
// (e.g. security logging a movement also updates the student's latest status; workflows raise notifications).
const SIDE_EFFECT_WRITES = new Set(['notifications','settings','students','files']);

export function canRead(user, collection) {
  if (user.isAdmin) return true;
  if (OPEN_READ.has(collection)) return true;
  return can(user, COLLECTION_PAGE[collection] || collection);
}

export function canWrite(user, collection) {
  if (user.isAdmin) return true;
  if (ADMIN_ONLY_WRITES.has(collection)) return false;
  if (SIDE_EFFECT_WRITES.has(collection)) return hasAnyAction(user);
  const page = COLLECTION_PAGE[collection] || collection;
  const p = user.perms?.[page];
  return Boolean(p && p.view && p.actions && Object.values(p.actions).some(Boolean));
}

function hasAnyAction(user) {
  if (user.isAdmin) return true;
  const perms = user.perms || {};
  return Object.values(perms).some((p) => p && p.view && p.actions && Object.values(p.actions).some(Boolean));
}

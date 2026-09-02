/* Mirrors src/perms.js on the server. This copy decides what to render; the
   server decides what is allowed. A role that slips past this check still gets
   a 403, so this is a usability layer, never the enforcement point. */

export const PAGES = [
  { id: 'dashboard',     label: 'Dashboard',              icon: '📊', section: 'Overview',  actions: [] },
  { id: 'students',      label: 'Students',               icon: '🎓', section: 'Residents', actions: ['add', 'edit', 'deactivate', 'allocate', 'export'] },
  { id: 'attendance',    label: 'Attendance & Roll Call', icon: '✅', section: 'Residents', actions: ['record', 'edit', 'export'] },
  { id: 'movements',     label: 'Entry / Exit Log',       icon: '🚪', section: 'Residents', actions: ['record', 'return', 'export'] },
  { id: 'violations',    label: 'Violations',             icon: '⚖️', section: 'Cases',     actions: ['add', 'update', 'close', 'export'] },
  { id: 'complaints',    label: 'Complaints & Maintenance', icon: '🛠️', section: 'Cases',   actions: ['add', 'update', 'comment', 'export'] },
  { id: 'requests',      label: 'Student Requests',       icon: '📨', section: 'Cases',     actions: ['add', 'approve', 'reject', 'export'] },
  { id: 'documents',     label: 'Document Register',      icon: '📁', section: 'Records',   actions: ['upload', 'delete', 'export'] },
  { id: 'calendar',      label: 'Housing Calendar',       icon: '🗓️', section: 'Records',   actions: ['add', 'delete'] },
  { id: 'notifications', label: 'Notifications',          icon: '🔔', section: 'Records',   actions: ['announce'] },
  { id: 'reports',       label: 'Reports',                icon: '📈', section: 'Insight',   actions: ['export'] },
  { id: 'audit',         label: 'Audit Trail',            icon: '🧾', section: 'Insight',   actions: ['export'] },
  { id: 'master',        label: 'Master Data',            icon: '🗂️', section: 'Admin',     actions: ['add', 'edit', 'delete'] },
  { id: 'roles',         label: 'Roles & Users',          icon: '👥', section: 'Admin',     actions: ['add', 'edit'] },
  { id: 'integration',   label: 'Integration & API',      icon: '🔌', section: 'Admin',     actions: ['clone'] }
];

export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p]));

export function makeCan(user, roles) {
  const role = (roles || []).find((r) => r.name === user?.role);
  const perms = role?.perms;
  const isAdmin = perms === 'ALL';
  return function can(page, action) {
    if (!user) return false;
    if (isAdmin) return true;
    const p = perms?.[page];
    if (!p || !p.view) return false;
    if (!action) return true;
    return Boolean(p.actions && p.actions[action]);
  };
}

export function isAdminRole(user, roles) {
  return (roles || []).find((r) => r.name === user?.role)?.perms === 'ALL';
}

/* Default permission sets, used when a role row carries none yet. Kept in step
   with src/seed2.js. */
const PAGE_ACTIONS = Object.fromEntries(PAGES.map((p) => [p.id, p.actions]));

function grant(pages, withActions = true) {
  const out = {};
  for (const pg of pages) {
    out[pg] = { view: true, actions: {} };
    if (withActions) for (const a of PAGE_ACTIONS[pg] || []) out[pg].actions[a] = true;
  }
  return out;
}

export function defaultPerms(roleName) {
  if (roleName === 'Housing Supervisor')
    return grant(['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'documents', 'calendar', 'notifications', 'reports']);
  if (roleName === 'Security Officer')
    return { ...grant(['attendance', 'movements'], true), ...grant(['dashboard', 'students', 'notifications'], false) };
  if (roleName === 'Viewer')
    return grant(['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'reports', 'calendar'], false);
  return {};
}

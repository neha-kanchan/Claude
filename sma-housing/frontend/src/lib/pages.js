/* The page catalogue drives navigation, routing and the permission matrix.
   Server-side checks in backend/src/perms.js mirror this - the API is the
   enforcement point, this only decides what the UI offers. */

export const PAGES = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: '📊', sec: 'Overview', actions: [] },
  { id: 'students', path: '/students', label: 'Students', icon: '🎓', sec: 'Residents', actions: ['add', 'edit', 'deactivate', 'allocate', 'export'] },
  { id: 'attendance', path: '/attendance', label: 'Attendance & Roll Call', icon: '🗓️', sec: 'Residents', actions: ['record', 'edit', 'export'] },
  { id: 'movements', path: '/movements', label: 'Entry / Exit Log', icon: '🚪', sec: 'Residents', actions: ['record', 'return', 'export'] },
  { id: 'violations', path: '/violations', label: 'Violations', icon: '⚠️', sec: 'Cases', actions: ['add', 'update', 'close', 'export'] },
  { id: 'complaints', path: '/complaints', label: 'Complaints & Maintenance', icon: '🛠️', sec: 'Cases', actions: ['add', 'update', 'comment', 'export'] },
  { id: 'requests', path: '/requests', label: 'Student Requests', icon: '✉️', sec: 'Cases', actions: ['add', 'approve', 'reject', 'export'] },
  { id: 'documents', path: '/documents', label: 'Document Register', icon: '📄', sec: 'Records', actions: ['upload', 'delete', 'export'] },
  { id: 'calendar', path: '/calendar', label: 'Housing Calendar', icon: '📅', sec: 'Records', actions: ['add', 'delete'] },
  { id: 'notifications', path: '/notifications', label: 'Notifications', icon: '🔔', sec: 'Records', actions: ['announce'] },
  { id: 'reports', path: '/reports', label: 'Reports', icon: '📈', sec: 'Records', actions: ['export'] },
  { id: 'audit', path: '/audit', label: 'Audit Trail', icon: '🧾', sec: 'Administration', actions: ['export'] },
  { id: 'master', path: '/master', label: 'Master Data', icon: '🗂️', sec: 'Administration', actions: ['add', 'edit', 'delete'] },
  { id: 'roles', path: '/roles', label: 'Roles & Users', icon: '🛡️', sec: 'Administration', actions: ['add', 'edit'] },
  { id: 'integration', path: '/integration', label: 'Integration & API', icon: '🔌', sec: 'Administration', actions: [] }
];

export const pageById = (id) => PAGES.find((p) => p.id === id);

export function defaultPerms(roleName) {
  const p = {};
  const grant = (pg, acts, view = true) => { p[pg] = { view, actions: {} }; (acts || []).forEach((a) => { p[pg].actions[a] = true; }); };
  if (roleName === 'Housing Supervisor') {
    ['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'documents', 'calendar', 'notifications', 'reports']
      .forEach((pg) => grant(pg, pageById(pg).actions));
  } else if (roleName === 'Security Officer') {
    ['attendance', 'movements'].forEach((pg) => grant(pg, pageById(pg).actions));
    ['dashboard', 'students', 'notifications'].forEach((pg) => grant(pg, [], true));
  } else if (roleName === 'Viewer') {
    ['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'reports', 'calendar']
      .forEach((pg) => grant(pg, [], true));
  }
  return p;
}

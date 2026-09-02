// Server-side seed (v2): identities only - roles (with full permissions) and users
// (with usernames + bcrypt password hashes) so sign-in works from the first request.
// Business demo data is seeded by the SPA on first bootstrap and synced back.
import bcrypt from 'bcryptjs';
import { countRows, upsertOne, query } from './db2.js';

const PAGE_ACTIONS = {
  dashboard: [], students: ['add','edit','deactivate','allocate','export'],
  attendance: ['record','edit','export'], movements: ['record','return','export'],
  violations: ['add','update','close','export'], complaints: ['add','update','comment','export'],
  requests: ['add','approve','reject','export'], documents: ['upload','delete','export'],
  calendar: ['add','delete'], notifications: ['announce'], reports: ['export'],
  audit: ['export'], master: ['add','edit','delete'], roles: ['add','edit'], integration: ['clone']
};

function grant(pages, withActions = true) {
  const p = {};
  for (const pg of pages) {
    p[pg] = { view: true, actions: {} };
    if (withActions) for (const a of PAGE_ACTIONS[pg] || []) p[pg].actions[a] = true;
  }
  return p;
}

export function defaultPerms(roleName) {
  if (roleName === 'Housing Supervisor') return grant(['dashboard','students','attendance','movements','violations','complaints','requests','documents','calendar','notifications','reports']);
  if (roleName === 'Security Officer') {
    const p = grant(['attendance','movements'], true);
    Object.assign(p, grant(['dashboard','students','notifications'], false));
    return p;
  }
  if (roleName === 'Viewer') return grant(['dashboard','students','attendance','movements','violations','complaints','requests','reports','calendar'], false);
  return {};
}

export async function seedIdentities(env) {
  if (await countRows(env, 'users') > 0) return false;
  const put = (col, rec) => upsertOne(env, col, rec, { keepSecrets: true });

  await put('roles', { id: 'ROLE-ADMIN', name: 'Administrator', desc: 'Full access to every page and action.', perms: 'ALL', system: 1 });
  await put('roles', { id: 'ROLE-SUP', name: 'Housing Supervisor', desc: 'Runs daily operations.', perms: JSON.stringify(defaultPerms('Housing Supervisor')), system: 0 });
  await put('roles', { id: 'ROLE-SEC', name: 'Security Officer', desc: 'Gate entry/exit and roll call.', perms: JSON.stringify(defaultPerms('Security Officer')), system: 0 });
  await put('roles', { id: 'ROLE-VIEW', name: 'Viewer', desc: 'Read-only access to dashboards and reports.', perms: JSON.stringify(defaultPerms('Viewer')), system: 0 });

  const hash = (p) => bcrypt.hashSync(p, 10);
  await put('users', { id: 'USR-1', name: 'Amal Director', email: 'amal.director@sma.ac.ae', role: 'Administrator', active: 1, username: 'amal', passwordHash: hash('admin123'), entraOid: '' });
  await put('users', { id: 'USR-2', name: 'Sami Supervisor', email: 'sami.sup@sma.ac.ae', role: 'Housing Supervisor', active: 1, username: 'sami', passwordHash: hash('demo123'), entraOid: '' });
  await put('users', { id: 'USR-3', name: 'Ghada Gatekeeper', email: 'ghada.sec@sma.ac.ae', role: 'Security Officer', active: 1, username: 'ghada', passwordHash: hash('demo123'), entraOid: '' });
  await put('users', { id: 'USR-4', name: 'Vera Viewer', email: 'vera.view@sma.ac.ae', role: 'Viewer', active: 1, username: 'vera', passwordHash: hash('demo123'), entraOid: '' });

  await put('audit', { id: 'AUD-SEED-' + env, at: new Date().toISOString(), user: 'system', role: '—', action: 'SEED', entity: 'database', entityId: env, details: 'Identity seed (roles + users) for ' + env });
  return true;
}

export async function wipeEnv(env) {
  const tables = Object.keys((await import('./db2.js')).COLLECTIONS);
  for (const t of tables) await query(`delete from "${t}" where "env" = $1`, [env]);
}

// Server-side seed (v2): identities only - roles (with full permissions) and users
// (with usernames + bcrypt password hashes) so sign-in works from the first request.
// Business demo data is seeded by the SPA on first bootstrap and synced back.
import bcrypt from 'bcryptjs';
import { countRows, upsertOne, query, putSettings } from './db2.js';

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

/* ---------------------------------------------------------------------------
   Demo business data.

   This used to live in the browser: the old client noticed an empty database on
   first sign-in and pushed a dataset up. That made the demo data a property of
   one particular frontend, so a fresh install driven by the API - or by the
   React client - came up empty. It is server-side now, seeded on first start
   alongside the identities, and shared by every client.
--------------------------------------------------------------------------- */

const FIRST = ['Ahmed','Sara','Omar','Layla','Yousef','Noura','Khalid','Mona','Fahad','Reem','Hassan','Dana',
  'Tariq','Aisha','Salem','Huda','Nasser','Lina','Majed','Farah','Ali','Rana','Ziad','Maha'];
const LAST = ['Al-Harbi','Al-Otaibi','Khan','Haddad','Nasser','Saleh','Rahman','Aziz','Qassim','Farouk','Mansour','Zaki'];

const MASTER = {
  college: ['Engineering','Medicine','Business','Computer Science','Law','Sciences','Arts & Humanities'],
  violationType: ['Noise disturbance','Smoking','Security violation','Property damage'],
  complaintCategory: ['Maintenance','Housekeeping','Room-related','Roommate','Internet','Dining Services','Security','Others'],
  maintenanceSub: ['Electrical','HVAC','Plumbing','Furniture','Internet','Doors','Equipment'],
  requestType: ['Room change','Exit permission','Leave extension','Furniture request','Equipment request','Housing certificate','Personal belongings retrieval'],
  attendanceStatus: ['Present','Absent','Hospital','Official Leave','Weekend Leave','Unknown'],
  docType: ['Housing agreement','Undertaking','Report','ID copy','Medical note','Supporting document'],
  disciplinaryAction: ['Verbal warning','Written warning','Fine','Community service','Referral to committee','Housing suspension']
};

const rid = (p) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const dayString = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => dayString(new Date(new Date(iso + 'T00:00').getTime() + n * 864e5));

export async function seedDemoData(env) {
  if (await countRows(env, 'students') > 0) return false;
  const put = (col, rec) => upsertOne(env, col, rec);

  for (const [type, values] of Object.entries(MASTER))
    for (const value of values)
      await put('master', { id: rid('MD'), type, value, from: '2025-01-01', to: '', active: 1 });

  const buildings = [
    { id: 'B1', name: 'Building A', floors: 4 },
    { id: 'B2', name: 'Building B', floors: 4 },
    { id: 'B3', name: 'Building C', floors: 3 }
  ];
  for (const b of buildings) await put('buildings', b);

  const rooms = [];
  for (const b of buildings)
    for (let f = 1; f <= b.floors; f++)
      for (let r = 1; r <= 6; r++) {
        const number = `${f}${String(r).padStart(2, '0')}`;
        rooms.push({ id: `${b.id}-${number}`, buildingId: b.id, floor: f, number, capacity: 2, active: 1 });
      }
  for (const r of rooms) await put('rooms', r);

  const today = dayString(new Date());
  const now = Date.now();
  const hoursAgo = (h) => new Date(now - h * 36e5).toISOString();

  // Spread the intake across all three buildings. Taking rooms in array order
  // would fill Building A exactly (it has 24) and leave the other two empty,
  // which makes every occupancy report look broken.
  const byBuilding = buildings.map((b) => rooms.filter((r) => r.buildingId === b.id));
  const takeRoom = (i) => byBuilding[i % buildings.length][Math.floor(i / buildings.length)];

  const students = [];
  for (let i = 0; i < 24; i++) {
    const room = takeRoom(i);
    const name = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    students.push({
      id: 'STU-' + String(1001 + i), name,
      email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@univ.edu',
      phone: '05' + String(50000000 + i * 13579).slice(0, 8),
      college: MASTER.college[i % MASTER.college.length],
      building: room.buildingId, room: room.id, status: 'Active',
      joined: '2025-08-20', emergency: 'Guardian · 0500-000-' + String(100 + i), photoKey: null
    });
  }
  for (const s of students) {
    await put('students', s);
    await put('allocations', { id: rid('ALC'), studentId: s.id, roomId: s.room, from: '2025-08-20', to: '', note: 'Semester move-in' });
    const i = students.indexOf(s);
    await put('attendance', {
      id: rid('ATT'), date: today, studentId: s.id,
      status: i % 9 === 0 ? 'Absent' : i % 11 === 0 ? 'Weekend Leave' : i % 13 === 0 ? 'Hospital' : 'Present',
      note: '', by: 'System seed', at: new Date().toISOString()
    });
  }

  const movements = [
    { studentId: students[2].id, at: hoursAgo(6), expectedReturn: hoursAgo(-2), returnedAt: null, purpose: 'Family visit', by: 'Gate 1', late: 0 },
    { studentId: students[5].id, at: hoursAgo(30), expectedReturn: hoursAgo(24), returnedAt: null, purpose: 'Weekend leave', by: 'Gate 1', late: 0 },
    { studentId: students[7].id, at: hoursAgo(9), expectedReturn: hoursAgo(4), returnedAt: hoursAgo(2), purpose: 'Medical appointment', by: 'Gate 2', late: 1 },
    { studentId: students[1].id, at: hoursAgo(3), expectedReturn: hoursAgo(-5), returnedAt: null, purpose: 'Library', by: 'Gate 1', late: 0 }
  ];
  for (const m of movements) await put('movements', { id: rid('MOV'), type: 'Exit', ...m });
  await put('movements', {
    id: rid('MOV'), studentId: students[10].id, type: 'Entry', at: hoursAgo(1),
    expectedReturn: '', returnedAt: null, purpose: 'Return from class', by: 'Gate 1', late: 0
  });

  await put('violations', {
    id: 'VIO-2001', studentId: students[3].id, type: 'Noise disturbance', date: today, time: '23:40',
    location: 'Building A · Floor 2', description: 'Loud music after quiet hours despite prior warning.',
    staff: 'S. Rahman', action: 'Verbal warning', status: 'Investigation', attachments: [],
    history: [{ at: hoursAgo(10), by: 'S. Rahman', note: 'Reported' }, { at: hoursAgo(8), by: 'Supervisor', note: 'Moved to Investigation' }]
  });
  await put('violations', {
    id: 'VIO-2002', studentId: students[8].id, type: 'Smoking', date: today, time: '21:15',
    location: 'Building B · Stairwell', description: 'Smoking in a non-designated indoor area.',
    staff: 'K. Aziz', action: 'Written warning', status: 'Open', attachments: [],
    history: [{ at: hoursAgo(5), by: 'K. Aziz', note: 'Reported' }]
  });
  await put('violations', {
    id: 'VIO-2003', studentId: students[3].id, type: 'Property damage', date: '2025-08-28', time: '18:00',
    location: 'Building A · Room A-203', description: 'Broken desk chair; damage assessment pending.',
    staff: 'M. Saleh', action: 'Fine', status: 'Closed', attachments: [],
    history: [{ at: hoursAgo(90), by: 'M. Saleh', note: 'Reported' }, { at: hoursAgo(60), by: 'Committee', note: 'Decision: fine issued' }, { at: hoursAgo(40), by: 'Committee', note: 'Closed' }]
  });

  await put('complaints', {
    id: 'CMP-3001', studentId: students[4].id, category: 'Maintenance', sub: 'HVAC', title: 'AC not cooling',
    description: 'Room AC blows warm air since Monday.', status: 'In Progress', assignee: 'Facilities · HVAC team',
    priority: 'High', createdAt: hoursAgo(20), respondedAt: hoursAgo(18), resolvedAt: null, attachments: [],
    comments: [{ at: hoursAgo(18), by: 'Supervisor', text: 'Assigned to HVAC team' }, { at: hoursAgo(6), by: 'HVAC team', text: 'Part ordered, fix tomorrow' }]
  });
  await put('complaints', {
    id: 'CMP-3002', studentId: students[6].id, category: 'Internet', sub: '', title: 'Wi-Fi drops in Room B-105',
    description: 'Connection drops every few minutes in the evening.', status: 'Resolved', assignee: 'IT Services',
    priority: 'Medium', createdAt: hoursAgo(50), respondedAt: hoursAgo(46), resolvedAt: hoursAgo(30), attachments: [],
    comments: [{ at: hoursAgo(30), by: 'IT Services', text: 'Access point replaced' }]
  });
  await put('complaints', {
    id: 'CMP-3003', studentId: students[9].id, category: 'Housekeeping', sub: '', title: 'Corridor cleaning schedule',
    description: 'Floor 3 corridor missed cleaning twice this week.', status: 'Submitted', assignee: '',
    priority: 'Low', createdAt: hoursAgo(4), respondedAt: null, resolvedAt: null, attachments: [], comments: []
  });

  await put('requests', {
    id: 'REQ-4001', studentId: students[11].id, type: 'Room change',
    details: 'Requesting quieter room; conflict with roommate schedule.', status: 'Under Review',
    createdAt: hoursAgo(26), decidedAt: null,
    history: [{ at: hoursAgo(26), by: students[11].name, note: 'Submitted' }, { at: hoursAgo(20), by: 'Supervisor', note: 'Under review' }]
  });
  await put('requests', {
    id: 'REQ-4002', studentId: students[13].id, type: 'Housing certificate',
    details: 'Certificate needed for scholarship office.', status: 'Approved',
    createdAt: hoursAgo(48), decidedAt: hoursAgo(24),
    history: [{ at: hoursAgo(48), by: students[13].name, note: 'Submitted' }, { at: hoursAgo(24), by: 'Admin', note: 'Approved' }]
  });
  await put('requests', {
    id: 'REQ-4003', studentId: students[15].id, type: 'Exit permission',
    details: 'Weekend exit — family event, return Sunday 20:00.', status: 'Submitted',
    createdAt: hoursAgo(3), decidedAt: null,
    history: [{ at: hoursAgo(3), by: students[15].name, note: 'Submitted' }]
  });

  await put('documents', { id: 'DOC-5001', studentId: students[0].id, type: 'Housing agreement', name: 'housing-agreement-2025.pdf', uploadedAt: hoursAgo(300), by: 'Admin', size: '—', fileKey: null });
  await put('documents', { id: 'DOC-5002', studentId: students[3].id, type: 'Undertaking', name: 'quiet-hours-undertaking.pdf', uploadedAt: hoursAgo(60), by: 'S. Rahman', size: '—', fileKey: null });

  const calendar = [
    [today, 'Daily roll call — 21:00', 'rollcall'],
    [addDays(today, 2), 'Fire safety inspection · Building B', 'inspection'],
    [addDays(today, 5), 'Planned maintenance — water pumps', 'maintenance'],
    [addDays(today, 9), 'Movie night · Common hall', 'event'],
    [addDays(today, 20), 'Mid-semester room inspections', 'inspection']
  ];
  for (const [date, title, type] of calendar) await put('calendar', { id: rid('CAL'), date, title, type });

  await put('notifications', { id: rid('NTF'), at: new Date().toISOString(), type: 'rollcall', title: 'Daily roll call reminder', body: 'Roll call is scheduled at 21:00.', link: '', read: 0 });
  await put('notifications', { id: rid('NTF'), at: hoursAgo(4), type: 'violation', title: 'New violation reported', body: 'VIO-2002 · Smoking · Building B stairwell.', link: '', read: 0 });

  await putSettings(env, { semester: 'Fall 2026', semesterStart: '2025-08-20', semesterEnd: '2026-12-20', rollcallTime: '21:00' });

  await upsertOne(env, 'audit', {
    id: 'AUD-DEMO-' + env, at: new Date().toISOString(), user: 'system', role: '—',
    action: 'SEED', entity: 'database', entityId: env, details: 'Demo dataset initialised for ' + env
  });
  return true;
}

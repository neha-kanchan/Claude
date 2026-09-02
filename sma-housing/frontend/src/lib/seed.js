/* First-run demo dataset. The server holds only identities (roles + users) after
   a fresh install; the first sign-in seeds this and syncs it up. */

import { uid, todayStr, addDays, fmtD } from './utils.js';

const masterListFrom = (master, type) => master.filter((m) => m.type === type).map((m) => m.value);

export function seedData() {
  const master = [];
  const addM = (type, vals) => vals.forEach((v) => master.push({ id: uid('MD'), type, value: v, from: '2025-01-01', to: '', active: true }));
  addM('college', ['Engineering', 'Medicine', 'Business', 'Computer Science', 'Law', 'Sciences', 'Arts & Humanities']);
  addM('violationType', ['Noise disturbance', 'Smoking', 'Security violation', 'Property damage']);
  addM('complaintCategory', ['Maintenance', 'Housekeeping', 'Room-related', 'Roommate', 'Internet', 'Dining Services', 'Security', 'Others']);
  addM('maintenanceSub', ['Electrical', 'HVAC', 'Plumbing', 'Furniture', 'Internet', 'Doors', 'Equipment']);
  addM('requestType', ['Room change', 'Exit permission', 'Leave extension', 'Furniture request', 'Equipment request', 'Housing certificate', 'Personal belongings retrieval']);
  addM('attendanceStatus', ['Present', 'Absent', 'Hospital', 'Official Leave', 'Weekend Leave', 'Unknown']);
  addM('docType', ['Housing agreement', 'Undertaking', 'Report', 'ID copy', 'Medical note', 'Supporting document']);
  addM('disciplinaryAction', ['Verbal warning', 'Written warning', 'Fine', 'Community service', 'Referral to committee', 'Housing suspension']);

  const buildings = [{ id: 'B1', name: 'Building A', floors: 4 }, { id: 'B2', name: 'Building B', floors: 4 }, { id: 'B3', name: 'Building C', floors: 3 }];
  const rooms = [];
  buildings.forEach((b) => {
    for (let f = 1; f <= b.floors; f++) {
      for (let r = 1; r <= 6; r++) {
        const number = `${f}${String(r).padStart(2, '0')}`;
        rooms.push({ id: `${b.id}-${number}`, buildingId: b.id, floor: f, number, capacity: 2, active: true });
      }
    }
  });

  const first = ['Ahmed', 'Sara', 'Omar', 'Layla', 'Yousef', 'Noura', 'Khalid', 'Mona', 'Fahad', 'Reem', 'Hassan', 'Dana', 'Tariq', 'Aisha', 'Salem', 'Huda', 'Nasser', 'Lina', 'Majed', 'Farah', 'Ali', 'Rana', 'Ziad', 'Maha'];
  const last = ['Al-Harbi', 'Al-Otaibi', 'Khan', 'Haddad', 'Nasser', 'Saleh', 'Rahman', 'Aziz', 'Qassim', 'Farouk', 'Mansour', 'Zaki'];
  const colleges = masterListFrom(master, 'college');
  const students = [];
  for (let i = 0; i < 24; i++) {
    const room = rooms[i];
    const name = `${first[i]} ${last[i % last.length]}`;
    students.push({
      id: 'STU-' + String(1001 + i), name, email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@univ.edu',
      phone: '05' + String(50000000 + i * 13579).slice(0, 8), college: colleges[i % colleges.length],
      building: room.buildingId, room: room.id, status: 'Active', joined: '2025-08-20',
      emergency: 'Guardian · 0500-000-' + String(100 + i), photoKey: null
    });
  }
  const allocations = students.map((s) => ({ id: uid('ALC'), studentId: s.id, roomId: s.room, from: '2025-08-20', to: '', note: 'Semester move-in' }));

  const today = todayStr();
  const attendance = students.map((s, i) => ({
    id: uid('ATT'), date: today, studentId: s.id,
    status: i % 9 === 0 ? 'Absent' : i % 11 === 0 ? 'Weekend Leave' : i % 13 === 0 ? 'Hospital' : 'Present',
    note: '', by: 'System seed', at: new Date().toISOString()
  }));

  const now = new Date();
  const iso = (h) => new Date(now.getTime() - h * 36e5).toISOString();
  const movements = [
    { id: uid('MOV'), studentId: students[2].id, type: 'Exit', at: iso(6), expectedReturn: iso(-2), returnedAt: null, purpose: 'Family visit', by: 'Gate 1' },
    { id: uid('MOV'), studentId: students[5].id, type: 'Exit', at: iso(30), expectedReturn: iso(24), returnedAt: null, purpose: 'Weekend leave', by: 'Gate 1' },
    { id: uid('MOV'), studentId: students[7].id, type: 'Exit', at: iso(9), expectedReturn: iso(4), returnedAt: iso(2), purpose: 'Medical appointment', by: 'Gate 2', late: true },
    { id: uid('MOV'), studentId: students[1].id, type: 'Exit', at: iso(3), expectedReturn: iso(-5), returnedAt: null, purpose: 'Library', by: 'Gate 1' },
    { id: uid('MOV'), studentId: students[10].id, type: 'Entry', at: iso(1), expectedReturn: null, returnedAt: null, purpose: 'Return from class', by: 'Gate 1' }
  ];

  const violations = [
    { id: 'VIO-2001', studentId: students[3].id, type: 'Noise disturbance', date: today, time: '23:40', location: 'Building A · Floor 2',
      description: 'Loud music after quiet hours despite prior warning.', staff: 'S. Rahman', action: 'Verbal warning', status: 'Investigation', attachments: [],
      history: [{ at: iso(10), by: 'S. Rahman', note: 'Reported' }, { at: iso(8), by: 'Supervisor', note: 'Moved to Investigation' }] },
    { id: 'VIO-2002', studentId: students[8].id, type: 'Smoking', date: today, time: '21:15', location: 'Building B · Stairwell',
      description: 'Smoking in a non-designated indoor area.', staff: 'K. Aziz', action: 'Written warning', status: 'Open', attachments: [],
      history: [{ at: iso(5), by: 'K. Aziz', note: 'Reported' }] },
    { id: 'VIO-2003', studentId: students[3].id, type: 'Property damage', date: '2025-08-28', time: '18:00', location: 'Building A · Room A-203',
      description: 'Broken desk chair; damage assessment pending.', staff: 'M. Saleh', action: 'Fine', status: 'Closed', attachments: [],
      history: [{ at: iso(90), by: 'M. Saleh', note: 'Reported' }, { at: iso(60), by: 'Committee', note: 'Decision: fine issued' }, { at: iso(40), by: 'Committee', note: 'Closed' }] }
  ];

  const complaints = [
    { id: 'CMP-3001', studentId: students[4].id, category: 'Maintenance', sub: 'HVAC', title: 'AC not cooling', description: 'Room AC blows warm air since Monday.',
      status: 'In Progress', assignee: 'Facilities · HVAC team', priority: 'High', createdAt: iso(20), respondedAt: iso(18), resolvedAt: null, attachments: [],
      comments: [{ at: iso(18), by: 'Supervisor', text: 'Assigned to HVAC team' }, { at: iso(6), by: 'HVAC team', text: 'Part ordered, fix tomorrow' }] },
    { id: 'CMP-3002', studentId: students[6].id, category: 'Internet', sub: '', title: 'Wi-Fi drops in Room B-105', description: 'Connection drops every few minutes in the evening.',
      status: 'Resolved', assignee: 'IT Services', priority: 'Medium', createdAt: iso(50), respondedAt: iso(46), resolvedAt: iso(30), attachments: [],
      comments: [{ at: iso(30), by: 'IT Services', text: 'Access point replaced' }] },
    { id: 'CMP-3003', studentId: students[9].id, category: 'Housekeeping', sub: '', title: 'Corridor cleaning schedule', description: 'Floor 3 corridor missed cleaning twice this week.',
      status: 'Submitted', assignee: '', priority: 'Low', createdAt: iso(4), respondedAt: null, resolvedAt: null, attachments: [], comments: [] }
  ];

  const requests = [
    { id: 'REQ-4001', studentId: students[11].id, type: 'Room change', details: 'Requesting quieter room; conflict with roommate schedule.', status: 'Under Review', createdAt: iso(26), decidedAt: null,
      history: [{ at: iso(26), by: students[11].name, note: 'Submitted' }, { at: iso(20), by: 'Supervisor', note: 'Under review' }] },
    { id: 'REQ-4002', studentId: students[13].id, type: 'Housing certificate', details: 'Certificate needed for scholarship office.', status: 'Approved', createdAt: iso(48), decidedAt: iso(24),
      history: [{ at: iso(48), by: students[13].name, note: 'Submitted' }, { at: iso(24), by: 'Admin', note: 'Approved' }] },
    { id: 'REQ-4003', studentId: students[15].id, type: 'Exit permission', details: 'Weekend exit — family event, return Sunday 20:00.', status: 'Submitted', createdAt: iso(3), decidedAt: null,
      history: [{ at: iso(3), by: students[15].name, note: 'Submitted' }] }
  ];

  const documents = [
    { id: 'DOC-5001', studentId: students[0].id, type: 'Housing agreement', name: 'housing-agreement-2025.pdf', uploadedAt: iso(300), by: 'Admin', size: '—', fileKey: null },
    { id: 'DOC-5002', studentId: students[3].id, type: 'Undertaking', name: 'quiet-hours-undertaking.pdf', uploadedAt: iso(60), by: 'S. Rahman', size: '—', fileKey: null }
  ];

  const calendar = [
    { id: uid('CAL'), date: today, title: 'Daily roll call — 21:00', type: 'rollcall' },
    { id: uid('CAL'), date: addDays(today, 2), title: 'Fire safety inspection · Building B', type: 'inspection' },
    { id: uid('CAL'), date: addDays(today, 5), title: 'Planned maintenance — water pumps', type: 'maintenance' },
    { id: uid('CAL'), date: addDays(today, 9), title: 'Movie night · Common hall', type: 'event' },
    { id: uid('CAL'), date: addDays(today, 20), title: 'Mid-semester room inspections', type: 'inspection' }
  ];

  return {
    students, buildings, rooms, allocations, attendance, movements, violations, complaints, requests, documents, calendar, master,
    notifications: [
      { id: uid('NTF'), at: new Date().toISOString(), type: 'rollcall', title: 'Daily roll call reminder', body: 'Roll call for ' + fmtD(today) + ' is scheduled at 21:00.', read: false },
      { id: uid('NTF'), at: iso(4), type: 'violation', title: 'New violation reported', body: 'VIO-2002 · Smoking · Building B stairwell.', read: false }
    ],
    settings: { semester: 'Fall 2026', semesterStart: '2025-08-20', semesterEnd: '2026-12-20', rollcallTime: '21:00' },
    files: {}
  };
}

/* One store for the whole app: the signed-in user, the cached dataset, and the
   sync back to the API.

   The dataset is held in a ref and mutated in place (the API is a batch-diff
   endpoint, not per-record REST), so pages change data and then call commit()
   with the collections they touched. commit() schedules the sync and triggers
   the re-render - nothing re-renders behind your back. */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, apiJson, setToken, getToken, onExpired } from './api.js';
import { defaultPerms, PAGES } from './pages.js';
import { seedData } from './seed.js';
import { fmtD, fmtDT, todayStr, uid } from './utils.js';

export const COLLECTIONS = ['students', 'buildings', 'rooms', 'allocations', 'attendance', 'movements',
  'violations', 'complaints', 'requests', 'documents', 'calendar', 'notifications', 'audit',
  'master', 'roles', 'users', 'settings', 'files'];

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const emptyDb = () => Object.fromEntries(COLLECTIONS.map((c) => [c, c === 'settings' || c === 'files' ? {} : []]));

export function StoreProvider({ children }) {
  const db = useRef(emptyDb());
  const [, render] = useReducer((x) => x + 1, 0);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const saveTimers = useRef({});
  const toastTimer = useRef(null);

  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  /* Debounced batch sync of one collection. The server diffs against the
     database, writes the changes and audits each one. 403 means the role
     cannot write that collection; the local cache keeps working. */
  const save = useCallback((col) => {
    if (col === 'audit') return;                     // audit is server-generated
    clearTimeout(saveTimers.current[col]);
    saveTimers.current[col] = setTimeout(async () => {
      try {
        const r = await api('/sync/' + col, { method: 'PUT', body: JSON.stringify(db.current[col]) });
        if (r.status === 403) console.warn('sync ' + col + ': not permitted for this role');
        else if (!r.ok) console.warn('sync ' + col + ' failed', r.status);
      } catch (e) { console.warn('sync ' + col + ' error', e.message); }
    }, 300);
  }, []);

  /* Mutate then commit: commit(['students','files']) syncs those collections and re-renders. */
  const commit = useCallback((cols = []) => {
    (Array.isArray(cols) ? cols : [cols]).forEach(save);
    render();
  }, [save]);

  const audit = useCallback((action, entity, entityId, details) => {
    db.current.audit.unshift({
      id: uid('AUD'), at: new Date().toISOString(),
      user: user ? user.name : 'system', role: user ? user.role : '—',
      action, entity, entityId, details: details || ''
    });
    if (db.current.audit.length > 3000) db.current.audit.length = 3000;
    api('/audit', { method: 'POST', body: JSON.stringify({ action, entity, entityId, details }) }).catch(() => {});
    render();
  }, [user]);

  const notify = useCallback((type, title, body, link) => {
    db.current.notifications.unshift({ id: uid('NTF'), at: new Date().toISOString(), type, title, body, link: link || null, read: false });
    if (db.current.notifications.length > 500) db.current.notifications.length = 500;
    commit(['notifications']);
  }, [commit]);

  /* ---------------- session ---------------- */

  const loadData = useCallback(async (signedInUser) => {
    const data = await apiJson('/bootstrap');
    delete data._meta;
    COLLECTIONS.forEach((c) => { if (data[c] == null) data[c] = c === 'settings' || c === 'files' ? {} : []; });
    db.current = data;

    // First run: the server holds only identities, so seed the demo dataset and sync it up.
    if (!data.students.length) {
      const seeded = seedData();
      for (const c of COLLECTIONS) {
        if (c === 'roles' || c === 'users' || c === 'audit') continue;
        if (seeded[c] !== undefined) db.current[c] = seeded[c];
      }
      COLLECTIONS.forEach((c) => { if (c !== 'audit') save(c); });
      toast('First run — demo data created and saved to the database.');
    }
    db.current.roles.forEach((r) => {
      if (r.perms !== 'ALL' && (!r.perms || !Object.keys(r.perms).length)) r.perms = defaultPerms(r.name);
    });

    // Daily roll call reminder + overdue-return alerts, once per day.
    const t = todayStr();
    if (db.current.settings.lastRollcallReminder !== t) {
      db.current.settings.lastRollcallReminder = t;
      const rollcallAt = db.current.settings.rollcallTime || '21:00';
      db.current.notifications.unshift({ id: uid('NTF'), at: new Date().toISOString(), type: 'rollcall',
        title: 'Daily roll call reminder', body: 'Roll call for ' + fmtD(t) + ' is scheduled at ' + rollcallAt + '.', read: false });
      overdueFrom(db.current).forEach((m) => {
        const s = db.current.students.find((x) => x.id === m.studentId);
        db.current.notifications.unshift({ id: uid('NTF'), at: new Date().toISOString(), type: 'late',
          title: 'Overdue return', body: (s ? s.name : m.studentId) + ' has not returned; expected ' + fmtDT(m.expectedReturn) + '.', read: false });
      });
      save('settings'); save('notifications');
    }
    setUser(signedInUser);
    render();
  }, [save, toast]);

  const login = useCallback(async (username, password) => {
    const data = await apiJson('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setToken(data.token);
    await loadData(data.user);
    audit('LOGIN', 'session', data.user.id, 'Signed in (local)');
  }, [loadData, audit]);

  const logout = useCallback(() => {
    audit('LOGOUT', 'session', user ? user.id : '—', 'Signed out');
    setToken(null);
    setUser(null);
    db.current = emptyDb();
    render();
  }, [audit, user]);

  useEffect(() => {
    onExpired(() => { setUser(null); db.current = emptyDb(); toast('Session expired — please sign in again.'); render(); });
    (async () => {
      if (getToken()) {
        try {
          const me = await apiJson('/auth/me');
          await loadData(me);
        } catch { setToken(null); }
      }
      setBooting(false);
    })();
  }, [loadData, toast]);

  /* ---------------- permissions ---------------- */

  const can = useCallback((page, action) => {
    if (!user) return false;
    const role = db.current.roles.find((r) => r.name === user.role);
    if (!role) return false;
    if (role.perms === 'ALL') return true;
    const p = role.perms?.[page];
    if (!p || !p.view) return false;
    if (!action) return true;
    return Boolean(p.actions && p.actions[action]);
  }, [user]);

  const value = useMemo(() => ({
    db: db.current, user, booting, commit, save, audit, notify, toast, toastMsg, can, login, logout,
    pages: PAGES
  }), [user, booting, commit, save, audit, notify, toast, toastMsg, can, login, logout]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/* ---------------- derived data shared by several pages ---------------- */

export function overdueFrom(db) {
  const now = new Date().toISOString();
  return db.movements.filter((m) => m.type === 'Exit' && !m.returnedAt && m.expectedReturn && m.expectedReturn < now);
}

export function useLookups() {
  const { db } = useStore();
  return useMemo(() => ({
    student: (id) => db.students.find((s) => s.id === id) || { name: '(removed)', id },
    room: (id) => db.rooms.find((r) => r.id === id),
    bldg: (id) => db.buildings.find((b) => b.id === id) || { name: id || '—' },
    masterList: (type, onDate) => {
      const d = onDate || todayStr();
      return (db.master || []).filter((m) => m.type === type && m.active !== false && (!m.from || m.from <= d) && (!m.to || m.to >= d)).map((m) => m.value);
    },
    activeStudents: () => db.students.filter((s) => s.status === 'Active'),
    latestActivity: (sid) => {
      const m = db.movements.filter((x) => x.studentId === sid).sort((a, b) => b.at.localeCompare(a.at))[0];
      if (!m) return 'No movement logged';
      if (m.type === 'Exit' && !m.returnedAt) return 'Out since ' + fmtDT(m.at);
      if (m.returnedAt) return 'Returned ' + fmtDT(m.returnedAt);
      return m.type + ' ' + fmtDT(m.at);
    },
    occupancy: () => {
      const activeRooms = db.rooms.filter((r) => r.active !== false);
      const cap = activeRooms.reduce((a, r) => a + r.capacity, 0);
      const occupied = db.students.filter((s) => s.status === 'Active' && s.room).length;
      const roomsUsed = new Set(db.students.filter((s) => s.status === 'Active' && s.room).map((s) => s.room)).size;
      return { rooms: activeRooms.length, roomsUsed, roomsFree: activeRooms.length - roomsUsed, cap, occupied, rate: cap ? Math.round((occupied / cap) * 100) : 0 };
    },
    overdueMovements: () => overdueFrom(db),
    photoUrl: (s) => {
      const f = s && s.photoKey ? db.files[s.photoKey] : null;
      return f && f.data ? f.data : null;
    },
    storeFile: (fileObj) => {
      if (!fileObj || !fileObj.data) return null;
      const key = uid('FILE');
      db.files[key] = { name: fileObj.name, mime: fileObj.mime, data: fileObj.data, size: fileObj.size };
      return key;
    }
  }), [db]);
}

import { Router } from 'express';
import { COLLECTIONS, listAll, getOne, upsertOne, deleteOne, syncCollection, query, dbKind } from './db2.js';
import { login, requireAuth, authMode, setPassword, setUsername } from './auth.js';
import { canRead, canWrite, COLLECTION_PAGE } from './perms.js';
import { seedIdentities, wipeAll } from './seed2.js';

const nowIso = () => new Date().toISOString();
const rid = (p) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
// Express 4 does not catch async errors; wrap every handler.
const w = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function audit(user, action, entity, entityId, details) {
  await upsertOne('audit', {
    id: rid('AUD'), at: nowIso(),
    user: user?.name || user || 'system', role: user?.role || '—',
    action, entity: entity || '', entityId: entityId || '', details: details || ''
  });
}

export function buildRouter() {
  const r = Router();

  r.get('/health', w(async (_req, res) => {
    await query('select 1 as ok');
    res.json({ ok: true, db: dbKind(), authMode: authMode() });
  }));

  // ---- Auth ----
  r.post('/auth/login', w(async (req, res) => {
    if (authMode() !== 'local') return res.status(400).json({ error: 'Server is in Entra SSO mode; sign in with Microsoft and send the bearer token.' });
    await seedIdentities();
    const { username, password } = req.body || {};
    const result = await login(username, password);
    if (!result) { await audit(String(username || ''), 'LOGIN', 'session', '', 'Failed sign-in attempt'); return res.status(401).json({ error: 'Invalid username or password' }); }
    await audit(result.user, 'LOGIN', 'session', result.user.id, 'Signed in');
    res.json(result);
  }));

  const auth = requireAuth();

  r.get('/auth/me', auth, w(async (req, res) => res.json({ id: req.user.id, name: req.user.name, username: req.user.username, role: req.user.role })));

  // ---- Bootstrap: all collections the SPA needs after sign-in ----
  r.get('/bootstrap', auth, w(async (req, res) => {
    const out = {};
    for (const name of Object.keys(COLLECTIONS)) {
      if (!canRead(req.user, name)) { out[name] = (COLLECTIONS[name].dict || COLLECTIONS[name].object) ? {} : []; continue; }
      out[name] = await listAll(name);
    }
    out._meta = { db: dbKind(), authMode: authMode(), serverTime: nowIso(), user: { id: req.user.id, name: req.user.name, role: req.user.role } };
    res.json(out);
  }));

  // ---- Batch sync from the SPA (diffed server-side; every change audited) ----
  r.put('/sync/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit') return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: `Your role cannot modify ${col}` });
    const changes = await syncCollection(col, req.body);
    const entity = COLLECTION_PAGE[col] || col;
    if (col !== 'settings' && col !== 'notifications') {
      for (const id of changes.created) await audit(req.user, 'CREATE', entity, id, `Created ${col} record`);
      for (const id of changes.updated) await audit(req.user, 'UPDATE', entity, id, `Updated ${col} record`);
      for (const id of changes.deleted) await audit(req.user, 'DELETE', entity, id, `Deleted ${col} record`);
    }
    res.json(changes);
  }));

  // The SPA reports user actions (exports, workflow steps, sign-out) for the server audit trail.
  r.post('/audit', auth, w(async (req, res) => {
    const { action, entity, entityId, details } = req.body || {};
    await audit(req.user, String(action || 'ACTION').slice(0, 24), String(entity || '').slice(0, 40), String(entityId || '').slice(0, 60), String(details || '').slice(0, 500));
    res.status(204).end();
  }));

  // ---- File download by key (full bodies stored server-side; requirement 5) ----
  r.get('/files/:id/download', auth, w(async (req, res) => {
    if (!canRead(req.user, 'files')) return res.status(403).json({ error: 'Forbidden' });
    const f = await getOne('files', req.params.id);
    if (!f || !f.data) return res.status(404).json({ error: 'File not found' });
    const m = /^data:([^;]+);base64,(.+)$/.exec(f.data);
    if (!m) return res.status(500).json({ error: 'Stored file is not base64 data' });
    res.setHeader('Content-Type', f.mime || m[1] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/"/g, '')}"`);
    res.send(Buffer.from(m[2], 'base64'));
  }));

  // ---- Admin ----
  r.post('/users/:id/password', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    const { password, username } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (username) await setUsername(req.params.id, username);
    await setPassword(req.params.id, String(password));
    await audit(req.user, 'ADMIN', 'users', req.params.id, 'Credentials updated');
    res.status(204).end();
  }));

  r.get('/admin/backup', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    const dump = { exportedAt: nowIso(), db: dbKind(), data: {} };
    for (const name of Object.keys(COLLECTIONS)) dump.data[name] = await listAll(name);
    await audit(req.user, 'BACKUP', 'database', '—', 'Full JSON backup downloaded');
    res.setHeader('Content-Disposition', `attachment; filename="sma-housing-backup-${Date.now()}.json"`);
    res.json(dump);
  }));

  r.post('/admin/reset-demo', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    await wipeAll();
    await seedIdentities();
    res.json({ ok: true });
  }));

  // ---- Generic REST for integrations (requirement 1): GET/POST/PUT/DELETE per collection ----
  r.get('/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col]) return res.status(404).json({ error: 'Unknown collection' });
    if (!canRead(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    let rows = await listAll(col);
    if (Array.isArray(rows)) {
      for (const [k, v] of Object.entries(req.query)) rows = rows.filter((x) => String(x[k]) === String(v));
    }
    res.json(rows);
  }));

  r.get('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canRead(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const row = await getOne(col, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  r.post('/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const rec = { ...req.body };
    if (!rec.id) rec.id = rid(col.slice(0, 3).toUpperCase());
    const { created } = await upsertOne(col, rec);
    await audit(req.user, created ? 'CREATE' : 'UPDATE', COLLECTION_PAGE[col] || col, rec.id, 'Via REST API');
    res.status(created ? 201 : 200).json(await getOne(col, rec.id));
  }));

  r.put('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const existing = await getOne(col, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await upsertOne(col, { ...existing, ...req.body, id: req.params.id });
    await audit(req.user, 'UPDATE', COLLECTION_PAGE[col] || col, req.params.id, 'Via REST API');
    res.json(await getOne(col, req.params.id));
  }));

  r.delete('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    await deleteOne(col, req.params.id);
    await audit(req.user, 'DELETE', COLLECTION_PAGE[col] || col, req.params.id, 'Via REST API');
    res.status(204).end();
  }));

  return r;
}

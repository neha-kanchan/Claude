import { Router } from 'express';
import { COLLECTIONS, listAll, getOne, upsertOne, deleteOne, syncCollection, query, dbKind } from './db2.js';
import { login, requireAuth, authMode, setPassword, setUsername, mintViewToken, verifyViewToken, viewTokenTtlSeconds } from './auth.js';
import { canRead, canWrite, COLLECTION_PAGE } from './perms.js';
import { seedIdentities, seedDemoData, wipeEnv } from './seed2.js';

const ENVS = new Set(['prod', 'test']);
// File bodies are megabytes of base64. They leave the server only through the
// dedicated /files/:id/download and /files/:id/view routes, never as part of a
// collection listing or the bootstrap payload.
const stripBody = (f) => { const { data, ...meta } = f || {}; return meta; };
const stripBodies = (dict) => Object.fromEntries(Object.entries(dict || {}).map(([k, v]) => [k, stripBody(v)]));
const nowIso = () => new Date().toISOString();
const rid = (p) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
// Express 4 does not catch async errors; wrap every handler.
const w = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function audit(env, user, action, entity, entityId, details) {
  await upsertOne(env, 'audit', {
    id: rid('AUD'), at: nowIso(),
    user: user?.name || user || 'system', role: user?.role || '—',
    action, entity: entity || '', entityId: entityId || '', details: details || ''
  });
}

export function buildRouter() {
  const r = Router();

  // Environment selection (requirement 7): X-Env header, default prod.
  r.use((req, res, next) => {
    const env = (req.headers['x-env'] || 'prod').toString();
    if (!ENVS.has(env)) return res.status(400).json({ error: "X-Env must be 'prod' or 'test'" });
    req.env = env;
    next();
  });

  r.get('/health', w(async (_req, res) => {
    await query('select 1 as ok');
    res.json({ ok: true, db: dbKind(), authMode: authMode() });
  }));

  // ---- Auth ----
  r.post('/auth/login', w(async (req, res) => {
    if (authMode() !== 'local') return res.status(400).json({ error: 'Server is in Entra SSO mode; sign in with Microsoft and send the bearer token.' });
    await seedIdentities(req.env);
    const { username, password } = req.body || {};
    const result = await login(req.env, username, password);
    if (!result) { await audit(req.env, String(username || ''), 'LOGIN', 'session', '', 'Failed sign-in attempt'); return res.status(401).json({ error: 'Invalid username or password' }); }
    await audit(req.env, result.user, 'LOGIN', 'session', result.user.id, 'Signed in');
    res.json(result);
  }));

  // The SPA writes through the same REST routes as integrations do; it identifies
  // itself so the audit trail can still distinguish an in-app edit from an API push.
  const channel = (req) => (String(req.headers['x-source'] || '').toLowerCase() === 'ui' ? 'In-app edit' : 'Via REST API');

  const auth = requireAuth();

  r.get('/auth/me', auth, w(async (req, res) => res.json({ id: req.user.id, name: req.user.name, username: req.user.username, role: req.user.role })));

  // ---- Bootstrap: all collections the SPA needs after sign-in ----
  r.get('/bootstrap', auth, w(async (req, res) => {
    const out = {};
    for (const name of Object.keys(COLLECTIONS)) {
      if (!canRead(req.user, name)) { out[name] = (COLLECTIONS[name].dict || COLLECTIONS[name].object) ? {} : []; continue; }
      out[name] = name === 'files' ? stripBodies(await listAll(req.env, name)) : await listAll(req.env, name);
    }
    out._meta = { env: req.env, db: dbKind(), authMode: authMode(), serverTime: nowIso(), user: { id: req.user.id, name: req.user.name, role: req.user.role } };
    res.json(out);
  }));

  // ---- Batch sync from the SPA (diffed server-side; every change audited) ----
  r.put('/sync/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit') return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: `Your role cannot modify ${col}` });
    const changes = await syncCollection(req.env, col, req.body);
    const entity = COLLECTION_PAGE[col] || col;
    if (col !== 'settings' && col !== 'notifications') {
      for (const id of changes.created) await audit(req.env, req.user, 'CREATE', entity, id, `Created ${col} record`);
      for (const id of changes.updated) await audit(req.env, req.user, 'UPDATE', entity, id, `Updated ${col} record`);
      for (const id of changes.deleted) await audit(req.env, req.user, 'DELETE', entity, id, `Deleted ${col} record`);
    }
    res.json(changes);
  }));

  // The SPA reports user actions (exports, workflow steps, sign-out) for the server audit trail.
  r.post('/audit', auth, w(async (req, res) => {
    const { action, entity, entityId, details } = req.body || {};
    await audit(req.env, req.user, String(action || 'ACTION').slice(0, 24), String(entity || '').slice(0, 40), String(entityId || '').slice(0, 60), String(details || '').slice(0, 500));
    res.status(204).end();
  }));

  // ---- File download by key (full bodies stored server-side; requirement 5) ----
  r.get('/files/:id/download', auth, w(async (req, res) => {
    if (!canRead(req.user, 'files')) return res.status(403).json({ error: 'Forbidden' });
    const f = await getOne(req.env, 'files', req.params.id);
    if (!f || !f.data) return res.status(404).json({ error: 'File not found' });
    const m = /^data:([^;]+);base64,(.+)$/.exec(f.data);
    if (!m) return res.status(500).json({ error: 'Stored file is not base64 data' });
    res.setHeader('Content-Type', f.mime || m[1] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/"/g, '')}"`);
    res.send(Buffer.from(m[2], 'base64'));
  }));

  // A ticket the browser can put in an <img>/<a> URL, where headers are impossible.
  r.get('/files/view-token', auth, w(async (req, res) => {
    if (!canRead(req.user, 'files')) return res.status(403).json({ error: 'Forbidden' });
    res.json({ token: await mintViewToken(req.env, req.user.id), expiresIn: viewTokenTtlSeconds() });
  }));

  // Inline body for <img src>. Authorised by the ticket above, not the session token.
  r.get('/files/:id/view', w(async (req, res) => {
    let ticket;
    // An <img> cannot send X-Env, so the ticket itself carries the environment.
    try { ticket = await verifyViewToken(String(req.query.t || '')); }
    catch (e) { return res.status(401).json({ error: e.message || 'Invalid or expired file ticket' }); }
    const f = await getOne(ticket.env, 'files', req.params.id);
    if (!f || !f.data) return res.status(404).json({ error: 'File not found' });
    const m = /^data:([^;]+);base64,(.+)$/.exec(f.data);
    if (!m) return res.status(500).json({ error: 'Stored file is not base64 data' });
    res.setHeader('Content-Type', f.mime || m[1] || 'application/octet-stream');
    // A key names one immutable body, so the browser may keep it for the ticket's life.
    res.setHeader('Cache-Control', `private, max-age=${viewTokenTtlSeconds()}`);
    res.send(Buffer.from(m[2], 'base64'));
  }));

  // ---- Admin ----
  r.post('/users/:id/password', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    const { password, username } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (username) await setUsername(req.env, req.params.id, username);
    await setPassword(req.env, req.params.id, String(password));
    await audit(req.env, req.user, 'ADMIN', 'users', req.params.id, 'Credentials updated');
    res.status(204).end();
  }));

  r.post('/admin/clone-prod-to-test', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    await wipeEnv('test');
    for (const table of Object.keys(COLLECTIONS)) {
      const { rows } = await query(`select * from "${table}" where "env" = $1`, ['prod']);
      for (const row of rows) {
        const cols = Object.keys(row).filter((k) => k !== 'env');
        const names = ['"env"', ...cols.map((c) => `"${c}"`)];
        const ph = names.map((_, i) => `$${i + 1}`);
        await query(`insert into "${table}" (${names.join(', ')}) values (${ph.join(', ')})`, ['test', ...cols.map((c) => row[c])]);
      }
    }
    await audit('test', req.user, 'CLONE', 'environment', 'prod→test', 'Production cloned to non-production');
    await audit('prod', req.user, 'CLONE', 'environment', 'prod→test', 'Production cloned to non-production');
    res.json({ ok: true });
  }));

  r.get('/admin/backup', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    const dump = { exportedAt: nowIso(), env: req.env, db: dbKind(), data: {} };
    for (const name of Object.keys(COLLECTIONS)) dump.data[name] = await listAll(req.env, name);
    await audit(req.env, req.user, 'BACKUP', 'environment', req.env, 'Full JSON backup downloaded');
    res.setHeader('Content-Disposition', `attachment; filename="sma-housing-backup-${req.env}-${Date.now()}.json"`);
    res.json(dump);
  }));

  r.post('/admin/reset-demo', auth, w(async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator only' });
    await wipeEnv(req.env);
    await seedIdentities(req.env);
    await seedDemoData(req.env);
    res.json({ ok: true });
  }));

  // ---- Generic REST for integrations (requirement 1): GET/POST/PUT/DELETE per collection ----
  r.get('/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col]) return res.status(404).json({ error: 'Unknown collection' });
    if (!canRead(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    let rows = await listAll(req.env, col);
    if (col === 'files') rows = stripBodies(rows);
    if (Array.isArray(rows)) {
      for (const [k, v] of Object.entries(req.query)) rows = rows.filter((x) => String(x[k]) === String(v));
    }
    res.json(rows);
  }));

  r.get('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canRead(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const row = await getOne(req.env, col, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(col === 'files' ? stripBody(row) : row);
  }));

  r.post('/:collection', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const rec = { ...req.body };
    if (!rec.id) rec.id = rid(col.slice(0, 3).toUpperCase());
    const { created } = await upsertOne(req.env, col, rec);
    await audit(req.env, req.user, created ? 'CREATE' : 'UPDATE', COLLECTION_PAGE[col] || col, rec.id, channel(req));
    res.status(created ? 201 : 200).json(await getOne(req.env, col, rec.id));
  }));

  r.put('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    const existing = await getOne(req.env, col, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await upsertOne(req.env, col, { ...existing, ...req.body, id: req.params.id });
    await audit(req.env, req.user, 'UPDATE', COLLECTION_PAGE[col] || col, req.params.id, channel(req));
    res.json(await getOne(req.env, col, req.params.id));
  }));

  r.delete('/:collection/:id', auth, w(async (req, res) => {
    const col = req.params.collection;
    if (!COLLECTIONS[col] || col === 'audit' || COLLECTIONS[col].object) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user, col)) return res.status(403).json({ error: 'Forbidden' });
    await deleteOne(req.env, col, req.params.id);
    await audit(req.env, req.user, 'DELETE', COLLECTION_PAGE[col] || col, req.params.id, channel(req));
    res.status(204).end();
  }));

  return r;
}

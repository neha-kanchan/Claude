// Database adapter (v2) - PostgreSQL when DATABASE_URL is set, SQLite otherwise.
// Collections map 1:1 to normalized tables whose shapes match the SPA exactly.
// 'settings' is exposed as an object; 'files' as a { key: fileObj } dictionary.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

let driver = null;
export function dbKind() { return driver?.kind || 'none'; }

export async function initDb() {
  const url = process.env.DATABASE_URL || '';
  if (url) {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: url, ssl });
    driver = {
      kind: 'postgres',
      async query(sql, params = []) { const r = await pool.query(sql, params); return { rows: r.rows }; }
    };
  } else {
    // Zero-dependency mode: SQLite ships inside Node itself (stable in Node 24+,
    // available behind --experimental-sqlite on Node 22.5+). Nothing to download or compile.
    let DatabaseSync;
    try {
      ({ DatabaseSync } = await import('node:sqlite'));
    } catch {
      throw new Error(
        'This Node version (' + process.version + ') has no built-in SQLite. ' +
        'Use Node 24+ (recommended), or run "node --experimental-sqlite server.js" on Node 22, ' +
        'or set DATABASE_URL to a PostgreSQL connection string.'
      );
    }
    const file = process.env.SQLITE_FILE || path.join(__dirname, '..', 'db', 'housing.sqlite');
    const sqlite = new DatabaseSync(file);
    sqlite.exec('PRAGMA journal_mode = WAL');
    driver = {
      kind: 'sqlite',
      async query(sql, params = []) {
        const converted = sql.replace(/\$\d+/g, '?');
        const clean = params.map((p) => (p === undefined ? null : p));
        const stmt = sqlite.prepare(converted);
        if (/^\s*(select|with)/i.test(converted)) return { rows: stmt.all(...clean) };
        stmt.run(...clean);
        return { rows: [] };
      },
      raw: sqlite
    };
  }
  const sql = await readFile(SCHEMA_PATH, 'utf8');
  if (driver.kind === 'sqlite') driver.raw.exec(sql); else await driver.query(sql);
  return driver;
}

export function query(sql, params) { return driver.query(sql, params); }

const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const q = (c) => `"${snake(c)}"`;

// Collections. cols use the SPA's field names; ints are 0/1 or numeric; json columns hold arrays/objects.
export const COLLECTIONS = {
  students:      { cols: ['id','name','email','phone','college','building','room','status','joined','emergency'] },
  buildings:     { cols: ['id','name','floors'], ints: ['floors'] },
  rooms:         { cols: ['id','buildingId','floor','number','capacity','active'], ints: ['floor','capacity','active'] },
  allocations:   { cols: ['id','studentId','roomId','from','to','note'] },
  attendance:    { cols: ['id','date','studentId','status','note','by','at'] },
  movements:     { cols: ['id','studentId','type','at','expectedReturn','returnedAt','purpose','by','late'], ints: ['late'] },
  violations:    { cols: ['id','studentId','type','date','time','location','description','staff','action','status','attachments','history'], json: ['attachments','history'] },
  complaints:    { cols: ['id','studentId','category','sub','title','description','status','assignee','priority','createdAt','respondedAt','resolvedAt','attachments','comments'], json: ['attachments','comments'] },
  requests:      { cols: ['id','studentId','type','details','status','createdAt','decidedAt','history'], json: ['history'] },
  documents:     { cols: ['id','studentId','type','name','uploadedAt','by','size','fileKey'] },
  files:         { cols: ['id','name','mime','size','data'], ints: ['size'], dict: true },
  calendar:      { cols: ['id','date','title','type'] },
  notifications: { cols: ['id','at','type','title','body','link','read'], ints: ['read'], bools: ['read'] },
  audit:         { cols: ['id','at','user','role','action','entity','entityId','details'] },
  master:        { cols: ['id','type','value','from','to','active'], ints: ['active'], bools: ['active'] },
  roles:         { cols: ['id','name','desc','perms','system'], ints: ['system'], bools: ['system'], json: ['perms'] },
  users:         { cols: ['id','name','email','role','active','username','passwordHash','entraOid'], ints: ['active'], bools: ['active'], secret: ['passwordHash','entraOid'] },
  settings:      { object: true }
};

const INT_DEFAULTS = { late: 0, read: 0, active: 1, system: 0, capacity: 2 };

function toRowValue(spec, col, v) {
  if ((spec.ints || []).includes(col)) {
    if (v === true) return 1;
    if (v === false) return 0;
    if (v === undefined || v === null || v === '') return INT_DEFAULTS[col] ?? null;
    return Number(v);
  }
  if (v === undefined || v === null) return null;
  if ((spec.json || []).includes(col) && typeof v !== 'string') return JSON.stringify(v);
  return String(v);
}

function fromRow(spec, row) {
  const out = {};
  for (const col of spec.cols) {
    if ((spec.secret || []).includes(col)) continue;
    let v = row[snake(col)];
    if (v === undefined) v = row[col.toLowerCase()];
    if ((spec.json || []).includes(col) && typeof v === 'string' && v) {
      try { v = JSON.parse(v); } catch { /* e.g. perms 'ALL' stays a string */ }
    }
    if ((spec.bools || []).includes(col)) v = Boolean(Number(v));
    else if ((spec.ints || []).includes(col) && v !== null && v !== undefined) v = Number(v);
    if (v === null || v === undefined) v = (spec.json || []).includes(col) ? null : '';
    out[col] = v;
  }
  return out;
}

export async function listAll(env, collection) {
  const spec = COLLECTIONS[collection];
  if (spec.object) return getSettings(env);
  const { rows } = await query(`select * from "${collection}" where "env" = $1`, [env]);
  const list = rows.map((r) => fromRow(spec, r));
  if (spec.dict) return Object.fromEntries(list.map((f) => [f.id, f]));
  return list;
}

export async function getOne(env, collection, id) {
  const spec = COLLECTIONS[collection];
  const { rows } = await query(`select * from "${collection}" where "env" = $1 and "id" = $2`, [env, id]);
  return rows[0] ? fromRow(spec, rows[0]) : null;
}

export async function upsertOne(env, collection, record, { keepSecrets = false } = {}) {
  const spec = COLLECTIONS[collection];
  const cols = spec.cols.filter((c) => !(spec.secret || []).includes(c) || keepSecrets || record[c] !== undefined);
  const existing = await query(`select "id" from "${collection}" where "env" = $1 and "id" = $2`, [env, record.id]);
  if (existing.rows.length) {
    const sets = []; const params = []; let i = 1;
    for (const c of cols) {
      if (c === 'id') continue;
      if ((spec.secret || []).includes(c) && record[c] === undefined) continue;
      sets.push(`${q(c)} = $${i++}`); params.push(toRowValue(spec, c, record[c]));
    }
    params.push(env, record.id);
    await query(`update "${collection}" set ${sets.join(', ')} where "env" = $${i++} and "id" = $${i}`, params);
    return { created: false };
  }
  const names = ['"env"', ...cols.map(q)];
  const params = [env, ...cols.map((c) => toRowValue(spec, c, record[c]))];
  await query(`insert into "${collection}" (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')})`, params);
  return { created: true };
}

export async function deleteOne(env, collection, id) {
  await query(`delete from "${collection}" where "env" = $1 and "id" = $2`, [env, id]);
}

// ---- settings: env-scoped key/value exposed as one object ----
export async function getSettings(env) {
  const { rows } = await query('select "key", "value" from "settings" where "env" = $1', [env]);
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}
export async function putSettings(env, obj) {
  const current = await getSettings(env);
  for (const [k, v] of Object.entries(obj || {})) {
    const val = JSON.stringify(v);
    if (k in current) await query('update "settings" set "value" = $1 where "env" = $2 and "key" = $3', [val, env, k]);
    else await query('insert into "settings" ("env","key","value") values ($1,$2,$3)', [env, k, val]);
  }
  for (const k of Object.keys(current)) {
    if (!(k in (obj || {}))) await query('delete from "settings" where "env" = $1 and "key" = $2', [env, k]);
  }
}

// ---- Batch sync from the SPA (diffed; caller audits each change) ----
export async function syncCollection(env, collection, payload) {
  const spec = COLLECTIONS[collection];
  if (spec.object) { await putSettings(env, payload); return { updated: ['settings'] , created: [], deleted: [] }; }

  let records = payload;
  if (spec.dict) records = Object.entries(payload || {}).map(([id, v]) => ({ ...v, id }));
  if (!Array.isArray(records)) throw new Error('Expected an array');

  const currentRaw = await listAll(env, collection);
  const current = spec.dict ? Object.values(currentRaw) : currentRaw;
  const byId = Object.fromEntries(current.map((r) => [r.id, r]));
  const incomingIds = new Set(records.filter((r) => r && r.id).map((r) => r.id));
  const changes = { created: [], updated: [], deleted: [] };

  for (const rec of records) {
    if (!rec || !rec.id) continue;
    if (!byId[rec.id]) { await upsertOne(env, collection, rec); changes.created.push(rec.id); }
    else if (JSON.stringify(normalize(spec, rec)) !== JSON.stringify(normalize(spec, byId[rec.id]))) {
      await upsertOne(env, collection, rec); changes.updated.push(rec.id);
    }
  }
  for (const id of Object.keys(byId)) {
    if (!incomingIds.has(id)) { await deleteOne(env, collection, id); changes.deleted.push(id); }
  }
  return changes;
}

function normalize(spec, rec) {
  const out = {};
  for (const c of spec.cols) {
    if ((spec.secret || []).includes(c)) continue;
    let v = rec[c];
    if ((spec.json || []).includes(c) && typeof v === 'string' && v && v !== 'ALL') { try { v = JSON.parse(v); } catch {} }
    if ((spec.bools || []).includes(c)) v = Boolean(v === true || Number(v));
    else if ((spec.ints || []).includes(c)) v = v === '' || v === null || v === undefined ? (INT_DEFAULTS[c] ?? null) : Number(v);
    if (v === undefined || v === null) v = (spec.json || []).includes(c) ? null : '';
    out[c] = v;
  }
  return out;
}

export async function getUserByUsername(env, username) {
  const { rows } = await query('select * from "users" where "env" = $1 and "username" = $2 and "active" = 1', [env, username]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, email: r.email, role: r.role, active: Number(r.active), username: r.username, passwordHash: r.password_hash, entraOid: r.entra_oid };
}

export async function getRoleByName(env, name) {
  const { rows } = await query('select * from "roles" where "env" = $1 and "name" = $2', [env, name]);
  if (!rows[0]) return null;
  let perms = rows[0].perms;
  if (perms !== 'ALL') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
  return { id: rows[0].id, name: rows[0].name, perms };
}

export async function countRows(env, collection) {
  const { rows } = await query(`select count(*) as n from "${collection}" where "env" = $1`, [env]);
  return Number(rows[0].n);
}

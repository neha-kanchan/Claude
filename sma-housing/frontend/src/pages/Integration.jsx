import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { todayStr } from '../lib/utils.js';
import { PageHead } from '../components/ui.jsx';

const ENDPOINTS = [
  ['GET', '/api/students', 'List / pull students (any field as a query filter)'],
  ['GET', '/api/students/{id}', 'One student record'],
  ['POST', '/api/students', 'Push a new student (Admissions)'],
  ['PUT', '/api/students/{id}', 'Update a student'],
  ['GET', '/api/attendance?date=', 'Pull daily roll call'],
  ['POST', '/api/attendance', 'Push an attendance record'],
  ['GET', '/api/movements', 'Entry/exit log (Card Access push)'],
  ['POST', '/api/movements', 'Gate system pushes swipe events'],
  ['GET', '/api/violations · /complaints · /requests', 'Pull cases'],
  ['POST', '/api/complaints', 'Push a complaint (student portal)'],
  ['GET', '/api/files/{key}/download', 'Stored file body (photos, agreements, evidence)'],
  ['GET', '/api/audit', 'Audit log pull']
];

const SCHEMA = `students(id PK, name, email, phone, college, building, room, status, joined, emergency, photo_key)
buildings(id PK, name, floors)
rooms(id PK, building_id FK, floor, number, capacity, active)
allocations(id PK, student_id FK, room_id FK, from, to, note)
attendance(id PK, date, student_id FK, status, note, by, at)
movements(id PK, student_id FK, type, at, expected_return, returned_at, late, purpose, by)
violations(id PK, student_id FK, type, date, time, location, description, staff, action, status, attachments, history)
complaints(id PK, student_id FK, category, sub, title, description, status, assignee, priority, created_at, responded_at, resolved_at, attachments, comments)
requests(id PK, student_id FK, type, details, status, created_at, decided_at, history)
documents(id PK, student_id FK, type, name, uploaded_at, by, size, file_key)
files(id PK, name, mime, size, data)
calendar(id PK, date, title, type)
notifications(id PK, at, type, title, body, link, read)
audit(id PK, at, user, role, action, entity, entity_id, details)
master(id PK, type, value, from, to, active)
roles(id PK, name, desc, perms JSON, system)
users(id PK, name, email, role, active, username, password_hash, entra_oid)`;

export default function Integration() {
  const { user, toast } = useStore();

  const downloadBackup = async () => {
    const r = await api('/admin/backup');
    if (!r.ok) { const d = await r.json().catch(() => ({})); return toast(d.error || 'Backup failed (administrator only)'); }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sma-housing-backup-${todayStr()}.json`;
    a.click();
    toast('Backup downloaded');
  };

  return (
    <>
      <PageHead title="Integration & API">
        Every screen in this app is a client of the same REST API, so other systems can push and pull the same data with a bearer token.
      </PageHead>

      <div className="grid two-col">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card">
            <h2>REST API</h2>
            <p style={{ fontSize: '.87rem', marginBottom: '.7rem' }}>
              Authenticate with <span className="mono">POST /api/auth/login</span>, then send <span className="mono">Authorization: Bearer &lt;token&gt;</span>.
              Role permissions are enforced server-side on every route.
            </p>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Method</th><th>Endpoint</th><th>Purpose</th></tr></thead>
                <tbody>
                  {ENDPOINTS.map(([m, path, purpose]) => (
                    <tr key={m + path}>
                      <td><span className={'tag ' + (m === 'GET' ? 'blue' : 'green')}>{m}</span></td>
                      <td className="mono" style={{ fontSize: '.78rem' }}>{path}</td>
                      <td style={{ fontSize: '.83rem' }}>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Backups</h2>
            <p style={{ fontSize: '.87rem' }}>
              Download a full snapshot of the database (all tables, document metadata, stored files and the audit log) as JSON —
              the same shape a server-side backup job would produce.
            </p>
            <button className="btn" style={{ marginTop: '.7rem' }} onClick={downloadBackup}>⬇ Download backup (JSON)</button>
            <p style={{ fontSize: '.78rem', color: 'var(--ink-soft)', marginTop: '.5rem' }}>
              Administrator only. Signed in as {user.name} ({user.role}).
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <div className="card">
            <h2>Database schema</h2>
            <p style={{ fontSize: '.85rem', marginBottom: '.6rem' }}>
              One table per collection, created automatically on start-up against PostgreSQL or SQLite:
            </p>
            <pre className="mono" style={{
              fontSize: '.72rem', lineHeight: 1.7, background: 'var(--paper)', border: '1px solid var(--line)',
              borderRadius: 8, padding: '.9rem', overflowX: 'auto', whiteSpace: 'pre', margin: 0
            }}>{SCHEMA}</pre>
          </div>
          <div className="card">
            <h2>Planned integrations</h2>
            <div style={{ fontSize: '.87rem', lineHeight: 1.9 }}>
              🎓 Admissions & Registration — student sync (pull)<br />
              💳 Student ID / Card Access — gate events (push)<br />
              💰 Finance — fines & housing fees (push/pull)<br />
              ✉️ Email / SMS gateway — notification delivery<br />
              🔐 Microsoft Entra ID — SSO (OIDC) & role claims
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

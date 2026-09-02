import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { exportCSV } from '../lib/utils.js';
import { Can, Empty, Options, PageHead, PrintButton, StudentCell, Tag } from '../components/ui.jsx';
import StudentForm from '../components/StudentForm.jsx';
import AllocateForm from '../components/AllocateForm.jsx';

export default function Students() {
  const { db, audit, toast } = useStore();
  const { bldg, masterList, latestActivity } = useLookups();
  const [f, setF] = useState({ q: '', college: '', building: '', status: '' });
  const [editing, setEditing] = useState(null);      // student id, or '' for a new one
  const [allocating, setAllocating] = useState(null);

  const rows = db.students.filter((s) =>
    (!f.q || s.name.toLowerCase().includes(f.q.toLowerCase()) || s.id.toLowerCase().includes(f.q.toLowerCase()) || (s.email || '').toLowerCase().includes(f.q.toLowerCase()))
    && (!f.college || s.college === f.college) && (!f.building || s.building === f.building) && (!f.status || s.status === f.status));

  const doExport = () => {
    const ok = exportCSV('students.csv', db.students.map((s) => ({
      id: s.id, name: s.name, email: s.email, college: s.college, building: bldg(s.building).name,
      room: s.room, status: s.status, photo: s.photoKey ? 'on file' : 'none', last_activity: latestActivity(s.id)
    })));
    if (!ok) return toast('Nothing to export');
    audit('EXPORT', 'report', 'students.csv', 'CSV export');
    toast('Exported students.csv');
  };

  return (
    <>
      <PageHead title="Resident students" actions={
        <>
          <Can page="students" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <PrintButton />
          <Can page="students" action="add"><button className="btn primary" onClick={() => setEditing('')}>＋ Add student</button></Can>
        </>
      }>
        Profiles, room assignments and status. Open a student for the full one-page history.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>Search</label>
            <input placeholder="Name, ID or email" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
          <div>
            <label>College</label>
            <select value={f.college} onChange={(e) => setF({ ...f, college: e.target.value })}><Options values={masterList('college')} includeBlank /></select>
          </div>
          <div>
            <label>Building</label>
            <select value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })}>
              <option value="">All</option>
              {db.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">All</option><option>Active</option><option>Inactive</option>
            </select>
          </div>
        </div>

        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Student</th><th>Email</th><th>College / Major</th><th>Building</th><th>Room</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><StudentCell id={s.id} /></td>
                    <td style={{ fontSize: '.82rem' }}>{s.email}</td>
                    <td>{s.college}</td>
                    <td>{bldg(s.building).name}</td>
                    <td className="mono">{s.room || '—'}</td>
                    <td><Tag>{s.status}</Tag></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Can page="students" action="edit"><button className="btn small" onClick={() => setEditing(s.id)}>Edit</button></Can>{' '}
                      <Can page="students" action="allocate"><button className="btn small" onClick={() => setAllocating(s.id)}>Room</button></Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No students match these filters.</Empty>}
        </div>
      </div>

      {editing !== null ? <StudentForm studentId={editing || undefined} onClose={() => setEditing(null)} /> : null}
      {allocating ? <AllocateForm studentId={allocating} onClose={() => setAllocating(null)} /> : null}
    </>
  );
}

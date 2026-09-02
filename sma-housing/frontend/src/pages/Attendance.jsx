import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { exportCSV, todayStr, uid } from '../lib/utils.js';
import { Can, Empty, Options, PageHead, PrintButton, StudentLink, Tag } from '../components/ui.jsx';

export default function Attendance() {
  const { db, user, can, commit, audit, toast } = useStore();
  const { bldg, masterList, latestActivity } = useLookups();
  const [date, setDate] = useState(todayStr());
  const [building, setBuilding] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const statuses = masterList('attendanceStatus');
  const rec = (sid) => db.attendance.find((a) => a.date === date && a.studentId === sid);
  const canRecord = can('attendance', 'record');

  const students = db.students.filter((s) => s.status === 'Active'
    && (!building || s.building === building)
    && (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase())));

  const counts = {};
  statuses.forEach((x) => { counts[x] = 0; });
  let unrecorded = 0;
  students.forEach((s) => { const r = rec(s.id); if (r) counts[r.status] = (counts[r.status] || 0) + 1; else unrecorded++; });
  const rows = students.filter((s) => { const r = rec(s.id); return !status || (r && r.status === status); });

  const setAttendance = (sid, value) => {
    if (!value) return;
    const r = rec(sid);
    if (r) { r.status = value; r.by = user.name; r.at = new Date().toISOString(); }
    else db.attendance.push({ id: uid('ATT'), date, studentId: sid, status: value, note: '', by: user.name, at: new Date().toISOString() });
    commit(['attendance']);
    audit('ATTENDANCE', 'student', sid, `${date}: ${value}`);
  };

  const setNote = (sid, note) => {
    const r = rec(sid);
    if (r) r.note = note;
    else db.attendance.push({ id: uid('ATT'), date, studentId: sid, status: 'Unknown', note, by: user.name, at: new Date().toISOString() });
    commit(['attendance']);
  };

  const markAllPresent = () => {
    let n = 0;
    db.students.filter((s) => s.status === 'Active').forEach((s) => {
      if (!rec(s.id)) {
        db.attendance.push({ id: uid('ATT'), date, studentId: s.id, status: 'Present', note: '', by: user.name, at: new Date().toISOString() });
        n++;
      }
    });
    commit(['attendance']);
    audit('ATTENDANCE', 'rollcall', date, `Bulk marked ${n} students Present`);
    toast(n + ' students marked Present');
  };

  const doExport = () => {
    exportCSV(`attendance-${date}.csv`, db.students.filter((s) => s.status === 'Active').map((s) => {
      const r = rec(s.id);
      return { date, student_id: s.id, name: s.name, building: bldg(s.building).name, room: s.room, status: r ? r.status : 'Not recorded', note: r?.note || '', recorded_by: r?.by || '' };
    }));
    audit('EXPORT', 'report', `attendance-${date}.csv`, 'CSV export');
    toast('Exported attendance');
  };

  return (
    <>
      <PageHead title="Attendance & daily roll call" actions={
        <>
          <Can page="attendance" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <PrintButton />
          <Can page="attendance" action="record"><button className="btn primary" onClick={markAllPresent}>Mark all unrecorded Present</button></Can>
        </>
      }>
        Record each resident's status for the selected date. Statuses: {statuses.join(' · ')}.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <label>Building</label>
            <select value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">All</option>
              {db.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value)}><Options values={statuses} includeBlank /></select></div>
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: '.8rem' }}>
          {Object.entries(counts).filter(([, n]) => n).map(([k, n]) => (
            <span key={k}><Tag>{k}</Tag> <strong style={{ marginRight: '.9rem' }}>{n}</strong></span>
          ))}
          {unrecorded ? <><span className="tag grey">Not recorded</span> <strong>{unrecorded}</strong></> : null}
        </div>

        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Student</th><th>Room</th><th>Status</th><th>Note</th><th>Latest activity</th></tr></thead>
              <tbody>
                {rows.map((s) => {
                  const r = rec(s.id);
                  return (
                    <tr key={s.id}>
                      <td><StudentLink id={s.id} /></td>
                      <td className="mono">{s.room || '—'}</td>
                      <td>
                        {canRecord ? (
                          <select style={{ minWidth: 130 }} value={r?.status || ''} onChange={(e) => setAttendance(s.id, e.target.value)}>
                            <option value="">— record —</option>
                            <Options values={statuses} />
                          </select>
                        ) : (r ? <Tag>{r.status}</Tag> : <span className="tag grey">Not recorded</span>)}
                      </td>
                      <td>
                        {canRecord
                          ? <input style={{ minWidth: 120 }} defaultValue={r?.note || ''} placeholder="note" onBlur={(e) => setNote(s.id, e.target.value)} />
                          : (r?.note || '')}
                      </td>
                      <td style={{ fontSize: '.8rem', color: 'var(--ink-soft)' }}>{latestActivity(s.id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty>No students match.</Empty>}
        </div>
      </div>
    </>
  );
}

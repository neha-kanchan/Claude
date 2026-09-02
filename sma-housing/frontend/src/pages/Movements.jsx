import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { exportCSV, fmtDT, hoursBetween, nowTime, todayStr, uid } from '../lib/utils.js';
import { Can, Empty, Modal, PageHead, StudentLink, StudentOptions, Tag } from '../components/ui.jsx';

const isOverdue = (m) => m.type === 'Exit' && !m.returnedAt && m.expectedReturn && m.expectedReturn < new Date().toISOString();

export default function Movements() {
  const { db, user, commit, audit, notify, toast } = useStore();
  const { student, activeStudents, overdueMovements } = useLookups();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);

  const overdue = overdueMovements();
  const rows = db.movements.slice().sort((a, b) => b.at.localeCompare(a.at)).filter((m) => {
    const s = student(m.studentId);
    if (q && !(s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))) return false;
    if (filter === 'out') return m.type === 'Exit' && !m.returnedAt;
    if (filter === 'overdue') return isOverdue(m);
    if (filter === 'late') return Boolean(m.late);
    return true;
  });

  const logReturn = (mid) => {
    const m = db.movements.find((x) => x.id === mid);
    m.returnedAt = new Date().toISOString();
    m.late = Boolean(m.expectedReturn && m.returnedAt > m.expectedReturn);
    commit(['movements']);
    audit('MOVEMENT', 'student', m.studentId, 'Return logged' + (m.late ? ' (LATE)' : ''));
    if (m.late) notify('late', 'Late return recorded', `${student(m.studentId).name} returned ${hoursBetween(m.expectedReturn, m.returnedAt)}h after the approved time.`);
    toast('Return logged');
  };

  const doExport = () => {
    exportCSV('movements.csv', db.movements.map((m) => ({
      id: m.id, student_id: m.studentId, student: student(m.studentId).name, type: m.type, at: m.at,
      expected_return: m.expectedReturn || '', returned_at: m.returnedAt || '', late: m.late ? 'yes' : '', purpose: m.purpose, recorded_by: m.by
    })));
    audit('EXPORT', 'report', 'movements.csv', 'CSV export');
    toast('Exported movements.csv');
  };

  return (
    <>
      <PageHead title="Entry / exit log" actions={
        <>
          <Can page="movements" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <Can page="movements" action="record"><button className="btn primary" onClick={() => setForm({})}>＋ Record exit / entry</button></Can>
        </>
      }>
        Temporary exits, returns and gate activity. Overdue returns are flagged automatically.
      </PageHead>

      {overdue.length ? (
        <div className="card" style={{ borderLeft: '4px solid var(--brick)', marginBottom: '1rem' }}>
          <strong style={{ color: 'var(--brick)' }}>⏰ Overdue returns ({overdue.length})</strong>
          {overdue.map((m) => (
            <div key={m.id} style={{ fontSize: '.87rem', marginTop: '.35rem' }}>
              {student(m.studentId).name} — expected back {fmtDT(m.expectedReturn)} ({hoursBetween(m.expectedReturn, new Date().toISOString())}h overdue){' '}
              <Can page="movements" action="return"><button className="btn small" onClick={() => logReturn(m.id)}>Log return now</button></Can>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div>
            <label>Show</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All records</option><option value="out">Currently out</option>
              <option value="overdue">Overdue only</option><option value="late">Returned late</option>
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Student</th><th>Type</th><th>Time</th><th>Purpose</th><th>Expected return</th><th>Returned</th><th>Gate / by</th><th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><StudentLink id={m.studentId} /></td>
                    <td>{m.type === 'Exit' ? '🚪 Exit' : '✅ Entry'}</td>
                    <td>{fmtDT(m.at)}</td>
                    <td style={{ fontSize: '.83rem' }}>{m.purpose || ''}</td>
                    <td>{m.expectedReturn ? fmtDT(m.expectedReturn) : '—'}</td>
                    <td>
                      {m.returnedAt
                        ? <>{fmtDT(m.returnedAt)} {m.late ? <Tag>Late</Tag> : null}</>
                        : m.type === 'Exit'
                          ? <span className={'tag ' + (isOverdue(m) ? 'brick' : 'amber')}>{isOverdue(m) ? 'Overdue' : 'Out'}</span>
                          : '—'}
                    </td>
                    <td style={{ fontSize: '.83rem' }}>{m.by || ''}</td>
                    <td>
                      {m.type === 'Exit' && !m.returnedAt
                        ? <Can page="movements" action="return"><button className="btn small" onClick={() => logReturn(m.id)}>Log return</button></Can>
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No movement records match.</Empty>}
        </div>
      </div>

      {form ? <MovementForm students={activeStudents()} onClose={() => setForm(null)} onSave={(rec) => {
        db.movements.push({ id: uid('MOV'), ...rec, returnedAt: null, by: user.name });
        commit(['movements']);
        audit('MOVEMENT', 'student', rec.studentId, rec.type + ' recorded');
        toast(rec.type + ' recorded');
        setForm(null);
      }} /> : null}
    </>
  );
}

function MovementForm({ students, onClose, onSave }) {
  const [f, setF] = useState({
    studentId: students[0]?.id || '', type: 'Exit', date: todayStr(), time: nowTime(), expectedReturn: '', purpose: ''
  });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal title="Record movement" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({
          studentId: f.studentId, type: f.type,
          at: new Date(f.date + 'T' + f.time).toISOString(),
          expectedReturn: f.type === 'Exit' && f.expectedReturn ? new Date(f.expectedReturn).toISOString() : null,
          purpose: f.purpose.trim()
        })}>Record</button></>}>
      <div className="frow">
        <div><label>Student</label><select value={f.studentId} onChange={set('studentId')}><StudentOptions students={students} /></select></div>
        <div><label>Type</label><select value={f.type} onChange={set('type')}><option>Exit</option><option>Entry</option></select></div>
      </div>
      <div className="frow">
        <div><label>Date</label><input type="date" value={f.date} onChange={set('date')} /></div>
        <div><label>Time</label><input type="time" value={f.time} onChange={set('time')} /></div>
      </div>
      {f.type === 'Exit' ? (
        <div><label>Expected return (for exits)</label><input type="datetime-local" value={f.expectedReturn} onChange={set('expectedReturn')} /></div>
      ) : null}
      <div><label>Purpose</label><input value={f.purpose} onChange={set('purpose')} placeholder="e.g. Family visit, medical appointment" /></div>
    </Modal>
  );
}

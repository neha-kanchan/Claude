import { useRef, useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { downloadDataUrl, exportCSV, fmtD, fmtDT, fmtSize, nowTime, readFileInput, todayStr } from '../lib/utils.js';
import { Can, Empty, Modal, Options, PageHead, PrintButton, StudentLink, StudentOptions, Tag } from '../components/ui.jsx';

const FLOW = ['Open', 'Investigation', 'Decision', 'Closed'];

export default function Violations() {
  const { db, user, can, commit, audit, notify, toast } = useStore();
  const { student, masterList, activeStudents, storeFile } = useLookups();
  const [f, setF] = useState({ q: '', type: '', status: '', building: '' });
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const rows = db.violations.filter((v) => {
    const s = student(v.studentId);
    const q = f.q.toLowerCase();
    return (!q || s.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || (v.location || '').toLowerCase().includes(q))
      && (!f.type || v.type === f.type) && (!f.status || v.status === f.status) && (!f.building || (v.location || '').includes(f.building));
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  const doExport = () => {
    exportCSV('violations.csv', db.violations.map((v) => ({
      id: v.id, student_id: v.studentId, student: student(v.studentId).name, type: v.type, date: v.date, time: v.time,
      location: v.location, description: v.description, staff: v.staff, action: v.action, status: v.status
    })));
    audit('EXPORT', 'report', 'violations.csv', 'CSV export');
    toast('Exported violations.csv');
  };

  const saveNew = async (rec, fileInput) => {
    const fileObj = await readFileInput(fileInput);
    const id = 'VIO-' + (2000 + db.violations.length + 1);
    const attachments = [];
    if (fileObj) { attachments.push({ name: fileObj.name, size: fileObj.size, fileKey: storeFile(fileObj) }); commit(['files']); }
    db.violations.push({ ...rec, id, status: 'Open', attachments, history: [{ at: new Date().toISOString(), by: user.name, note: 'Reported' }] });
    commit(['violations']);
    audit('CREATE', 'violation', id, rec.type + ' — ' + student(rec.studentId).name);
    notify('violation', 'New violation reported', `${id} · ${rec.type} · ${student(rec.studentId).name}.`);
    toast('Violation reported');
    setAdding(false);
  };

  const advance = (v, next, action, note) => {
    if (action !== undefined) v.action = action;
    if (next) {
      v.status = next;
      v.history.push({ at: new Date().toISOString(), by: user.name, note: 'Moved to ' + next + (note ? ' — ' + note : '') });
      audit('WORKFLOW', 'violation', v.id, 'Status → ' + next);
      if (next === 'Closed') notify('violation', 'Violation closed', v.id + ' has been closed.');
    } else if (note) {
      v.history.push({ at: new Date().toISOString(), by: user.name, note });
      audit('UPDATE', 'violation', v.id, 'Note added');
    }
    commit(['violations']);
    toast('Violation updated');
    setViewing(null);
  };

  return (
    <>
      <PageHead title="Student violations" actions={
        <>
          <Can page="violations" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <PrintButton />
          <Can page="violations" action="add"><button className="btn primary" onClick={() => setAdding(true)}>＋ Report violation</button></Can>
        </>
      }>
        Workflow: Open → Investigation → Decision → Closed.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Student, ID, location" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><Options values={masterList('violationType')} includeBlank /></select></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><Options values={FLOW} includeBlank /></select></div>
          <div>
            <label>Building</label>
            <select value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })}>
              <option value="">All</option>
              {db.buildings.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Case</th><th>Student</th><th>Type</th><th>Date / time</th><th>Location</th><th>Action</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td><a className="rowlink" onClick={() => setViewing(v.id)}>{v.id}</a></td>
                    <td><StudentLink id={v.studentId} /></td>
                    <td>{v.type}</td>
                    <td>{fmtD(v.date)} {v.time}</td>
                    <td style={{ fontSize: '.83rem' }}>{v.location}</td>
                    <td style={{ fontSize: '.83rem' }}>{v.action || '—'}</td>
                    <td><Tag>{v.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No violations match.</Empty>}
        </div>
      </div>

      {adding ? <ViolationForm students={activeStudents()} types={masterList('violationType')} actions={masterList('disciplinaryAction')}
        staff={user.name} onClose={() => setAdding(false)} onSave={saveNew} /> : null}

      {viewing ? <ViolationView v={db.violations.find((x) => x.id === viewing)} student={student} files={db.files}
        actions={masterList('disciplinaryAction')} canUpdate={can('violations', 'update')}
        onClose={() => setViewing(null)} onAdvance={advance} /> : null}
    </>
  );
}

function ViolationForm({ students, types, actions, staff, onClose, onSave }) {
  const fileRef = useRef(null);
  const [f, setF] = useState({
    studentId: students[0]?.id || '', type: types[0] || '', date: todayStr(), time: nowTime(),
    location: '', description: '', staff, action: ''
  });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal title="Report violation" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ ...f, location: f.location.trim(), description: f.description.trim(), staff: f.staff.trim() }, fileRef.current)}>Report</button></>}>
      <div className="frow">
        <div><label>Student</label><select value={f.studentId} onChange={set('studentId')}><StudentOptions students={students} /></select></div>
        <div><label>Violation type</label><select value={f.type} onChange={set('type')}><Options values={types} /></select></div>
      </div>
      <div className="frow">
        <div><label>Date</label><input type="date" value={f.date} onChange={set('date')} /></div>
        <div><label>Time</label><input type="time" value={f.time} onChange={set('time')} /></div>
      </div>
      <div><label>Location</label><input value={f.location} onChange={set('location')} placeholder="Building · floor · room" /></div>
      <div><label>Description</label><textarea rows="3" value={f.description} onChange={set('description')} /></div>
      <div className="frow">
        <div><label>Reporting staff member</label><input value={f.staff} onChange={set('staff')} /></div>
        <div><label>Disciplinary action</label><select value={f.action} onChange={set('action')}><option value="">— pending —</option><Options values={actions} /></select></div>
      </div>
      <div><label>Attachment (photo or PDF)</label><input type="file" ref={fileRef} accept="image/*,.pdf" /></div>
    </Modal>
  );
}

function ViolationView({ v, student, files, actions, canUpdate, onClose, onAdvance }) {
  const s = student(v.studentId);
  const next = FLOW[FLOW.indexOf(v.status) + 1];
  const [action, setAction] = useState(v.action || '');
  const [note, setNote] = useState('');
  const label = { fontSize: '.72rem', fontWeight: 700, color: 'var(--ink-soft)' };

  return (
    <Modal title={'Violation ' + v.id} wide onClose={onClose}
      footer={<>
        {canUpdate && next ? <button className="btn primary" onClick={() => onAdvance(v, next, action, note.trim())}>Move to {next} →</button> : null}
        {canUpdate ? <button className="btn" onClick={() => onAdvance(v, '', action, note.trim())}>Save note</button> : null}
        <button className="btn" onClick={onClose}>Close</button>
      </>}>
      <div className="meta-grid">
        <div><div className="l">Student</div>{s.name} ({s.id})</div>
        <div><div className="l">Type</div>{v.type}</div>
        <div><div className="l">Date / time</div>{fmtD(v.date)} {v.time}</div>
        <div><div className="l">Location</div>{v.location}</div>
        <div><div className="l">Reported by</div>{v.staff}</div>
        <div><div className="l">Status</div><Tag>{v.status}</Tag></div>
      </div>
      <div><div style={label}>DESCRIPTION</div>{v.description}</div>
      {v.attachments?.length ? (
        <div>
          <div style={label}>ATTACHMENTS</div>
          {v.attachments.map((a, i) => (
            <div key={i}>
              {a.fileKey && files[a.fileKey]
                ? <a className="rowlink" onClick={() => downloadDataUrl(files[a.fileKey].data, a.name)}>📎 {a.name}</a>
                : <>📎 {a.name}</>} ({fmtSize(a.size)})
            </div>
          ))}
        </div>
      ) : null}
      {canUpdate ? (
        <div className="frow">
          <div><label>Disciplinary action</label><select value={action} onChange={(e) => setAction(e.target.value)}><option value="">— pending —</option><Options values={actions} /></select></div>
          <div><label>Add note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Investigation / decision note" /></div>
        </div>
      ) : null}
      <div>
        <div style={label}>CASE HISTORY</div>
        <ul className="timeline">
          {v.history.map((h, i) => <li key={i}><div className="t">{fmtDT(h.at)} · {h.by}</div>{h.note}</li>)}
        </ul>
      </div>
    </Modal>
  );
}

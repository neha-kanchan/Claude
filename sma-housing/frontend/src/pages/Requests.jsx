import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { exportCSV, fmtDT } from '../lib/utils.js';
import { Can, Empty, Modal, Options, PageHead, StudentLink, StudentOptions, Tag } from '../components/ui.jsx';

const STATUSES = ['Submitted', 'Under Review', 'Approved', 'Completed', 'Rejected'];

export default function Requests() {
  const { db, user, can, commit, audit, notify, toast } = useStore();
  const { student, masterList, activeStudents } = useLookups();
  const [f, setF] = useState({ q: '', type: '', status: '' });
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const rows = db.requests.filter((r) => {
    const q = f.q.toLowerCase();
    const s = student(r.studentId);
    return (!q || s.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
      && (!f.type || r.type === f.type) && (!f.status || r.status === f.status);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const doExport = () => {
    exportCSV('requests.csv', db.requests.map((r) => ({
      id: r.id, student_id: r.studentId, student: student(r.studentId).name, type: r.type,
      details: r.details, status: r.status, submitted: r.createdAt, decided: r.decidedAt || ''
    })));
    audit('EXPORT', 'report', 'requests.csv', 'CSV export');
    toast('Exported requests.csv');
  };

  const act = (r, status, note) => {
    r.status = status;
    if (['Approved', 'Rejected'].includes(status)) r.decidedAt = new Date().toISOString();
    r.history.push({ at: new Date().toISOString(), by: user.name, note: status + (note ? ' — ' + note : '') });
    commit(['requests']);
    audit('WORKFLOW', 'request', r.id, 'Status → ' + status);
    if (status === 'Approved') notify('request', 'Request approved', `${r.id} (${r.type}) was approved.`);
    if (status === 'Rejected') notify('request', 'Request rejected', `${r.id} (${r.type}) was rejected.`);
    toast('Request ' + status.toLowerCase());
    setViewing(null);
  };

  return (
    <>
      <PageHead title="Student requests" actions={
        <>
          <Can page="requests" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <Can page="requests" action="add"><button className="btn primary" onClick={() => setAdding(true)}>＋ New request</button></Can>
        </>
      }>
        Workflow: Submitted → Under Review → Approved → Completed, or Rejected.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Student or ID" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><Options values={masterList('requestType')} includeBlank /></select></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><Options values={STATUSES} includeBlank /></select></div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Request</th><th>Student</th><th>Type</th><th>Submitted</th><th>Decided</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><a className="rowlink" onClick={() => setViewing(r.id)}>{r.id}</a></td>
                    <td><StudentLink id={r.studentId} /></td>
                    <td>{r.type}</td>
                    <td>{fmtDT(r.createdAt)}</td>
                    <td>{r.decidedAt ? fmtDT(r.decidedAt) : '—'}</td>
                    <td><Tag>{r.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No requests match.</Empty>}
        </div>
      </div>

      {adding ? <RequestForm students={activeStudents()} types={masterList('requestType')} onClose={() => setAdding(false)}
        onSave={(rec) => {
          const id = 'REQ-' + (4000 + db.requests.length + 1);
          db.requests.push({ ...rec, id, status: 'Submitted', createdAt: new Date().toISOString(), decidedAt: null,
            history: [{ at: new Date().toISOString(), by: user.name, note: 'Submitted' }] });
          commit(['requests']);
          audit('CREATE', 'request', id, rec.type);
          toast('Request submitted');
          setAdding(false);
        }} /> : null}

      {viewing ? <RequestView r={db.requests.find((x) => x.id === viewing)} student={student}
        canApprove={can('requests', 'approve')} canReject={can('requests', 'reject')}
        onClose={() => setViewing(null)} onAct={act} /> : null}
    </>
  );
}

function RequestForm({ students, types, onClose, onSave }) {
  const [f, setF] = useState({ studentId: students[0]?.id || '', type: types[0] || '', details: '' });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Modal title="New student request" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ ...f, details: f.details.trim() })}>Submit</button></>}>
      <div className="frow">
        <div><label>Student</label><select value={f.studentId} onChange={set('studentId')}><StudentOptions students={students} /></select></div>
        <div><label>Request type</label><select value={f.type} onChange={set('type')}><Options values={types} /></select></div>
      </div>
      <div><label>Details</label><textarea rows="3" value={f.details} onChange={set('details')} placeholder="What is being requested and why" /></div>
    </Modal>
  );
}

function RequestView({ r, student, canApprove, canReject, onClose, onAct }) {
  const s = student(r.studentId);
  const [note, setNote] = useState('');
  const label = { fontSize: '.72rem', fontWeight: 700, color: 'var(--ink-soft)' };

  const actions = [];
  if (r.status === 'Submitted' && canApprove) actions.push(<button key="rev" className="btn primary" onClick={() => onAct(r, 'Under Review', note.trim())}>Start review</button>);
  if (r.status === 'Under Review') {
    if (canApprove) actions.push(<button key="app" className="btn primary" onClick={() => onAct(r, 'Approved', note.trim())}>Approve ✓</button>);
    if (canReject) actions.push(<button key="rej" className="btn danger" onClick={() => onAct(r, 'Rejected', note.trim())}>Reject ✕</button>);
  }
  if (r.status === 'Approved' && canApprove) actions.push(<button key="done" className="btn primary" onClick={() => onAct(r, 'Completed', note.trim())}>Mark completed</button>);

  return (
    <Modal title={'Request ' + r.id} wide onClose={onClose}
      footer={<>{actions}<button className="btn" onClick={onClose}>Close</button></>}>
      <div className="meta-grid">
        <div><div className="l">Student</div>{s.name} ({s.id})</div>
        <div><div className="l">Type</div>{r.type}</div>
        <div><div className="l">Status</div><Tag>{r.status}</Tag></div>
        <div><div className="l">Submitted</div>{fmtDT(r.createdAt)}</div>
      </div>
      <div><div style={label}>DETAILS</div>{r.details}</div>
      {canApprove ? <div><label>Decision note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the record" /></div> : null}
      <div>
        <div style={label}>HISTORY</div>
        <ul className="timeline">{r.history.map((h, i) => <li key={i}><div className="t">{fmtDT(h.at)} · {h.by}</div>{h.note}</li>)}</ul>
      </div>
    </Modal>
  );
}

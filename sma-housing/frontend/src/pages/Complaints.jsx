import { useRef, useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { downloadDataUrl, exportCSV, fmtDT, fmtSize, hoursBetween, readFileInput } from '../lib/utils.js';
import { Can, Empty, Modal, Options, PageHead, PrintButton, StudentLink, StudentOptions, Tag } from '../components/ui.jsx';

const FLOW = ['Submitted', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

export default function Complaints() {
  const { db, user, can, commit, audit, notify, toast } = useStore();
  const { student, masterList, activeStudents, storeFile } = useLookups();
  const [f, setF] = useState({ q: '', category: '', status: '' });
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const list = db.complaints;
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const stats = {
    avgResp: avg(list.filter((c) => c.respondedAt).map((c) => hoursBetween(c.createdAt, c.respondedAt))),
    avgReso: avg(list.filter((c) => c.resolvedAt).map((c) => hoursBetween(c.createdAt, c.resolvedAt))),
    open: list.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length,
    closed: list.filter((c) => ['Resolved', 'Closed'].includes(c.status)).length
  };

  const rows = list.filter((c) => {
    const q = f.q.toLowerCase();
    const stu = student(c.studentId);
    return (!q || c.title.toLowerCase().includes(q) || stu.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      && (!f.category || c.category === f.category) && (!f.status || c.status === f.status);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const doExport = () => {
    exportCSV('complaints.csv', list.map((c) => ({
      id: c.id, student_id: c.studentId, student: student(c.studentId).name, college: student(c.studentId).college,
      category: c.category, sub: c.sub, title: c.title, priority: c.priority, status: c.status, created: c.createdAt,
      response_h: c.respondedAt ? hoursBetween(c.createdAt, c.respondedAt) : '',
      resolution_h: c.resolvedAt ? hoursBetween(c.createdAt, c.resolvedAt) : ''
    })));
    audit('EXPORT', 'report', 'complaints.csv', 'CSV export');
    toast('Exported complaints.csv');
  };

  const saveNew = async (rec, fileInput) => {
    const fileObj = await readFileInput(fileInput);
    const id = 'CMP-' + (3000 + db.complaints.length + 1);
    const attachments = [];
    if (fileObj) { attachments.push({ name: fileObj.name, size: fileObj.size, fileKey: storeFile(fileObj) }); commit(['files']); }
    db.complaints.push({
      ...rec, id, status: 'Submitted', assignee: '', createdAt: new Date().toISOString(),
      respondedAt: null, resolvedAt: null, attachments, comments: []
    });
    commit(['complaints']);
    audit('CREATE', 'complaint', id, rec.category);
    notify('complaint', 'New complaint submitted', id + ' · ' + rec.category + '.');
    toast('Complaint logged');
    setAdding(false);
  };

  const update = (c, nextStatus, assignee, comment) => {
    const now = new Date().toISOString();
    if (nextStatus && nextStatus !== c.status) {
      if (c.status === 'Submitted' && !c.respondedAt) c.respondedAt = now;
      if (nextStatus === 'Resolved' && !c.resolvedAt) c.resolvedAt = now;
      c.comments.push({ at: now, by: user.name, text: 'Status: ' + c.status + ' → ' + nextStatus });
      c.status = nextStatus;
      audit('WORKFLOW', 'complaint', c.id, 'Status → ' + nextStatus);
      notify('complaint', 'Complaint update', c.id + ' is now ' + nextStatus + '.');
    }
    if (assignee !== undefined && assignee !== c.assignee) { c.assignee = assignee; if (!c.respondedAt) c.respondedAt = now; }
    if (comment) {
      c.comments.push({ at: now, by: user.name, text: comment });
      if (!c.respondedAt) c.respondedAt = now;
      audit('COMMENT', 'complaint', c.id, comment);
    }
    commit(['complaints']);
    toast('Complaint updated');
    setViewing(null);
  };

  return (
    <>
      <PageHead title="Complaints & maintenance" actions={
        <>
          <Can page="complaints" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <PrintButton />
          <Can page="complaints" action="add"><button className="btn primary" onClick={() => setAdding(true)}>＋ Log complaint</button></Can>
        </>
      }>
        Workflow: Submitted → Assigned → In Progress → Resolved → Closed. Response and resolution times are tracked automatically.
      </PageHead>

      <div className="grid kpis" style={{ marginBottom: '1rem' }}>
        <div className="kpi blue"><div className="v">{stats.avgResp ?? '—'}<span style={{ fontSize: '.9rem' }}>h</span></div><div className="l">Avg response time</div></div>
        <div className="kpi"><div className="v">{stats.avgReso ?? '—'}<span style={{ fontSize: '.9rem' }}>h</span></div><div className="l">Avg resolution time</div></div>
        <div className="kpi amber"><div className="v">{stats.open}</div><div className="l">Open complaints</div></div>
        <div className="kpi"><div className="v">{stats.closed}</div><div className="l">Resolved / closed</div></div>
      </div>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Title, student, ID" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><Options values={masterList('complaintCategory')} includeBlank /></select></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><Options values={FLOW} includeBlank /></select></div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Case</th><th>Title</th><th>Student</th><th>Category</th><th>Priority</th><th>Assignee</th><th>Response</th><th>Resolution</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><a className="rowlink" onClick={() => setViewing(c.id)}>{c.id}</a></td>
                    <td>{c.title}</td>
                    <td><StudentLink id={c.studentId} /></td>
                    <td>{c.category}{c.sub ? ' · ' + c.sub : ''}</td>
                    <td><Tag>{c.priority}</Tag></td>
                    <td style={{ fontSize: '.82rem' }}>{c.assignee || '—'}</td>
                    <td>{c.respondedAt ? hoursBetween(c.createdAt, c.respondedAt) + 'h' : '—'}</td>
                    <td>{c.resolvedAt ? hoursBetween(c.createdAt, c.resolvedAt) + 'h' : '—'}</td>
                    <td><Tag>{c.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No complaints match.</Empty>}
        </div>
      </div>

      {adding ? <ComplaintForm students={activeStudents()} categories={masterList('complaintCategory')} subs={masterList('maintenanceSub')}
        onClose={() => setAdding(false)} onSave={saveNew} /> : null}

      {viewing ? <ComplaintView c={db.complaints.find((x) => x.id === viewing)} student={student} files={db.files}
        canUpdate={can('complaints', 'update')} canComment={can('complaints', 'comment')}
        onClose={() => setViewing(null)} onSave={update} /> : null}
    </>
  );
}

function ComplaintForm({ students, categories, subs, onClose, onSave }) {
  const fileRef = useRef(null);
  const [f, setF] = useState({
    studentId: students[0]?.id || '', category: categories[0] || '', sub: subs[0] || '',
    title: '', description: '', priority: 'Medium'
  });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal title="Log complaint" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({
          studentId: f.studentId, category: f.category, sub: f.category === 'Maintenance' ? f.sub : '',
          title: f.title.trim() || '(untitled)', description: f.description.trim(), priority: f.priority
        }, fileRef.current)}>Submit</button></>}>
      <div className="frow">
        <div><label>Student</label><select value={f.studentId} onChange={set('studentId')}><StudentOptions students={students} /></select></div>
        <div><label>Category</label><select value={f.category} onChange={set('category')}><Options values={categories} /></select></div>
      </div>
      {f.category === 'Maintenance' ? (
        <div><label>Maintenance type</label><select value={f.sub} onChange={set('sub')}><Options values={subs} /></select></div>
      ) : null}
      <div><label>Title</label><input value={f.title} onChange={set('title')} /></div>
      <div><label>Description</label><textarea rows="3" value={f.description} onChange={set('description')} /></div>
      <div className="frow">
        <div><label>Priority</label><select value={f.priority} onChange={set('priority')}><option>Low</option><option>Medium</option><option>High</option></select></div>
        <div><label>Attachment (image or file)</label><input type="file" ref={fileRef} accept="image/*,.pdf" /></div>
      </div>
    </Modal>
  );
}

function ComplaintView({ c, student, files, canUpdate, canComment, onClose, onSave }) {
  const s = student(c.studentId);
  const [status, setStatus] = useState(c.status);
  const [assignee, setAssignee] = useState(c.assignee || '');
  const [comment, setComment] = useState('');
  const label = { fontSize: '.72rem', fontWeight: 700, color: 'var(--ink-soft)' };

  return (
    <Modal title={'Complaint ' + c.id} wide onClose={onClose}
      footer={<>
        {canUpdate || canComment ? <button className="btn primary" onClick={() => onSave(c, canUpdate ? status : null, canUpdate ? assignee.trim() : undefined, comment.trim())}>Save update</button> : null}
        <button className="btn" onClick={onClose}>Close</button>
      </>}>
      <div className="meta-grid">
        <div><div className="l">Student</div>{s.name} ({s.id})</div>
        <div><div className="l">Category</div>{c.category}{c.sub ? ' · ' + c.sub : ''}</div>
        <div><div className="l">Priority</div><Tag>{c.priority}</Tag></div>
        <div><div className="l">Status</div><Tag>{c.status}</Tag></div>
        <div><div className="l">Submitted</div>{fmtDT(c.createdAt)}</div>
        <div><div className="l">Response time</div>{c.respondedAt ? hoursBetween(c.createdAt, c.respondedAt) + ' h' : 'awaiting first response'}</div>
        <div><div className="l">Resolution time</div>{c.resolvedAt ? hoursBetween(c.createdAt, c.resolvedAt) + ' h' : '—'}</div>
        <div><div className="l">Assignee</div>{c.assignee || '—'}</div>
      </div>
      <div><strong>{c.title}</strong><br /><span style={{ fontSize: '.9rem' }}>{c.description}</span></div>
      {c.attachments?.length ? (
        <div>
          {c.attachments.map((a, i) => (
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
          <div><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value)}><Options values={FLOW} /></select></div>
          <div><label>Assignee</label><input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Team or person" /></div>
        </div>
      ) : null}
      {canComment ? <div><label>Add comment</label><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Update for the record" /></div> : null}
      <div>
        <div style={label}>COMMENTS & UPDATES</div>
        <ul className="timeline">
          {c.comments.length
            ? c.comments.map((h, i) => <li key={i}><div className="t">{fmtDT(h.at)} · {h.by}</div>{h.text}</li>)
            : <li><div className="t">No comments yet</div></li>}
        </ul>
      </div>
    </Modal>
  );
}

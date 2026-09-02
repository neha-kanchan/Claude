import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store.jsx';
import { fmtD, fmtDT, todayStr } from '../lib/utils.js';
import { Can, Empty, PageHead, StudentAvatar, Tag } from '../components/ui.jsx';
import StudentForm from '../components/StudentForm.jsx';
import AllocateForm from '../components/AllocateForm.jsx';
import DocumentForm from '../components/DocumentForm.jsx';

export default function StudentDetail() {
  const { id } = useParams();
  const { db, commit, audit, toast } = useStore();
  const { student, bldg, latestActivity } = useLookups();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const s = student(id);
  const allocs = db.allocations.filter((a) => a.studentId === id).sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  const atts = db.attendance.filter((a) => a.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const movs = db.movements.filter((m) => m.studentId === id).sort((a, b) => b.at.localeCompare(a.at));
  const vios = db.violations.filter((v) => v.studentId === id);
  const cmps = db.complaints.filter((c) => c.studentId === id);
  const reqs = db.requests.filter((r) => r.studentId === id);
  const docs = db.documents.filter((d) => d.studentId === id);
  const isOverdue = (m) => m.type === 'Exit' && !m.returnedAt && m.expectedReturn && m.expectedReturn < new Date().toISOString();

  const toggleActive = () => {
    s.status = s.status === 'Active' ? 'Inactive' : 'Active';
    if (s.status === 'Inactive' && s.room) {
      const a = db.allocations.find((x) => x.studentId === id && !x.to);
      if (a) { a.to = todayStr(); a.note = (a.note ? a.note + ' · ' : '') + 'Deactivated'; }
      s.room = null; s.building = null;
      commit(['allocations']);
    }
    commit(['students']);
    audit('UPDATE', 'student', id, 'Status set to ' + s.status);
    toast('Student is now ' + s.status);
  };

  return (
    <>
      <PageHead title="Student record" actions={
        <>
          <button className="btn" onClick={() => navigate('/students')}>← All students</button>
          <button className="btn" onClick={() => window.print()}>🖨️ Print / PDF</button>
          <Can page="students" action="edit"><button className="btn" onClick={() => setEditing(true)}>Edit profile</button></Can>
          <Can page="students" action="allocate"><button className="btn" onClick={() => setAllocating(true)}>Change room</button></Can>
          <Can page="students" action="deactivate">
            <button className={'btn ' + (s.status === 'Active' ? 'danger' : 'primary')} onClick={toggleActive}>
              {s.status === 'Active' ? 'Deactivate' : 'Reactivate'}
            </button>
          </Can>
        </>
      } />

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="detail-hero">
          <StudentAvatar student={s} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: '1.2rem' }}>{s.name} <Tag>{s.status}</Tag></h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: '.87rem' }} className="mono">{s.id}</div>
          </div>
          <div className="meta-grid" style={{ flex: 2, minWidth: 280 }}>
            <div><div className="l">Email</div>{s.email || '—'}</div>
            <div><div className="l">Phone</div>{s.phone || '—'}</div>
            <div><div className="l">College / Major</div>{s.college || '—'}</div>
            <div><div className="l">Building · Room</div>{s.room ? `${bldg(s.building).name} · ${s.room}` : 'Unassigned'}</div>
            <div><div className="l">Resident since</div>{fmtD(s.joined)}</div>
            <div><div className="l">Emergency contact</div>{s.emergency || '—'}</div>
            <div><div className="l">Latest activity</div>{latestActivity(s.id)}</div>
          </div>
        </div>
      </div>

      <div className="grid two-col">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card">
            <h2>Room allocation history</h2>
            {allocs.length ? (
              <table>
                <thead><tr><th>Room</th><th>From</th><th>To</th><th>Note</th></tr></thead>
                <tbody>
                  {allocs.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.roomId}</td><td>{fmtD(a.from)}</td>
                      <td>{a.to ? fmtD(a.to) : <Tag>Active</Tag>}</td>
                      <td style={{ fontSize: '.82rem' }}>{a.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No allocations yet.</Empty>}
          </div>

          <div className="card">
            <h2>Movement history (entry / exit)</h2>
            {movs.length ? (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Time</th><th>Expected return</th><th>Returned</th><th>Purpose</th></tr></thead>
                  <tbody>
                    {movs.slice(0, 10).map((m) => (
                      <tr key={m.id}>
                        <td>{m.type === 'Exit' ? '🚪 Exit' : '✅ Entry'}</td>
                        <td>{fmtDT(m.at)}</td>
                        <td>{m.expectedReturn ? fmtDT(m.expectedReturn) : '—'}</td>
                        <td>{m.returnedAt ? <>{fmtDT(m.returnedAt)} {m.late ? <Tag>Late</Tag> : null}</> : (m.type === 'Exit' ? <Tag>{isOverdue(m) ? 'Overdue' : 'Out'}</Tag> : '—')}</td>
                        <td style={{ fontSize: '.82rem' }}>{m.purpose || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No movements logged.</Empty>}
          </div>

          <div className="card">
            <h2>Attendance history</h2>
            {atts.length ? (
              <table>
                <thead><tr><th>Date</th><th>Status</th><th>Note</th><th>Recorded by</th></tr></thead>
                <tbody>
                  {atts.slice(0, 14).map((a) => (
                    <tr key={a.id}>
                      <td>{fmtD(a.date)}</td><td><Tag>{a.status}</Tag></td>
                      <td style={{ fontSize: '.82rem' }}>{a.note || ''}</td>
                      <td style={{ fontSize: '.82rem' }}>{a.by || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No attendance records.</Empty>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <div className="card">
            <h2>Violations ({vios.length})</h2>
            {vios.length ? vios.map((v) => (
              <div key={v.id} style={{ padding: '.5rem 0', borderBottom: '1px solid #EFEEE7', fontSize: '.87rem' }}>
                <Link className="rowlink" to="/violations">{v.id}</Link> · {v.type} <Tag>{v.status}</Tag>
                <div style={{ color: 'var(--ink-soft)', fontSize: '.78rem' }}>{fmtD(v.date)} {v.time} · {v.location}</div>
              </div>
            )) : <Empty>No violations.</Empty>}
          </div>
          <div className="card">
            <h2>Complaints ({cmps.length})</h2>
            {cmps.length ? cmps.map((c) => (
              <div key={c.id} style={{ padding: '.5rem 0', borderBottom: '1px solid #EFEEE7', fontSize: '.87rem' }}>
                <Link className="rowlink" to="/complaints">{c.id}</Link> · {c.title} <Tag>{c.status}</Tag>
              </div>
            )) : <Empty>No complaints.</Empty>}
          </div>
          <div className="card">
            <h2>Requests ({reqs.length})</h2>
            {reqs.length ? reqs.map((r) => (
              <div key={r.id} style={{ padding: '.5rem 0', borderBottom: '1px solid #EFEEE7', fontSize: '.87rem' }}>
                <Link className="rowlink" to="/requests">{r.id}</Link> · {r.type} <Tag>{r.status}</Tag>
              </div>
            )) : <Empty>No requests.</Empty>}
          </div>
          <div className="card">
            <h2>Documents ({docs.length})</h2>
            {docs.length ? docs.map((d) => (
              <div key={d.id} style={{ padding: '.5rem 0', borderBottom: '1px solid #EFEEE7', fontSize: '.87rem' }}>
                📄 {d.name}
                <div style={{ color: 'var(--ink-soft)', fontSize: '.78rem' }}>{d.type} · {fmtDT(d.uploadedAt)} · {d.by}</div>
              </div>
            )) : <Empty>No documents on file.</Empty>}
            <Can page="documents" action="upload">
              <button className="btn small" style={{ marginTop: '.6rem' }} onClick={() => setUploading(true)}>＋ Upload document</button>
            </Can>
          </div>
        </div>
      </div>

      {editing ? <StudentForm studentId={id} onClose={() => setEditing(false)} /> : null}
      {allocating ? <AllocateForm studentId={id} onClose={() => setAllocating(false)} /> : null}
      {uploading ? <DocumentForm studentId={id} onClose={() => setUploading(false)} /> : null}
    </>
  );
}

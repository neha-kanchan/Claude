import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { fmtD, todayStr, uid } from '../lib/utils.js';
import { Can, Empty, Modal, PageHead, Tag } from '../components/ui.jsx';

const TYPES = [['college', 'Colleges / Majors'], ['violationType', 'Violation types'], ['complaintCategory', 'Complaint categories'],
  ['maintenanceSub', 'Maintenance types'], ['requestType', 'Request types'], ['attendanceStatus', 'Attendance statuses'],
  ['docType', 'Document types'], ['disciplinaryAction', 'Disciplinary actions']];

export default function Master() {
  const { db, commit, audit, toast } = useStore();
  const [tab, setTab] = useState('college');
  const [editing, setEditing] = useState(null);      // master id, or '' for a new value

  const rows = db.master.filter((m) => m.type === tab);

  const remove = (m) => {
    if (!window.confirm(`Remove "${m.value}" from ${m.type}? Existing records keep the value.`)) return;
    db.master = db.master.filter((x) => x.id !== m.id);
    commit(['master']);
    audit('DELETE', 'master', m.id, m.type + ': ' + m.value);
  };

  const save = (id, data) => {
    if (!data.value) return toast('Value is required');
    if (id) {
      Object.assign(db.master.find((x) => x.id === id), data);
      audit('UPDATE', 'master', id, data.type + ': ' + data.value);
    } else {
      const nid = uid('MD');
      db.master.push({ id: nid, ...data });
      audit('CREATE', 'master', nid, data.type + ': ' + data.value);
    }
    commit(['master']);
    toast('Master data saved');
    setEditing(null);
  };

  return (
    <>
      <PageHead title="Master data" actions={
        <Can page="master" action="add"><button className="btn primary" onClick={() => setEditing('')}>＋ Add value</button></Can>
      }>
        Values behind every drop-down. Each value carries a validity date range, so lists can change per semester without losing history.
      </PageHead>

      <div className="card">
        <div className="tabs">
          {TYPES.map(([t, l]) => (
            <button key={t} className={'tab' + (t === tab ? ' active' : '')} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Value</th><th>Valid from</th><th>Valid to</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.value}</strong></td>
                    <td>{fmtD(m.from)}</td>
                    <td>{m.to ? fmtD(m.to) : 'Open-ended'}</td>
                    <td><Tag>{m.active !== false ? 'Active' : 'Inactive'}</Tag></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Can page="master" action="edit"><button className="btn small" onClick={() => setEditing(m.id)}>Edit</button></Can>{' '}
                      <Can page="master" action="delete"><button className="btn small danger" onClick={() => remove(m)}>Remove</button></Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No values for this list yet.</Empty>}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Buildings & rooms</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Building</th><th>Floors</th><th>Rooms</th><th>Capacity</th><th>Occupied beds</th></tr></thead>
            <tbody>
              {db.buildings.map((b) => {
                const rs = db.rooms.filter((r) => r.buildingId === b.id);
                return (
                  <tr key={b.id}>
                    <td><strong>{b.name}</strong></td>
                    <td>{b.floors}</td>
                    <td>{rs.length}</td>
                    <td>{rs.reduce((a, r) => a + r.capacity, 0)}</td>
                    <td>{db.students.filter((s) => s.status === 'Active' && s.building === b.id).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null ? (
        <MasterForm value={editing ? db.master.find((x) => x.id === editing) : { type: tab, value: '', from: todayStr(), to: '', active: true }}
          isNew={!editing} onClose={() => setEditing(null)} onSave={(data) => save(editing, data)} />
      ) : null}
    </>
  );
}

function MasterForm({ value, isNew, onClose, onSave }) {
  const [f, setF] = useState({ type: value.type, value: value.value || '', from: value.from || '', to: value.to || '', active: value.active !== false });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Modal title={isNew ? 'Add master value' : 'Edit master value'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ ...f, value: f.value.trim() })}>Save</button></>}>
      <div className="frow">
        <div>
          <label>List</label>
          <select value={f.type} onChange={set('type')} disabled={!isNew}>
            {TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </select>
        </div>
        <div><label>Value</label><input value={f.value} onChange={set('value')} /></div>
      </div>
      <div className="frow">
        <div><label>Valid from</label><input type="date" value={f.from} onChange={set('from')} /></div>
        <div><label>Valid to (blank = open-ended)</label><input type="date" value={f.to} onChange={set('to')} /></div>
      </div>
      <div>
        <label>
          <input type="checkbox" checked={f.active} onChange={(e) => setF((v) => ({ ...v, active: e.target.checked }))} style={{ width: 'auto', marginRight: '.4rem' }} />
          Active
        </label>
      </div>
    </Modal>
  );
}

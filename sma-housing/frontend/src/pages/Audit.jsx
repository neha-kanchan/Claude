import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { exportCSV, fmtDT } from '../lib/utils.js';
import { Can, Empty, Options, PageHead } from '../components/ui.jsx';

export default function Audit() {
  const { db, toast } = useStore();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const actions = [...new Set(db.audit.map((a) => a.action))];
  const rows = db.audit.filter((a) => {
    const needle = q.toLowerCase();
    return (!needle || a.user.toLowerCase().includes(needle) || a.entity.toLowerCase().includes(needle)
      || String(a.entityId).toLowerCase().includes(needle) || a.details.toLowerCase().includes(needle))
      && (!action || a.action === action);
  }).slice(0, 300);

  const doExport = () => {
    exportCSV('audit-trail.csv', db.audit.map((a) => ({
      at: a.at, user: a.user, role: a.role, action: a.action, entity: a.entity, record: a.entityId, details: a.details
    })));
    toast('Exported audit-trail.csv');
  };

  return (
    <>
      <PageHead title="Audit trail" actions={
        <Can page="audit" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
      }>
        Every action: who performed it, when, and what changed. The server writes its own copy of this log; it is included in backups.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="User, entity, ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label>Action</label><select value={action} onChange={(e) => setAction(e.target.value)}><Options values={actions} includeBlank /></select></div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDT(a.at)}</td>
                    <td>{a.user}</td>
                    <td style={{ fontSize: '.8rem' }}>{a.role}</td>
                    <td><span className={'tag ' + (a.action === 'DELETE' ? 'brick' : a.action === 'CREATE' ? 'green' : 'blue')}>{a.action}</span></td>
                    <td>{a.entity}</td>
                    <td className="mono">{a.entityId}</td>
                    <td style={{ fontSize: '.83rem' }}>{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No audit entries match.</Empty>}
        </div>
      </div>
    </>
  );
}

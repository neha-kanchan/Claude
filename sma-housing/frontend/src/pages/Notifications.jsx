import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { fmtDT } from '../lib/utils.js';
import { Can, Empty, Modal, PageHead } from '../components/ui.jsx';

const ICON = { rollcall: '🗓️', violation: '⚠️', complaint: '🛠️', request: '✉️', room: '🚪', late: '⏰', leave: '🌙', maintenance: '🔧', announcement: '📢' };

export default function Notifications() {
  const { db, commit, audit, notify, toast } = useStore();
  const [announcing, setAnnouncing] = useState(false);

  // Opening the page marks everything read.
  useEffect(() => {
    if (db.notifications.some((n) => !n.read)) {
      db.notifications.forEach((n) => { n.read = true; });
      commit(['notifications']);
    }
  }, [db, commit]);

  return (
    <>
      <PageHead title="Notifications & announcements" actions={
        <Can page="notifications" action="announce"><button className="btn primary" onClick={() => setAnnouncing(true)}>📢 New announcement</button></Can>
      }>
        Automatic alerts for approvals, rejections, room changes, violations, complaint updates, leave expiries and roll call reminders.
        In production these are also delivered by email / SMS.
      </PageHead>

      <div className="card">
        {db.notifications.length ? db.notifications.map((n) => (
          <div className="notif" key={n.id}>
            <div className="ic" style={{ background: 'var(--leaf-soft)' }}>{ICON[n.type] || '🔔'}</div>
            <div>
              <strong>{n.title}</strong>
              <div>{n.body}</div>
              <div className="t">{fmtDT(n.at)}</div>
            </div>
          </div>
        )) : <Empty>No notifications.</Empty>}
      </div>

      {announcing ? <AnnounceForm onClose={() => setAnnouncing(false)} onSave={({ title, body }) => {
        notify('announcement', title || 'Announcement', body);
        audit('ANNOUNCE', 'notification', '—', title);
        toast('Announcement published');
        setAnnouncing(false);
      }} /> : null}
    </>
  );
}

function AnnounceForm({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <Modal title="New housing announcement" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ title: title.trim(), body: body.trim() })}>Publish</button></>}>
      <div><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Water outage — Building C" /></div>
      <div><label>Message</label><textarea rows="3" value={body} onChange={(e) => setBody(e.target.value)} /></div>
    </Modal>
  );
}

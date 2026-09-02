import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { fmtD, todayStr, uid } from '../lib/utils.js';
import { Can, Modal, PageHead } from '../components/ui.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPES = [['event', 'Event'], ['inspection', 'Inspection'], ['maintenance', 'Planned maintenance'], ['movein', 'Move-in / move-out'], ['rollcall', 'Roll call']];

export default function Calendar() {
  const { db, can, commit, audit, notify, toast } = useStore();
  const [cursor, setCursor] = useState(new Date());
  const [adding, setAdding] = useState(null);      // the date string being added to

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const nav = (n) => { const c = new Date(cursor); c.setMonth(c.getMonth() + n); setCursor(c); };

  const remove = (e) => {
    if (!window.confirm(`Remove "${e.title}"?`)) return;
    db.calendar = db.calendar.filter((x) => x.id !== e.id);
    commit(['calendar']);
    audit('DELETE', 'calendar', e.id, e.title);
  };

  return (
    <>
      <PageHead title="Housing calendar" actions={
        <Can page="calendar" action="add"><button className="btn primary" onClick={() => setAdding(todayStr())}>＋ Add event</button></Can>
      }>
        Move-in/move-out dates, inspections, events and planned maintenance.
      </PageHead>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '.9rem' }}>
          <button className="btn small" onClick={() => nav(-1)}>←</button>
          <h2 style={{ margin: 0 }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button className="btn small" onClick={() => nav(1)}>→</button>
          <button className="btn small" onClick={() => setCursor(new Date())}>Today</button>
        </div>
        <div className="cal">
          {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
          {days.map((d) => {
            const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            const evs = db.calendar.filter((e) => e.date === ds);
            return (
              <div key={ds} className={'day' + (d.getMonth() !== m ? ' other' : '') + (ds === todayStr() ? ' today' : '')}
                onClick={() => { if (can('calendar', 'add')) setAdding(ds); }}>
                <div className="n">{d.getDate()}</div>
                {evs.map((e) => (
                  <div key={e.id} className={'ev ' + (e.type === 'maintenance' ? 'amber' : e.type === 'inspection' ? 'blue' : '')}
                    title={e.title}
                    onClick={(ev) => { ev.stopPropagation(); if (can('calendar', 'delete')) remove(e); }}>
                    {e.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {adding ? <CalendarForm date={adding} onClose={() => setAdding(null)} onSave={(rec) => {
        const e = { id: uid('CAL'), ...rec };
        db.calendar.push(e);
        commit(['calendar']);
        audit('CREATE', 'calendar', e.id, e.title);
        notify('announcement', 'Calendar updated', e.title + ' on ' + fmtD(e.date) + '.');
        toast('Event added');
        setAdding(null);
      }} /> : null}
    </>
  );
}

function CalendarForm({ date, onClose, onSave }) {
  const [f, setF] = useState({ date, type: 'event', title: '' });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Modal title="Add calendar event" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ ...f, title: f.title.trim() || 'Event' })}>Add</button></>}>
      <div className="frow">
        <div><label>Date</label><input type="date" value={f.date} onChange={set('date')} /></div>
        <div>
          <label>Type</label>
          <select value={f.type} onChange={set('type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <div><label>Title</label><input value={f.title} onChange={set('title')} placeholder="e.g. Fire drill · Building A" /></div>
    </Modal>
  );
}

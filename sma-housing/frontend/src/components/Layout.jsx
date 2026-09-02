/* App shell: sidebar navigation, top bar with search, and the routed page. */

import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store.jsx';
import { initials } from '../lib/utils.js';
import { Modal } from './ui.jsx';

export default function Layout() {
  const { db, user, can, logout, pages, toastMsg } = useStore();
  const { student } = useLookups();
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState(null);
  const navigate = useNavigate();

  const visible = pages.filter((p) => can(p.id));
  const sections = [];
  visible.forEach((p) => {
    const last = sections[sections.length - 1];
    if (!last || last.name !== p.sec) sections.push({ name: p.sec, items: [p] });
    else last.items.push(p);
  });

  const badgeFor = (id) => {
    if (id === 'requests') return db.requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status)).length;
    if (id === 'complaints') return db.complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length;
    return 0;
  };

  const search = (q) => {
    q = q.trim().toLowerCase();
    if (q.length < 2) return;
    const found = [];
    db.students.forEach((s) => {
      if (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.room || '').toLowerCase().includes(q)) {
        found.push({ t: 'Student', l: `${s.name} (${s.id})`, to: '/students/' + s.id });
      }
    });
    db.violations.forEach((v) => { if (v.id.toLowerCase().includes(q)) found.push({ t: 'Violation', l: `${v.id} · ${v.type}`, to: '/violations' }); });
    db.complaints.forEach((c) => { if (c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) found.push({ t: 'Complaint', l: `${c.id} · ${c.title}`, to: '/complaints' }); });
    db.requests.forEach((r) => { if (r.id.toLowerCase().includes(q)) found.push({ t: 'Request', l: `${r.id} · ${r.type}`, to: '/requests' }); });
    if (found.length) setHits({ q, found: found.slice(0, 15) });
  };

  const unread = db.notifications.some((n) => !n.read);

  return (
    <div id="app" className="on">
      <aside id="sidebar" className={open ? 'open' : ''}>
        <div className="brand-mark"><span className="dot">⚓</span> SMA Housing System</div>
        <nav id="nav">
          {sections.map((sec) => (
            <div key={sec.name}>
              <div className="nav-sec">{sec.name}</div>
              {sec.items.map((p) => (
                <NavLink key={p.id} to={p.path} end={p.path === '/'}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                  onClick={() => setOpen(false)}>
                  {p.icon} {p.label} {badgeFor(p.id) ? <span className="badge">{badgeFor(p.id)}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main>
        <div className="topbar">
          <button className="menu-toggle" onClick={() => setOpen((v) => !v)}>☰</button>
          <div className="search">
            <span className="ic">🔎</span>
            <input placeholder="Search students, rooms, cases… (ID, name, building)"
              onKeyDown={(e) => { if (e.key === 'Enter') search(e.currentTarget.value); }}
              onBlur={(e) => { if (e.currentTarget.value.trim().length >= 2) search(e.currentTarget.value); }} />
          </div>
          <div className="top-right">
            <button className="icon-btn" title="Notifications" onClick={() => navigate('/notifications')}>
              🔔{unread ? <span className="dot" /> : null}
            </button>
            <div className="userchip">
              <div className="avatar">{initials(user?.name)}</div>
              <div><span>{user?.name}</span><small>{user?.role}</small></div>
            </div>
            <button className="btn small" onClick={logout}>Sign out</button>
          </div>
        </div>
        <div id="content"><Outlet /></div>
      </main>

      {hits ? (
        <Modal title={`Search results — “${hits.q}”`} onClose={() => setHits(null)}
          footer={<button className="btn" onClick={() => setHits(null)}>Close</button>}>
          {hits.found.map((h, i) => (
            <div key={i} style={{ padding: '.4rem 0', borderBottom: '1px solid #EFEEE7' }}>
              <span className="tag blue">{h.t}</span>{' '}
              <a className="rowlink" onClick={() => { setHits(null); navigate(h.to); }}>{h.l}</a>
            </div>
          ))}
        </Modal>
      ) : null}

      <div id="toast" style={{ display: toastMsg ? 'block' : 'none' }}>{toastMsg}</div>
    </div>
  );
}

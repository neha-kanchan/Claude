/* Small shared pieces: status tags, avatars, modals, page headers, tables. */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TAG_COLOR, initials } from '../lib/utils.js';
import { useStore, useLookups } from '../lib/store.jsx';

export function Tag({ children }) {
  return <span className={'tag ' + (TAG_COLOR[children] || 'grey')}>{children}</span>;
}

export function Avatar({ student, size, url }) {
  const photo = url !== undefined ? url : null;
  const cls = 'avatar' + (size ? ' ' + size : '') + (photo ? ' has-photo' : '');
  if (photo) return <span className={cls}><img src={photo} alt={(student?.name || 'Student') + ' photo'} /></span>;
  return <span className={cls}>{initials(student?.name) || '?'}</span>;
}

/* Avatar that resolves the student's photo from the file store itself. */
export function StudentAvatar({ student, size }) {
  const { photoUrl } = useLookups();
  return <Avatar student={student} size={size} url={photoUrl(student)} />;
}

export function StudentLink({ id }) {
  const { student } = useLookups();
  const s = student(id);
  return (
    <>
      <Link className="rowlink" to={'/students/' + id}>{s.name}</Link>
      <br />
      <span className="mono" style={{ color: 'var(--ink-soft)' }}>{id}</span>
    </>
  );
}

export function StudentCell({ id }) {
  const { student } = useLookups();
  return (
    <div className="cell-user">
      <StudentAvatar student={student(id)} size="sm" />
      <div><StudentLink id={id} /></div>
    </div>
  );
}

export function Modal({ title, onClose, footer, wide, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-back on" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <header><h2>{title}</h2><button className="x" onClick={onClose}>✕</button></header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function PageHead({ title, children, actions }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {actions ? <div className="actions">{actions}</div> : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Empty({ children }) { return <div className="empty">{children}</div>; }

export function PrintButton() {
  return <button className="btn" onClick={() => window.print()}>🖨️ Print</button>;
}

/* Renders its children only when the role holds the action. */
export function Can({ page, action, children }) {
  const { can } = useStore();
  return can(page, action) ? <>{children}</> : null;
}

export function Options({ values, includeBlank }) {
  return (
    <>
      {includeBlank ? <option value="">All</option> : null}
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </>
  );
}

export function StudentOptions({ students }) {
  return <>{students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}</>;
}

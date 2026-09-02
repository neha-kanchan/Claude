import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { uid } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { PAGES } from '../lib/pages.js';
import { Can, Modal, PageHead, Tag } from '../components/ui.jsx';

export default function Roles() {
  const { db, can, commit, audit, toast } = useStore();
  const [roleForm, setRoleForm] = useState(null);     // role id, or '' for a new role
  const [userForm, setUserForm] = useState(null);     // user id, or '' for a new user
  const [creds, setCreds] = useState(null);

  const saveRole = (id, { name, desc, perms }) => {
    if (!name) return toast('Role name required');
    if (id) {
      const r = db.roles.find((x) => x.id === id);
      r.desc = desc; r.perms = perms;
      audit('UPDATE', 'role', id, 'Permissions updated');
    } else {
      if (db.roles.some((x) => x.name === name)) return toast('Role name already exists');
      const nid = uid('ROLE');
      db.roles.push({ id: nid, name, desc, perms, system: false });
      audit('CREATE', 'role', nid, name);
    }
    commit(['roles']);
    toast('Role saved');
    setRoleForm(null);
  };

  const saveUser = (id, data) => {
    if (!data.name) return toast('Name required');
    if (id) { Object.assign(db.users.find((x) => x.id === id), data); audit('UPDATE', 'user', id, 'User updated'); }
    else { const nid = uid('USR'); db.users.push({ id: nid, ...data }); audit('CREATE', 'user', nid, data.name + ' → ' + data.role); }
    commit(['users']);
    toast('User saved');
    setUserForm(null);
  };

  const saveCreds = async (id, username, password) => {
    if (!password || password.length < 6) return toast('Password must be at least 6 characters');
    const r = await api('/users/' + id + '/password', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); return toast(d.error || 'Failed'); }
    const u = db.users.find((x) => x.id === id);
    if (u && username) { u.username = username; commit(['users']); }
    toast('Credentials updated');
    setCreds(null);
  };

  return (
    <>
      <PageHead title="Roles & users" actions={
        <Can page="roles" action="add">
          <button className="btn" onClick={() => setUserForm('')}>＋ Add user</button>
          <button className="btn primary" onClick={() => setRoleForm('')}>＋ Create role</button>
        </Can>
      }>
        Admins create roles and assign every page and every button to a role. Users inherit exactly what their role permits.
      </PageHead>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Roles</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Role</th><th>Description</th><th>Access</th><th>Users</th><th /></tr></thead>
            <tbody>
              {db.roles.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong>{r.system ? <> <span className="tag grey">system</span></> : null}</td>
                  <td style={{ fontSize: '.85rem' }}>{r.desc || ''}</td>
                  <td style={{ fontSize: '.82rem' }}>
                    {r.perms === 'ALL' ? <span className="tag green">All pages & actions</span> : Object.keys(r.perms || {}).length + ' pages'}
                  </td>
                  <td>{db.users.filter((u) => u.role === r.name).length}</td>
                  <td>{!r.system && can('roles', 'edit') ? <button className="btn small" onClick={() => setRoleForm(r.id)}>Edit permissions</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Users</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td style={{ fontSize: '.85rem' }}>{u.email}</td>
                  <td>{u.role}</td>
                  <td><Tag>{u.active ? 'Active' : 'Inactive'}</Tag></td>
                  <td>
                    <Can page="roles" action="edit"><button className="btn small" onClick={() => setUserForm(u.id)}>Edit</button></Can>{' '}
                    {can('roles', 'edit') ? <button className="btn small" onClick={() => setCreds(u.id)}>🔑 Credentials</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {roleForm !== null ? (
        <RoleForm role={roleForm ? db.roles.find((x) => x.id === roleForm) : { name: '', desc: '', perms: {} }}
          isNew={!roleForm} onClose={() => setRoleForm(null)} onSave={(data) => saveRole(roleForm, data)} />
      ) : null}

      {userForm !== null ? (
        <UserForm user={userForm ? db.users.find((x) => x.id === userForm) : { name: '', email: '', role: db.roles[1]?.name || 'Viewer', active: true }}
          roles={db.roles} onClose={() => setUserForm(null)} onSave={(data) => saveUser(userForm, data)} />
      ) : null}

      {creds ? (
        <CredentialsForm user={db.users.find((x) => x.id === creds)} onClose={() => setCreds(null)}
          onSave={(username, password) => saveCreds(creds, username, password)} />
      ) : null}
    </>
  );
}

function RoleForm({ role, isNew, onClose, onSave }) {
  const start = role.perms === 'ALL' ? {} : (role.perms || {});
  const [name, setName] = useState(role.name || '');
  const [desc, setDesc] = useState(role.desc || '');
  const [perms, setPerms] = useState(() => JSON.parse(JSON.stringify(start)));

  const toggleView = (pg) => setPerms((p) => {
    const next = { ...p, [pg]: { view: !p[pg]?.view, actions: { ...(p[pg]?.actions || {}) } } };
    return next;
  });
  const toggleAction = (pg, act) => setPerms((p) => {
    const page = { view: p[pg]?.view || false, actions: { ...(p[pg]?.actions || {}) } };
    page.actions[act] = !page.actions[act];
    if (page.actions[act]) page.view = true;               // granting a button implies the page
    return { ...p, [pg]: page };
  });

  const save = () => {
    const cleaned = {};
    Object.entries(perms).forEach(([pg, p]) => {
      const actions = Object.fromEntries(Object.entries(p.actions || {}).filter(([, on]) => on));
      if (p.view || Object.keys(actions).length) cleaned[pg] = { view: true, actions };
    });
    onSave({ name: name.trim(), desc: desc.trim(), perms: cleaned });
  };

  return (
    <Modal title={isNew ? 'Create role' : 'Edit role — ' + role.name} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save role</button></>}>
      <div className="frow">
        <div><label>Role name</label><input value={name} onChange={(e) => setName(e.target.value)} disabled={!isNew} /></div>
        <div><label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      </div>
      <div>
        <label>Page & button permissions</label>
        <div className="perm-grid">
          {PAGES.map((p) => (
            <div className="perm-row" key={p.id}>
              <span className="pg">{p.icon} {p.label}</span>
              <label><input type="checkbox" checked={Boolean(perms[p.id]?.view)} onChange={() => toggleView(p.id)} /> View page</label>
              {p.actions.map((a) => (
                <label key={a}>
                  <input type="checkbox" checked={Boolean(perms[p.id]?.actions?.[a])} onChange={() => toggleAction(p.id, a)} /> {a}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function UserForm({ user, roles, onClose, onSave }) {
  const [f, setF] = useState({ name: user.name, email: user.email, role: user.role, active: user.active ? '1' : '0' });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Modal title={user.id ? 'Edit user' : 'Add user'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ name: f.name.trim(), email: f.email.trim(), role: f.role, active: f.active === '1' })}>Save</button></>}>
      <div className="frow">
        <div><label>Name</label><input value={f.name} onChange={set('name')} /></div>
        <div><label>Email</label><input value={f.email} onChange={set('email')} /></div>
      </div>
      <div className="frow">
        <div><label>Role</label><select value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r.id}>{r.name}</option>)}</select></div>
        <div><label>Status</label><select value={f.active} onChange={set('active')}><option value="1">Active</option><option value="0">Inactive</option></select></div>
      </div>
    </Modal>
  );
}

function CredentialsForm({ user, onClose, onSave }) {
  const [username, setUsername] = useState(user.username || '');
  const [password, setPassword] = useState('');
  return (
    <Modal title={'Sign-in credentials — ' + user.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(username.trim(), password)}>Save credentials</button></>}>
      <div className="frow">
        <div><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={'e.g. ' + (user.email || 'user@x').split('@')[0]} /></div>
        <div><label>New password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" /></div>
      </div>
      <p style={{ fontSize: '.8rem', color: 'var(--ink-soft)' }}>Passwords are stored server-side as bcrypt hashes. Administrator only.</p>
    </Modal>
  );
}

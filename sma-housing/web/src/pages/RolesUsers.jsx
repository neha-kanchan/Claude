import { useMemo, useState } from 'react';
import { useCollection, useCreate, useUpdate } from '../api/queries';
import { request } from '../api/client';
import { DataTable } from '../components/DataTable';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tag, useToast } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { PAGES } from '../lib/perms';
import { uid } from '../lib/format';

export default function RolesUsers() {
  const toast = useToast();
  const { can, roles, isAdmin } = usePermissions();
  const { data: users = [], isLoading } = useCollection('users');
  const createUser = useCreate('users');
  const updateUser = useUpdate('users');
  const updateRole = useUpdate('roles');
  const createRole = useCreate('roles');

  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [credentialsFor, setCredentialsFor] = useState(null);

  const userColumns = useMemo(() => [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'username', header: 'Username', cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span> },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role', cell: (c) => <Tag tone="blue">{c.getValue()}</Tag> },
    {
      id: 'active', header: 'State',
      accessorFn: (u) => (u.active === false || u.active === 0 ? 'Inactive' : 'Active'),
      cell: ({ row }) => <Tag>{row.original.active === false || row.original.active === 0 ? 'Inactive' : 'Active'}</Tag>
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          {can('roles', 'edit') && <Button size="sm" onClick={() => setEditingUser(row.original)}>Edit</Button>}
          {isAdmin && <Button size="sm" onClick={() => setCredentialsFor(row.original)}>Credentials</Button>}
        </div>
      )
    }
  ], [can, isAdmin]);

  return (
    <>
      <PageHeader title="Roles & Users" subtitle={`${users.length} users across ${roles.length} roles`}>
        {can('roles', 'add') && <Button onClick={() => setEditingRole({})}>Add role</Button>}
        {can('roles', 'add') && <Button variant="primary" onClick={() => setEditingUser({})}>Add user</Button>}
      </PageHeader>

      <div className="grid gap-4">
        {isLoading ? <Empty>Loading…</Empty> : (
          <DataTable data={users} columns={userColumns} searchPlaceholder="Search users…" empty="No users." />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => {
            const grantedPages = role.perms === 'ALL'
              ? PAGES.length
              : Object.values(role.perms || {}).filter((p) => p?.view).length;
            return (
              <Card key={role.id} title={role.name}
                action={can('roles', 'edit') && role.perms !== 'ALL'
                  ? <Button size="sm" onClick={() => setEditingRole(role)}>Edit permissions</Button>
                  : role.perms === 'ALL' ? <Tag tone="green">Full access</Tag> : null}>
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{role.desc || 'No description.'}</p>
                <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {grantedPages} of {PAGES.length} pages · {users.filter((u) => u.role === role.name).length} users
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      {editingUser && (
        <UserForm user={editingUser} roles={roles} onClose={() => setEditingUser(null)}
          onSubmit={async (values) => {
            if (editingUser.id) await updateUser.mutateAsync({ id: editingUser.id, ...values });
            else await createUser.mutateAsync({ id: uid('USR'), ...values });
            toast('User saved');
            setEditingUser(null);
          }} />
      )}

      {editingRole && (
        <RoleForm role={editingRole} onClose={() => setEditingRole(null)}
          onSubmit={async (values) => {
            if (editingRole.id) await updateRole.mutateAsync({ id: editingRole.id, ...values });
            else await createRole.mutateAsync({ id: uid('ROLE'), system: 0, ...values });
            toast('Role saved');
            setEditingRole(null);
          }} />
      )}

      {credentialsFor && (
        <CredentialsForm user={credentialsFor} onClose={() => setCredentialsFor(null)}
          onDone={() => { toast('Credentials updated'); setCredentialsFor(null); }} />
      )}
    </>
  );
}

function UserForm({ user, roles, onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({
    name: user.name || '', email: user.email || '',
    role: user.role || roles[0]?.name || 'Viewer',
    username: user.username || '',
    active: user.active === false || user.active === 0 ? false : true
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.name.trim()) return toast('A name is required', 'error');
    setBusy(true);
    try { await onSubmit(values); }
    catch (err) { toast(err.message || 'Could not save', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title={user.id ? 'Edit user' : 'Add user'} onClose={onClose} width={480}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Full name"><Input value={values.name} onChange={set('name')} required /></Field>
        <Field label="Email"><Input type="email" value={values.email} onChange={set('email')} /></Field>
        <Field label="Username" hint="Used for local sign-in.">
          <Input value={values.username} onChange={set('username')} />
        </Field>
        <Field label="Role">
          <Select value={values.role} onChange={set('role')}>
            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.active}
            onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))} />
          Active — may sign in
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* Permission editing mirrors the server's shape exactly: a page grants view,
   and each action under it is a separate switch. */
function RoleForm({ role, onClose, onSubmit }) {
  const toast = useToast();
  const [name, setName] = useState(role.name || '');
  const [desc, setDesc] = useState(role.desc || '');
  const [perms, setPerms] = useState(() =>
    role.perms && role.perms !== 'ALL' ? JSON.parse(JSON.stringify(role.perms)) : {});
  const [busy, setBusy] = useState(false);

  const togglePage = (pageId) => setPerms((p) => {
    const next = { ...p };
    if (next[pageId]?.view) delete next[pageId];
    else next[pageId] = { view: true, actions: {} };
    return next;
  });

  const toggleAction = (pageId, action) => setPerms((p) => {
    const next = { ...p };
    const page = next[pageId] || { view: true, actions: {} };
    const actions = { ...page.actions, [action]: !page.actions?.[action] };
    next[pageId] = { ...page, view: true, actions };
    return next;
  });

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return toast('A role name is required', 'error');
    setBusy(true);
    try { await onSubmit({ name, desc, perms }); }
    catch (err) { toast(err.message || 'Could not save', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title={role.id ? `Permissions — ${role.name}` : 'Add role'} onClose={onClose} width={640}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save role'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </div>

        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          These switches hide pages and buttons. The server enforces the same rules on every route,
          so a role cannot get past them by calling the API directly.
        </p>

        <div className="grid gap-2">
          {PAGES.map((page) => {
            const granted = Boolean(perms[page.id]?.view);
            return (
              <div key={page.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)' }}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={granted} onChange={() => togglePage(page.id)} />
                  <span>{page.icon} {page.label}</span>
                </label>
                {granted && page.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 pl-6">
                    {page.actions.map((a) => (
                      <label key={a} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <input type="checkbox" checked={Boolean(perms[page.id]?.actions?.[a])}
                          onChange={() => toggleAction(page.id, a)} />
                        {a}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CredentialsForm({ user, onClose, onDone }) {
  const toast = useToast();
  const [username, setUsername] = useState(user.username || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return toast('Password must be at least 6 characters', 'error');
    setBusy(true);
    try {
      await request('/users/' + encodeURIComponent(user.id) + '/password', {
        method: 'POST', body: { username, password }
      });
      onDone();
    } catch (err) { toast(err.message || 'Could not update credentials', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title={`Credentials — ${user.name}`} onClose={onClose} width={440}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Set credentials'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>
        <Field label="New password" hint="At least 6 characters. Stored as a bcrypt hash.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" required />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

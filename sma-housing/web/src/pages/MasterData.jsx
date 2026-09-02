import { useMemo, useState } from 'react';
import { useCollection, useCreate, useUpdate, useRemove } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Empty, Field, Input, Modal, PageHeader, Select, Tag, useConfirm, useToast } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { fmtDate, todayStr, uid } from '../lib/format';

/* Master data is one table of typed lookup values. Each row carries a validity
   range so a value can be retired without deleting history that references it. */
const TYPE_LABELS = {
  college: 'Colleges', violationType: 'Violation types', complaintCategory: 'Complaint categories',
  maintenanceSub: 'Maintenance sub-types', requestType: 'Request types',
  attendanceStatus: 'Attendance statuses', docType: 'Document types', disciplinaryAction: 'Disciplinary actions'
};

export default function MasterData() {
  const toast = useToast();
  const { can } = usePermissions();
  const { data: master = [], isLoading } = useCollection('master');
  const create = useCreate('master');
  const update = useUpdate('master');
  const remove = useRemove('master');
  const [editing, setEditing] = useState(null);
  const [type, setType] = useState('');
  const [confirm, confirmNode] = useConfirm();

  const types = useMemo(() => {
    const found = [...new Set(master.map((m) => m.type))];
    const known = Object.keys(TYPE_LABELS);
    return [...new Set([...known, ...found])];
  }, [master]);

  const rows = useMemo(() => (type ? master.filter((m) => m.type === type) : master), [master, type]);

  async function destroy(row) {
    if (!(await confirm(`Delete “${row.value}”? Existing records that use it keep the text.`, { confirmLabel: 'Delete' }))) return;
    await remove.mutateAsync(row.id);
    toast('Value deleted');
  }

  const columns = useMemo(() => [
    { id: 'type', header: 'Type', accessorFn: (m) => TYPE_LABELS[m.type] || m.type },
    { accessorKey: 'value', header: 'Value' },
    { accessorKey: 'from', header: 'Valid from', cell: (c) => fmtDate(c.getValue()) },
    { accessorKey: 'to', header: 'Valid to', cell: (c) => (c.getValue() ? fmtDate(c.getValue()) : 'Open') },
    {
      id: 'active', header: 'State',
      accessorFn: (m) => (m.active === false || m.active === 0 ? 'Inactive' : 'Active'),
      cell: ({ row }) => <Tag>{row.original.active === false || row.original.active === 0 ? 'Inactive' : 'Active'}</Tag>
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          {can('master', 'edit') && <Button size="sm" onClick={() => setEditing(row.original)}>Edit</Button>}
          {can('master', 'delete') && <Button size="sm" variant="danger" onClick={() => destroy(row.original)}>Delete</Button>}
        </div>
      )
    }
  ], [can]);

  return (
    <>
      {confirmNode}
      <PageHeader title="Master Data" subtitle={`${master.length} lookup values across ${types.length} types`}>
        {can('master', 'add') && <Button variant="primary" onClick={() => setEditing({})}>Add value</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={rows} columns={columns} initialSort={[{ id: 'type', desc: false }]}
          searchPlaceholder="Search values…" empty="No master data." toolbar={
            <div className="w-52">
              <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
              </Select>
            </div>
          } />
      )}

      {editing && (
        <MasterForm row={editing} types={types} onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            if (editing.id) await update.mutateAsync({ id: editing.id, ...values });
            else await create.mutateAsync({ id: uid('MD'), ...values });
            toast('Master data saved');
            setEditing(null);
          }} />
      )}
    </>
  );
}

function MasterForm({ row, types, onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({
    type: row.type || types[0] || 'college',
    value: row.value || '',
    from: row.from || todayStr(),
    to: row.to || '',
    active: row.active === false || row.active === 0 ? false : true
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.value.trim()) return toast('A value is required', 'error');
    setBusy(true);
    try { await onSubmit(values); } finally { setBusy(false); }
  }

  return (
    <Modal open title={row.id ? 'Edit value' : 'Add value'} onClose={onClose} width={480}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Type">
          <Select value={values.type} onChange={set('type')}>
            {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
          </Select>
        </Field>
        <Field label="Value"><Input value={values.value} onChange={set('value')} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid from"><Input type="date" value={values.from} onChange={set('from')} /></Field>
          <Field label="Valid to" hint="Blank = open-ended">
            <Input type="date" value={values.to} onChange={set('to')} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.active}
            onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))} />
          Active — offered in dropdowns
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

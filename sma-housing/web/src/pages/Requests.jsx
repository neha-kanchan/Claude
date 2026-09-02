import { useMemo, useState } from 'react';
import { useCollection, useCreate, useUpdate } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Empty, Field, Input, Modal, PageHeader, Select, Tag, Textarea, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { useMasterValues, useStudentIndex } from '../lib/domain';
import { downloadCsv, fmtDateTime, uid } from '../lib/format';

export default function Requests() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { students, studentName } = useStudentIndex();
  const { data: requests = [], isLoading } = useCollection('requests');
  const types = useMasterValues('requestType');
  const create = useCreate('requests');
  const update = useUpdate('requests');

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const current = openId ? requests.find((r) => r.id === openId) : null;

  const columns = useMemo(() => [
    { accessorKey: 'id', header: 'Ref', cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> },
    { id: 'student', header: 'Student', accessorFn: (r) => studentName(r.studentId) },
    { accessorKey: 'type', header: 'Request' },
    { accessorKey: 'createdAt', header: 'Raised', cell: (c) => <span className="whitespace-nowrap">{fmtDateTime(c.getValue())}</span> },
    { accessorKey: 'status', header: 'Status', cell: (c) => <Tag>{c.getValue()}</Tag> }
  ], [studentName]);

  async function decide(request, status) {
    await update.mutateAsync({
      id: request.id, status,
      decidedAt: ['Approved', 'Rejected', 'Completed'].includes(status) ? new Date().toISOString() : null,
      history: [...(request.history || []), { at: new Date().toISOString(), by: user?.name || 'system', note: 'Status → ' + status }]
    });
    toast('Request ' + status.toLowerCase());
  }

  return (
    <>
      <PageHeader title="Student Requests"
        subtitle={`${requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status)).length} awaiting a decision`}>
        {can('requests', 'export') && (
          <Button onClick={() => downloadCsv('requests.csv', requests, [
            { header: 'Ref', value: (r) => r.id }, { header: 'Student', value: (r) => studentName(r.studentId) },
            { header: 'Type', value: (r) => r.type }, { header: 'Details', value: (r) => r.details },
            { header: 'Status', value: (r) => r.status }, { header: 'Raised', value: (r) => r.createdAt },
            { header: 'Decided', value: (r) => r.decidedAt }
          ])}>Export CSV</Button>
        )}
        {can('requests', 'add') && <Button variant="primary" onClick={() => setAdding(true)}>New request</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={requests} columns={columns} initialSort={[{ id: 'createdAt', desc: true }]}
          onRowClick={(r) => setOpenId(r.id)} searchPlaceholder="Search requests…" empty="No requests submitted." />
      )}

      {adding && (
        <Modal open title="New request" onClose={() => setAdding(false)} width={560}
          footer={null}>
          <RequestForm students={students} types={types}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await create.mutateAsync({
                id: uid('REQ'), ...values, status: 'Submitted',
                createdAt: new Date().toISOString(), decidedAt: null,
                history: [{ at: new Date().toISOString(), by: user?.name || 'system', note: 'Submitted' }]
              });
              toast('Request submitted');
              setAdding(false);
            }} />
        </Modal>
      )}

      {current && (
        <Modal open title={`${current.type} — ${current.id}`} onClose={() => setOpenId(null)} width={560}
          footer={
            <div className="flex flex-wrap gap-2">
              {can('requests', 'approve') && current.status !== 'Approved' && (
                <Button variant="primary" size="sm" onClick={() => decide(current, 'Approved')}>Approve</Button>
              )}
              {can('requests', 'reject') && current.status !== 'Rejected' && (
                <Button variant="danger" size="sm" onClick={() => decide(current, 'Rejected')}>Reject</Button>
              )}
              {can('requests', 'approve') && current.status === 'Submitted' && (
                <Button size="sm" onClick={() => decide(current, 'Under Review')}>Move to review</Button>
              )}
              {can('requests', 'approve') && current.status === 'Approved' && (
                <Button size="sm" onClick={() => decide(current, 'Completed')}>Mark completed</Button>
              )}
            </div>
          }>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Tag>{current.status}</Tag>
              <span style={{ color: 'var(--ink-soft)' }}>{studentName(current.studentId)}</span>
            </div>
            <p style={{ color: 'var(--ink-soft)' }}>{current.details || 'No details provided.'}</p>
            <div>
              <div className="mb-1 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)' }}>History</div>
              <ol className="border-l pl-3" style={{ borderColor: 'var(--line)' }}>
                {(current.history || []).map((h, i) => (
                  <li key={i} className="mb-2 text-xs">
                    <div className="font-medium">{h.note}</div>
                    <div style={{ color: 'var(--ink-soft)' }}>{fmtDateTime(h.at)} · {h.by}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function RequestForm({ students, types, onCancel, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({ studentId: '', type: types[0] || '', details: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.studentId) return toast('Choose a student', 'error');
    setBusy(true);
    try { await onSubmit(values); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Student">
        <Select value={values.studentId} onChange={set('studentId')} required>
          <option value="">Choose…</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
        </Select>
      </Field>
      <Field label="Request type">
        <Select value={values.type} onChange={set('type')}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Details"><Textarea rows={3} value={values.details} onChange={set('details')} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Submit'}</Button>
      </div>
    </form>
  );
}

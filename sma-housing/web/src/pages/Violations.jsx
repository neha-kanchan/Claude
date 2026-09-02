import { useMemo, useState } from 'react';
import { useCollection, useCreate, useUpdate, uploadFile, downloadFile } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tag, Textarea, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { useMasterValues, useStudentIndex } from '../lib/domain';
import { downloadCsv, fmtDate, fmtDateTime, fmtSize, nowTime, todayStr, uid } from '../lib/format';
import { readAnyFile } from '../lib/image';

const FLOW = ['Open', 'Investigation', 'Decision', 'Closed'];

export default function Violations() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { students, studentName } = useStudentIndex();
  const { data: violations = [], isLoading } = useCollection('violations');
  const types = useMasterValues('violationType');
  const actions = useMasterValues('disciplinaryAction');
  const create = useCreate('violations');
  const update = useUpdate('violations');

  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const current = open ? violations.find((v) => v.id === open) : null;

  const columns = useMemo(() => [
    { accessorKey: 'id', header: 'Ref', cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> },
    { id: 'student', header: 'Student', accessorFn: (v) => studentName(v.studentId) },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'date', header: 'Date', cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue())}</span> },
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'status', header: 'Status', cell: (c) => <Tag>{c.getValue()}</Tag> }
  ], [studentName]);

  async function advance(violation, status) {
    const history = [...(violation.history || []), { at: new Date().toISOString(), by: user?.name || 'system', note: 'Status → ' + status }];
    await update.mutateAsync({ id: violation.id, status, history });
    toast('Violation updated');
  }

  return (
    <>
      <PageHeader title="Violations" subtitle={`${violations.filter((v) => v.status !== 'Closed').length} open`}>
        {can('violations', 'export') && (
          <Button onClick={() => downloadCsv('violations.csv', violations, [
            { header: 'Ref', value: (v) => v.id }, { header: 'Student', value: (v) => studentName(v.studentId) },
            { header: 'Type', value: (v) => v.type }, { header: 'Date', value: (v) => v.date },
            { header: 'Location', value: (v) => v.location }, { header: 'Action', value: (v) => v.action },
            { header: 'Status', value: (v) => v.status }
          ])}>Export CSV</Button>
        )}
        {can('violations', 'add') && <Button variant="primary" onClick={() => setAdding(true)}>Record violation</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={violations} columns={columns} initialSort={[{ id: 'date', desc: true }]}
          onRowClick={(v) => setOpen(v.id)} searchPlaceholder="Search violations…" empty="No violations recorded." />
      )}

      {adding && (
        <ViolationForm students={students} types={types} actions={actions} onClose={() => setAdding(false)}
          onSubmit={async (values, file) => {
            const attachments = [];
            if (file) attachments.push({ name: file.name, size: file.size, fileKey: await uploadFile(file) });
            await create.mutateAsync({
              id: uid('VIO'), ...values, status: 'Open', attachments,
              history: [{ at: new Date().toISOString(), by: user?.name || 'system', note: 'Reported' }]
            });
            toast('Violation recorded');
            setAdding(false);
          }} />
      )}

      {current && (
        <Modal open title={`Violation ${current.id}`} onClose={() => setOpen(null)} width={640}
          footer={can('violations', 'update') ? (
            <div className="flex flex-wrap gap-2">
              {FLOW.filter((s) => s !== current.status).map((s) => (
                <Button key={s} variant={s === 'Closed' ? 'primary' : 'default'} size="sm"
                  onClick={() => advance(current, s)}
                  disabled={s === 'Closed' && !can('violations', 'close')}>
                  Move to {s}
                </Button>
              ))}
            </div>
          ) : null}>
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{current.status}</Tag>
              <span style={{ color: 'var(--ink-soft)' }}>
                {studentName(current.studentId)} · {fmtDate(current.date)} {current.time}
              </span>
            </div>
            <div><strong>{current.type}</strong>{current.location ? ` · ${current.location}` : ''}</div>
            <p style={{ color: 'var(--ink-soft)' }}>{current.description || 'No description recorded.'}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span style={{ color: 'var(--ink-soft)' }}>Reported by</span><div className="font-medium">{current.staff || '—'}</div></div>
              <div><span style={{ color: 'var(--ink-soft)' }}>Action</span><div className="font-medium">{current.action || '—'}</div></div>
            </div>

            {!!(current.attachments || []).length && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)' }}>Attachments</div>
                {current.attachments.map((a, i) => (
                  <button key={i} type="button" className="block text-left text-sm underline"
                    style={{ color: 'var(--leaf)' }}
                    onClick={() => downloadFile(a.fileKey, a.name).catch(() => toast('File not available', 'error'))}>
                    📎 {a.name} ({fmtSize(a.size)})
                  </button>
                ))}
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)' }}>History</div>
              <ol className="border-l pl-3" style={{ borderColor: 'var(--line)' }}>
                {(current.history || []).map((h, i) => (
                  <li key={i} className="mb-2 text-xs">
                    <div className="font-medium">{h.note}</div>
                    <div style={{ color: 'var(--ink-soft)' }}>{fmtDateTime(h.at)} · {h.by}</div>
                  </li>
                ))}
                {!(current.history || []).length && <li className="text-xs" style={{ color: 'var(--ink-soft)' }}>No history yet.</li>}
              </ol>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function ViolationForm({ students, types, actions, onClose, onSubmit }) {
  const toast = useToast();
  const { user } = useAuth();
  const [values, setValues] = useState({
    studentId: '', type: types[0] || '', date: todayStr(), time: nowTime(),
    location: '', description: '', staff: user?.name || '', action: ''
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    try { setFile(await readAnyFile(f)); }
    catch (err) { toast(err.message, 'error'); e.target.value = ''; }
  }

  async function submit(e) {
    e.preventDefault();
    if (!values.studentId) return toast('Choose a student', 'error');
    if (!values.type) return toast('Choose a violation type', 'error');
    setBusy(true);
    try { await onSubmit(values, file); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Record a violation" onClose={onClose} width={620}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Student" className="sm:col-span-2">
          <Select value={values.studentId} onChange={set('studentId')} required>
            <option value="">Choose…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={values.type} onChange={set('type')}>
            {types.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Proposed action">
          <Select value={values.action} onChange={set('action')}>
            <option value="">—</option>
            {actions.map((a) => <option key={a}>{a}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={values.date} onChange={set('date')} /></Field>
        <Field label="Time"><Input type="time" value={values.time} onChange={set('time')} /></Field>
        <Field label="Location" className="sm:col-span-2">
          <Input value={values.location} onChange={set('location')} placeholder="Building A · Floor 2" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={values.description} onChange={set('description')} />
        </Field>
        <Field label="Reported by"><Input value={values.staff} onChange={set('staff')} /></Field>
        <Field label="Evidence" hint="Max 2 MB.">
          <input type="file" onChange={pick} className="field cursor-pointer text-xs" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { useCollection, useCreate, useUpdate, uploadFile, downloadFile } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Empty, Field, Input, Modal, PageHeader, Select, Tag, Textarea, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { useMasterValues, useStudentIndex } from '../lib/domain';
import { downloadCsv, fmtDateTime, fmtSize, uid } from '../lib/format';
import { readAnyFile } from '../lib/image';

const FLOW = ['Submitted', 'Assigned', 'In Progress', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High'];

export default function Complaints() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { students, studentName } = useStudentIndex();
  const { data: complaints = [], isLoading } = useCollection('complaints');
  const categories = useMasterValues('complaintCategory');
  const subs = useMasterValues('maintenanceSub');
  const create = useCreate('complaints');
  const update = useUpdate('complaints');

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [comment, setComment] = useState('');
  const current = openId ? complaints.find((c) => c.id === openId) : null;

  const columns = useMemo(() => [
    { accessorKey: 'id', header: 'Ref', cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> },
    { accessorKey: 'title', header: 'Subject' },
    {
      id: 'category', header: 'Category',
      accessorFn: (c) => c.category + (c.sub ? ' · ' + c.sub : '')
    },
    { id: 'student', header: 'Student', accessorFn: (c) => studentName(c.studentId) },
    { accessorKey: 'priority', header: 'Priority', cell: (c) => (c.getValue() ? <Tag>{c.getValue()}</Tag> : '—') },
    { accessorKey: 'status', header: 'Status', cell: (c) => <Tag>{c.getValue()}</Tag> }
  ], [studentName]);

  async function setStatus(complaint, status) {
    const now = new Date().toISOString();
    const patch = { id: complaint.id, status };
    if (status !== 'Submitted' && !complaint.respondedAt) patch.respondedAt = now;
    if (status === 'Resolved') patch.resolvedAt = now;
    patch.comments = [...(complaint.comments || []), { at: now, by: user?.name || 'system', text: 'Status → ' + status }];
    await update.mutateAsync(patch);
    toast('Complaint updated');
  }

  async function addComment() {
    if (!comment.trim()) return;
    await update.mutateAsync({
      id: current.id,
      comments: [...(current.comments || []), { at: new Date().toISOString(), by: user?.name || 'system', text: comment.trim() }]
    });
    setComment('');
  }

  return (
    <>
      <PageHeader title="Complaints & Maintenance"
        subtitle={`${complaints.filter((c) => c.status !== 'Resolved').length} outstanding`}>
        {can('complaints', 'export') && (
          <Button onClick={() => downloadCsv('complaints.csv', complaints, [
            { header: 'Ref', value: (c) => c.id }, { header: 'Subject', value: (c) => c.title },
            { header: 'Category', value: (c) => c.category }, { header: 'Sub-type', value: (c) => c.sub },
            { header: 'Student', value: (c) => studentName(c.studentId) },
            { header: 'Priority', value: (c) => c.priority }, { header: 'Status', value: (c) => c.status },
            { header: 'Assignee', value: (c) => c.assignee }
          ])}>Export CSV</Button>
        )}
        {can('complaints', 'add') && <Button variant="primary" onClick={() => setAdding(true)}>Log complaint</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={complaints} columns={columns} initialSort={[{ id: 'status', desc: false }]}
          onRowClick={(c) => setOpenId(c.id)} searchPlaceholder="Search complaints…" empty="No complaints logged." />
      )}

      {adding && (
        <ComplaintForm students={students} categories={categories} subs={subs} onClose={() => setAdding(false)}
          onSubmit={async (values, file) => {
            const attachments = [];
            if (file) attachments.push({ name: file.name, size: file.size, fileKey: await uploadFile(file) });
            await create.mutateAsync({
              id: uid('CMP'), ...values, status: 'Submitted',
              createdAt: new Date().toISOString(), respondedAt: null, resolvedAt: null,
              attachments, comments: []
            });
            toast('Complaint logged');
            setAdding(false);
          }} />
      )}

      {current && (
        <Modal open title={current.title || current.id} onClose={() => setOpenId(null)} width={640}
          footer={can('complaints', 'update') ? (
            <div className="flex flex-wrap gap-2">
              {FLOW.filter((s) => s !== current.status).map((s) => (
                <Button key={s} size="sm" variant={s === 'Resolved' ? 'primary' : 'default'}
                  onClick={() => setStatus(current, s)}>Move to {s}</Button>
              ))}
            </div>
          ) : null}>
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{current.status}</Tag>
              {current.priority && <Tag>{current.priority}</Tag>}
              <span style={{ color: 'var(--ink-soft)' }}>
                {current.category}{current.sub ? ' · ' + current.sub : ''} · {studentName(current.studentId)}
              </span>
            </div>
            <p style={{ color: 'var(--ink-soft)' }}>{current.description || 'No description.'}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span style={{ color: 'var(--ink-soft)' }}>Raised</span><div className="font-medium">{fmtDateTime(current.createdAt)}</div></div>
              <div><span style={{ color: 'var(--ink-soft)' }}>Assignee</span><div className="font-medium">{current.assignee || '—'}</div></div>
            </div>

            {!!(current.attachments || []).length && (
              <div>
                {current.attachments.map((a, i) => (
                  <button key={i} type="button" className="block text-left text-sm underline" style={{ color: 'var(--leaf)' }}
                    onClick={() => downloadFile(a.fileKey, a.name).catch(() => toast('File not available', 'error'))}>
                    📎 {a.name} ({fmtSize(a.size)})
                  </button>
                ))}
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)' }}>Activity</div>
              <ol className="border-l pl-3" style={{ borderColor: 'var(--line)' }}>
                {(current.comments || []).map((c, i) => (
                  <li key={i} className="mb-2 text-xs">
                    <div className="font-medium">{c.text}</div>
                    <div style={{ color: 'var(--ink-soft)' }}>{fmtDateTime(c.at)} · {c.by}</div>
                  </li>
                ))}
                {!(current.comments || []).length && <li className="text-xs" style={{ color: 'var(--ink-soft)' }}>No activity yet.</li>}
              </ol>
            </div>

            {can('complaints', 'comment') && (
              <div className="flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }} />
                <Button onClick={addComment}>Add</Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function ComplaintForm({ students, categories, subs, onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({
    studentId: '', category: categories[0] || '', sub: '', title: '',
    description: '', priority: 'Medium', assignee: ''
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
    if (!values.title.trim()) return toast('A subject is required', 'error');
    setBusy(true);
    try { await onSubmit(values, file); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Log a complaint" onClose={onClose} width={620}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Log complaint'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Student" className="sm:col-span-2">
          <Select value={values.studentId} onChange={set('studentId')} required>
            <option value="">Choose…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={values.category} onChange={(e) => setValues((v) => ({ ...v, category: e.target.value, sub: '' }))}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        {/* Maintenance is the only category with sub-types, so the field only appears for it. */}
        <Field label="Sub-type">
          <Select value={values.sub} onChange={set('sub')} disabled={values.category !== 'Maintenance'}>
            <option value="">—</option>
            {subs.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Subject" className="sm:col-span-2">
          <Input value={values.title} onChange={set('title')} placeholder="AC not cooling" required />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={values.description} onChange={set('description')} />
        </Field>
        <Field label="Priority">
          <Select value={values.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Assignee"><Input value={values.assignee} onChange={set('assignee')} placeholder="Facilities · HVAC team" /></Field>
        <Field label="Attachment" hint="Max 2 MB." className="sm:col-span-2">
          <input type="file" onChange={pick} className="field cursor-pointer text-xs" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

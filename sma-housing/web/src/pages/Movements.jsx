import { useMemo, useRef, useState } from 'react';
import { useCollection, useCreate, useUpdate } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Card, Field, Input, Modal, PageHeader, Select, Tag, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { isOverdue, useStudentIndex } from '../lib/domain';
import { downloadCsv, fmtDateTime, uid } from '../lib/format';

/* The gate is the one place someone works standing up, one hand on a scanner.
   The scan box stays focused and takes an ID or a name: enter logs the exit, or
   closes an open exit if the student is already out. Everything else is
   secondary to that single input. */
export default function Movements() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { students, byId, studentName } = useStudentIndex();
  const { data: movements = [], isLoading } = useCollection('movements');
  const create = useCreate('movements');
  const update = useUpdate('movements');

  const scanRef = useRef(null);
  const [scan, setScan] = useState('');
  const [manual, setManual] = useState(null);

  const openExits = useMemo(() => {
    const map = {};
    for (const m of movements) if (m.type === 'Exit' && !m.returnedAt) map[m.studentId] = m;
    return map;
  }, [movements]);

  const resolveStudent = (text) => {
    const q = text.trim().toLowerCase();
    if (!q) return null;
    return byId[text.trim()]
      || students.find((s) => s.id.toLowerCase() === q)
      || students.find((s) => s.name.toLowerCase() === q)
      || students.find((s) => s.name.toLowerCase().includes(q));
  };

  async function logReturn(movement) {
    const now = new Date().toISOString();
    const late = movement.expectedReturn && new Date(now) > new Date(movement.expectedReturn);
    await update.mutateAsync({ id: movement.id, returnedAt: now, late: late ? 1 : 0 });
    toast(`${studentName(movement.studentId)} returned${late ? ' — late' : ''}`);
  }

  async function handleScan(e) {
    e.preventDefault();
    const student = resolveStudent(scan);
    if (!student) { toast(`No student matches “${scan}”`, 'error'); return; }
    const open = openExits[student.id];
    if (open) await logReturn(open);
    else {
      await create.mutateAsync({
        id: uid('MOV'), studentId: student.id, type: 'Exit', at: new Date().toISOString(),
        expectedReturn: '', returnedAt: null, purpose: 'Gate scan', by: user?.name || 'Gate', late: 0
      });
      toast(`${student.name} signed out`);
    }
    setScan('');
    scanRef.current?.focus();
  }

  const columns = useMemo(() => [
    { id: 'student', header: 'Student', accessorFn: (m) => studentName(m.studentId) },
    { accessorKey: 'type', header: 'Type', cell: (c) => <Tag tone={c.getValue() === 'Exit' ? 'amber' : 'blue'}>{c.getValue()}</Tag> },
    { accessorKey: 'at', header: 'At', cell: (c) => <span className="tnum whitespace-nowrap">{fmtDateTime(c.getValue())}</span> },
    { accessorKey: 'purpose', header: 'Purpose' },
    {
      id: 'state', header: 'State',
      accessorFn: (m) => (m.returnedAt ? 'Returned' : isOverdue(m) ? 'Overdue' : m.type === 'Exit' ? 'Out' : '—'),
      cell: ({ row }) => {
        const m = row.original;
        if (m.returnedAt) return <Tag tone={m.late ? 'amber' : 'green'}>{m.late ? 'Returned late' : 'Returned'}</Tag>;
        if (m.type !== 'Exit') return <span style={{ color: 'var(--ink-soft)' }}>—</span>;
        return <Tag tone={isOverdue(m) ? 'brick' : 'amber'}>{isOverdue(m) ? 'Overdue' : 'Out'}</Tag>;
      }
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (can('movements', 'return') && row.original.type === 'Exit' && !row.original.returnedAt
        ? <Button size="sm" onClick={() => logReturn(row.original)}>Log return</Button>
        : null)
    }
  ], [studentName, can]);

  const sorted = useMemo(() => [...movements].sort((a, b) => String(b.at).localeCompare(String(a.at))), [movements]);
  const out = Object.values(openExits);

  return (
    <>
      <PageHeader title="Entry / Exit Log"
        subtitle={`${out.length} currently out · ${out.filter(isOverdue).length} overdue`}>
        {can('movements', 'export') && (
          <Button onClick={() => downloadCsv('movements.csv', sorted, [
            { header: 'Student', value: (m) => studentName(m.studentId) },
            { header: 'Type', value: (m) => m.type },
            { header: 'At', value: (m) => m.at },
            { header: 'Expected return', value: (m) => m.expectedReturn },
            { header: 'Returned at', value: (m) => m.returnedAt },
            { header: 'Purpose', value: (m) => m.purpose },
            { header: 'Logged by', value: (m) => m.by }
          ])}>Export CSV</Button>
        )}
        {can('movements', 'record') && <Button variant="primary" onClick={() => setManual({})}>Record manually</Button>}
      </PageHeader>

      {can('movements', 'record') && (
        <Card className="mb-4">
          <form onSubmit={handleScan} className="flex flex-wrap items-end gap-3">
            <Field label="Scan or type a student ID" className="min-w-[240px] flex-1"
              hint="Enter signs the student out — or logs their return if they are already out.">
              <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)}
                placeholder="STU-1001" autoFocus autoComplete="off" enterKeyHint="done" />
            </Field>
            <Button type="submit" variant="primary" className="h-[38px]">Log movement</Button>
          </form>
        </Card>
      )}

      {isLoading ? <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</p> : (
        <DataTable data={sorted} columns={columns} searchPlaceholder="Search the gate log…" empty="No movements logged." />
      )}

      {manual && (
        <ManualMovement students={students} onClose={() => setManual(null)}
          onSubmit={async (values) => {
            await create.mutateAsync({
              id: uid('MOV'), ...values, at: new Date().toISOString(),
              returnedAt: null, by: user?.name || 'Gate', late: 0
            });
            toast('Movement recorded');
            setManual(null);
          }} />
      )}
    </>
  );
}

function ManualMovement({ students, onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({ studentId: '', type: 'Exit', purpose: '', expectedReturn: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.studentId) return toast('Choose a student', 'error');
    setBusy(true);
    try {
      await onSubmit({
        ...values,
        expectedReturn: values.expectedReturn ? new Date(values.expectedReturn).toISOString() : ''
      });
    } finally { setBusy(false); }
  }

  return (
    <Modal open title="Record a movement" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Student">
          <Select value={values.studentId} onChange={set('studentId')} required>
            <option value="">Choose…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={values.type} onChange={set('type')}>
            <option>Exit</option><option>Entry</option>
          </Select>
        </Field>
        <Field label="Purpose"><Input value={values.purpose} onChange={set('purpose')} placeholder="Family visit" /></Field>
        {values.type === 'Exit' && (
          <Field label="Expected return" hint="Leave blank if open-ended.">
            <Input type="datetime-local" value={values.expectedReturn} onChange={set('expectedReturn')} />
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

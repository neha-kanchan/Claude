import { useMemo, useState } from 'react';
import { useCollection, useCreate, useRemove } from '../api/queries';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tag, useConfirm, useToast } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { fmtDate, todayStr, uid } from '../lib/format';

const TYPES = ['Inspection', 'Maintenance', 'Event', 'Holiday', 'Deadline'];

export default function Calendar() {
  const toast = useToast();
  const { can } = usePermissions();
  const { data: entries = [], isLoading } = useCollection('calendar');
  const create = useCreate('calendar');
  const remove = useRemove('calendar');
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  const { upcoming, past } = useMemo(() => {
    const today = todayStr();
    const sorted = [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {
      upcoming: sorted.filter((e) => e.date >= today),
      past: sorted.filter((e) => e.date < today).reverse()
    };
  }, [entries]);

  async function destroy(entry) {
    if (!(await confirm(`Delete “${entry.title}”?`, { confirmLabel: 'Delete' }))) return;
    await remove.mutateAsync(entry.id);
    toast('Entry deleted');
  }

  const List = ({ items, empty }) => (
    items.length === 0 ? <Empty>{empty}</Empty> : (
      <ul>
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0" style={{ borderColor: 'var(--line)' }}>
            <div className="tnum w-24 shrink-0 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>{fmtDate(e.date)}</div>
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</div>
            {e.type && <Tag>{e.type}</Tag>}
            {can('calendar', 'delete') && <Button size="sm" variant="ghost" onClick={() => destroy(e)} aria-label="Delete">✕</Button>}
          </li>
        ))}
      </ul>
    )
  );

  return (
    <>
      {confirmNode}
      <PageHeader title="Housing Calendar" subtitle={`${upcoming.length} upcoming`}>
        {can('calendar', 'add') && <Button variant="primary" onClick={() => setAdding(true)}>Add entry</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Upcoming" bodyClass="p-0"><List items={upcoming} empty="Nothing scheduled." /></Card>
          <Card title="Past" bodyClass="p-0"><List items={past} empty="No past entries." /></Card>
        </div>
      )}

      {adding && (
        <EntryForm onClose={() => setAdding(false)} onSubmit={async (values) => {
          await create.mutateAsync({ id: uid('CAL'), ...values });
          toast('Calendar entry added');
          setAdding(false);
        }} />
      )}
    </>
  );
}

function EntryForm({ onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({ date: todayStr(), title: '', type: TYPES[0] });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.title.trim()) return toast('A title is required', 'error');
    setBusy(true);
    try { await onSubmit(values); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Add calendar entry" onClose={onClose} width={460}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Add'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Date"><Input type="date" value={values.date} onChange={set('date')} /></Field>
        <Field label="Title"><Input value={values.title} onChange={set('title')} required /></Field>
        <Field label="Type">
          <Select value={values.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

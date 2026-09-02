import { useState } from 'react';
import { useCollection, useCreate, useUpdate } from '../api/queries';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Tag, Textarea, useToast } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { fmtDateTime, uid } from '../lib/format';

export default function Notifications() {
  const toast = useToast();
  const { can } = usePermissions();
  const { data: notifications = [], isLoading } = useCollection('notifications');
  const create = useCreate('notifications');
  const update = useUpdate('notifications');
  const [announcing, setAnnouncing] = useState(false);

  const sorted = [...notifications].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const unread = sorted.filter((n) => !n.read);

  async function markAllRead() {
    for (const n of unread) await update.mutateAsync({ id: n.id, read: true });
    toast('All marked as read');
  }

  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread.length} unread`}>
        {unread.length > 0 && <Button onClick={markAllRead}>Mark all read</Button>}
        {can('notifications', 'announce') && (
          <Button variant="primary" onClick={() => setAnnouncing(true)}>New announcement</Button>
        )}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <Card bodyClass="p-0">
          {sorted.length === 0 ? <Empty>No notifications.</Empty> : (
            <ul>
              {sorted.map((n) => (
                <li key={n.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0"
                  style={{ borderColor: 'var(--line)', background: n.read ? undefined : 'var(--leaf-soft)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{n.title}</span>
                      {n.type && <Tag>{n.type}</Tag>}
                    </div>
                    {n.body && <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{n.body}</p>}
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{fmtDateTime(n.at)}</div>
                  </div>
                  {!n.read && (
                    <Button size="sm" onClick={() => update.mutate({ id: n.id, read: true })}>Mark read</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {announcing && (
        <Announce onClose={() => setAnnouncing(false)} onSubmit={async (values) => {
          await create.mutateAsync({
            id: uid('NTF'), at: new Date().toISOString(), type: 'announcement',
            ...values, link: '', read: false
          });
          toast('Announcement published');
          setAnnouncing(false);
        }} />
      )}
    </>
  );
}

function Announce({ onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!values.title.trim()) return toast('A title is required', 'error');
    setBusy(true);
    try { await onSubmit(values); } finally { setBusy(false); }
  }

  return (
    <Modal open title="New announcement" onClose={onClose} width={520}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Title"><Input value={values.title} onChange={set('title')} required /></Field>
        <Field label="Message"><Textarea rows={4} value={values.body} onChange={set('body')} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

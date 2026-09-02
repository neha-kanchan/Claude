import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCollections, useCollection, useUpdate, useFileTicket, uploadFile, downloadFile } from '../api/queries';
import { Avatar, Button, Card, Empty, PageHeader, Tag, useConfirm, useToast } from '../components/ui';
import { StudentForm } from './Students';
import { useBuildingIndex, useMasterValues } from '../lib/domain';
import { usePermissions } from '../lib/usePermissions';
import { fmtDate, fmtDateTime } from '../lib/format';

const NEEDED = ['students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'documents', 'allocations'];

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--line)' }}>
      <span style={{ color: 'var(--ink-soft)' }}>{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  );
}

function Section({ title, items, render, empty }) {
  return (
    <Card title={`${title} (${items.length})`} bodyClass="p-0">
      {items.length === 0 ? <Empty>{empty}</Empty> : (
        <ul>
          {items.map((it) => (
            <li key={it.id} className="border-b px-4 py-2.5 last:border-0" style={{ borderColor: 'var(--line)' }}>
              {render(it)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { data, isLoading } = useCollections(NEEDED);
  const { buildings, buildingName } = useBuildingIndex();
  const colleges = useMasterValues('college');
  const fileUrl = useFileTicket();
  const update = useUpdate('students');
  const [editing, setEditing] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  const student = data.students.find((s) => s.id === id);
  if (isLoading) return <Empty>Loading…</Empty>;
  if (!student) return (
    <>
      <PageHeader title="Student not found" />
      <Link to="/students" className="text-sm font-semibold" style={{ color: 'var(--leaf)' }}>← Back to students</Link>
    </>
  );

  const mine = (list) => list.filter((x) => x.studentId === student.id);
  const attendance = mine(data.attendance).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
  const movements = mine(data.movements).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);

  async function toggleStatus() {
    const next = student.status === 'Inactive' ? 'Active' : 'Inactive';
    if (!(await confirm(`Set ${student.name} to ${next}?`, { confirmLabel: 'Set ' + next }))) return;
    await update.mutateAsync({ id: student.id, status: next });
    toast(`Status set to ${next}`);
  }

  return (
    <>
      {confirmNode}
      <PageHeader title={student.name} subtitle={<span className="font-mono">{student.id}</span>}>
        <Link to="/students"><Button>← All students</Button></Link>
        {can('students', 'edit') && <Button variant="primary" onClick={() => setEditing(true)}>Edit profile</Button>}
        {can('students', 'deactivate') && (
          <Button variant={student.status === 'Inactive' ? 'default' : 'danger'} onClick={toggleStatus}>
            {student.status === 'Inactive' ? 'Reactivate' : 'Deactivate'}
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar name={student.name} src={fileUrl(student.photoKey)} size={104} />
              <div>
                <div className="text-lg font-semibold">{student.name}</div>
                <Tag>{student.status || 'Active'}</Tag>
              </div>
            </div>
            <div className="mt-4">
              <Row label="Email" value={student.email} />
              <Row label="Phone" value={<span className="tnum">{student.phone}</span>} />
              <Row label="College" value={student.college} />
              <Row label="Building" value={buildingName(student.building)} />
              <Row label="Room" value={student.room} />
              <Row label="Joined" value={fmtDate(student.joined)} />
              <Row label="Emergency" value={student.emergency} />
            </div>
          </Card>

          <Section title="Room allocations" items={mine(data.allocations)} empty="No allocation history."
            render={(a) => (
              <div className="text-sm">
                <div className="font-medium">{a.roomId}</div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {fmtDate(a.from)} → {a.to ? fmtDate(a.to) : 'present'}{a.note ? ' · ' + a.note : ''}
                </div>
              </div>
            )} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Recent attendance" items={attendance} empty="No attendance recorded."
            render={(a) => (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{fmtDate(a.date)}</span>
                <Tag>{a.status}</Tag>
              </div>
            )} />

          <Section title="Entry / exit" items={movements} empty="No gate movements."
            render={(m) => (
              <div className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{m.type}</span>
                  <Tag tone={m.returnedAt ? 'green' : 'amber'}>{m.returnedAt ? 'Returned' : 'Out'}</Tag>
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {fmtDateTime(m.at)}{m.purpose ? ' · ' + m.purpose : ''}
                </div>
              </div>
            )} />

          <Section title="Violations" items={mine(data.violations)} empty="No violations on record."
            render={(v) => (
              <div className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{v.type}</span><Tag>{v.status}</Tag>
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{fmtDate(v.date)} · {v.action || 'No action yet'}</div>
              </div>
            )} />

          <Section title="Complaints" items={mine(data.complaints)} empty="No complaints raised."
            render={(c) => (
              <div className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{c.title}</span><Tag>{c.status}</Tag>
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{c.category}{c.sub ? ' · ' + c.sub : ''}</div>
              </div>
            )} />

          <Section title="Requests" items={mine(data.requests)} empty="No requests submitted."
            render={(r) => (
              <div className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{r.type}</span><Tag>{r.status}</Tag>
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{fmtDateTime(r.createdAt)}</div>
              </div>
            )} />

          <Section title="Documents" items={mine(data.documents)} empty="No documents filed."
            render={(d) => (
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{d.type} · {fmtDateTime(d.uploadedAt)}</div>
                </div>
                {d.fileKey && (
                  <Button size="sm" onClick={() => downloadFile(d.fileKey, d.name).catch(() => toast('File not available', 'error'))}>
                    Download
                  </Button>
                )}
              </div>
            )} />
        </div>
      </div>

      {editing && (
        <StudentForm
          title="Edit profile"
          student={student}
          buildings={buildings}
          colleges={colleges}
          currentPhotoUrl={fileUrl(student.photoKey)}
          onClose={() => setEditing(false)}
          onSubmit={async (values, photo, removePhoto) => {
            const patch = { id: student.id, ...values };
            if (photo) patch.photoKey = await uploadFile(photo);
            else if (removePhoto) patch.photoKey = null;
            await update.mutateAsync(patch);
            toast('Profile updated');
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollection, useCreate, useUpdate, useFileTicket, uploadFile, useAuditAction } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Avatar, Button, Field, Input, Modal, PageHeader, Select, Tag, useToast } from '../components/ui';
import { useMasterValues, useBuildingIndex } from '../lib/domain';
import { usePermissions } from '../lib/usePermissions';
import { downloadCsv, todayStr, uid } from '../lib/format';
import { readImageFile } from '../lib/image';

export default function Students() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { data: students = [], isLoading } = useCollection('students');
  const { buildings, buildingName } = useBuildingIndex();
  const colleges = useMasterValues('college');
  const fileUrl = useFileTicket();
  const create = useCreate('students');
  const [editing, setEditing] = useState(null);

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Student', accessorFn: (s) => `${s.name} ${s.id}`,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.original.name} src={fileUrl(row.original.photoKey)} size={34} />
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="truncate font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{row.original.id}</div>
          </div>
        </div>
      )
    },
    { accessorKey: 'college', header: 'College' },
    { id: 'building', header: 'Building', accessorFn: (s) => buildingName(s.building) },
    { accessorKey: 'room', header: 'Room' },
    { accessorKey: 'phone', header: 'Phone', cell: (c) => <span className="tnum">{c.getValue() || '—'}</span> },
    { accessorKey: 'status', header: 'Status', cell: (c) => <Tag>{c.getValue() || 'Active'}</Tag> }
  ], [fileUrl, buildingName]);

  return (
    <>
      <PageHeader title="Students" subtitle={`${students.length} resident records`}>
        {can('students', 'export') && (
          <Button onClick={() => downloadCsv('students.csv', students, [
            { header: 'ID', value: (s) => s.id }, { header: 'Name', value: (s) => s.name },
            { header: 'Email', value: (s) => s.email }, { header: 'Phone', value: (s) => s.phone },
            { header: 'College', value: (s) => s.college },
            { header: 'Building', value: (s) => buildingName(s.building) },
            { header: 'Room', value: (s) => s.room }, { header: 'Status', value: (s) => s.status }
          ])}>Export CSV</Button>
        )}
        {can('students', 'add') && <Button variant="primary" onClick={() => setEditing({})}>Add student</Button>}
      </PageHeader>

      {isLoading ? <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</p> : (
        <DataTable
          data={students} columns={columns}
          initialSort={[{ id: 'name', desc: false }]}
          searchPlaceholder="Search by name, ID, room…"
          onRowClick={(s) => navigate('/students/' + encodeURIComponent(s.id))}
          empty="No students yet."
        />
      )}

      {editing && (
        <StudentForm
          student={editing}
          buildings={buildings}
          colleges={colleges}
          onClose={() => setEditing(null)}
          onSubmit={async (values, photo) => {
            const id = values.id || 'STU-' + Date.now().toString().slice(-6);
            let photoKey = null;
            if (photo) photoKey = await uploadFile(photo);
            await create.mutateAsync({ ...values, id, joined: todayStr(), status: 'Active', photoKey });
            toast('Student added');
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/* Shared by this page and the 360 profile, so add and edit cannot drift apart. */
export function StudentForm({ student, buildings, colleges, currentPhotoUrl, onClose, onSubmit, title = 'Add student' }) {
  const toast = useToast();
  const [values, setValues] = useState({
    name: student.name || '', email: student.email || '', phone: student.phone || '',
    college: student.college || '', building: student.building || '', room: student.room || '',
    emergency: student.emergency || ''
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(currentPhotoUrl || null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await readImageFile(file);
      setPhoto(img);
      setPreview(img.data);
      setRemovePhoto(false);
    } catch (err) { toast(err.message, 'error'); e.target.value = ''; }
  }

  async function submit(e) {
    e.preventDefault();
    if (!values.name.trim()) return toast('Name is required', 'error');
    setBusy(true);
    try { await onSubmit(values, photo, removePhoto); }
    catch (err) { toast(err.message || 'Could not save', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title={title} onClose={onClose} width={620}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 flex items-center gap-4">
          <Avatar name={values.name} src={removePhoto ? null : preview} size={72} />
          <div className="min-w-0 flex-1">
            <Field label="Photo" hint="Downscaled to 480px before upload. Max 8 MB.">
              {/* capture lets a phone open the camera straight away */}
              <input type="file" accept="image/*" capture="environment" onChange={pickPhoto}
                className="field cursor-pointer text-xs" />
            </Field>
            {(preview || student.photoKey) && !removePhoto && (
              <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                <input type="checkbox" checked={removePhoto} onChange={(e) => { setRemovePhoto(e.target.checked); setPhoto(null); }} />
                Remove current photo
              </label>
            )}
          </div>
        </div>

        <Field label="Full name"><Input value={values.name} onChange={set('name')} required /></Field>
        <Field label="Email"><Input type="email" value={values.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={values.phone} onChange={set('phone')} /></Field>
        <Field label="College">
          <Select value={values.college} onChange={set('college')}>
            <option value="">—</option>
            {colleges.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Building">
          <Select value={values.building} onChange={set('building')}>
            <option value="">—</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Room"><Input value={values.room} onChange={set('room')} /></Field>
        <Field label="Emergency contact" className="sm:col-span-2">
          <Input value={values.emergency} onChange={set('emergency')} placeholder="Guardian · 0500-000-000" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { useCollection, useCreate, useRemove, uploadFile, downloadFile } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Empty, Field, Input, Modal, PageHeader, Select, useConfirm, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { useMasterValues, useStudentIndex } from '../lib/domain';
import { downloadCsv, fmtDateTime, fmtSize, uid } from '../lib/format';
import { readAnyFile } from '../lib/image';

export default function Documents() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { students, studentName } = useStudentIndex();
  const { data: documents = [], isLoading } = useCollection('documents');
  const docTypes = useMasterValues('docType');
  const create = useCreate('documents');
  const removeDoc = useRemove('documents');
  const removeFile = useRemove('files');
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  async function destroy(doc) {
    if (!(await confirm(`Delete “${doc.name}”? The stored file is removed too.`, { confirmLabel: 'Delete' }))) return;
    await removeDoc.mutateAsync(doc.id);
    // The body is only referenced by this row, so it goes with it rather than
    // being left behind as an orphan in the file store.
    if (doc.fileKey) await removeFile.mutateAsync(doc.fileKey).catch(() => {});
    toast('Document deleted');
  }

  const columns = useMemo(() => [
    { accessorKey: 'name', header: 'Document' },
    { accessorKey: 'type', header: 'Type' },
    { id: 'student', header: 'Student', accessorFn: (d) => studentName(d.studentId) },
    { accessorKey: 'uploadedAt', header: 'Uploaded', cell: (c) => <span className="whitespace-nowrap">{fmtDateTime(c.getValue())}</span> },
    { accessorKey: 'by', header: 'By' },
    { accessorKey: 'size', header: 'Size' },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {row.original.fileKey && (
            <Button size="sm" onClick={() => downloadFile(row.original.fileKey, row.original.name)
              .catch(() => toast('File not available', 'error'))}>Download</Button>
          )}
          {can('documents', 'delete') && <Button size="sm" variant="danger" onClick={() => destroy(row.original)}>Delete</Button>}
        </div>
      )
    }
  ], [studentName, can]);

  return (
    <>
      {confirmNode}
      <PageHeader title="Document Register" subtitle={`${documents.length} filed documents`}>
        {can('documents', 'export') && (
          <Button onClick={() => downloadCsv('documents.csv', documents, [
            { header: 'Name', value: (d) => d.name }, { header: 'Type', value: (d) => d.type },
            { header: 'Student', value: (d) => studentName(d.studentId) },
            { header: 'Uploaded', value: (d) => d.uploadedAt }, { header: 'By', value: (d) => d.by }
          ])}>Export CSV</Button>
        )}
        {can('documents', 'upload') && <Button variant="primary" onClick={() => setAdding(true)}>Upload document</Button>}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={documents} columns={columns} initialSort={[{ id: 'uploadedAt', desc: true }]}
          searchPlaceholder="Search documents…" empty="No documents filed." />
      )}

      {adding && (
        <UploadForm students={students} docTypes={docTypes} onClose={() => setAdding(false)}
          onSubmit={async (values, file) => {
            const fileKey = file ? await uploadFile(file) : null;
            await create.mutateAsync({
              id: uid('DOC'), ...values,
              name: values.name || file?.name || 'Document',
              uploadedAt: new Date().toISOString(), by: user?.name || 'system',
              size: file ? fmtSize(file.size) : '—', fileKey
            });
            toast('Document uploaded');
            setAdding(false);
          }} />
      )}
    </>
  );
}

function UploadForm({ students, docTypes, onClose, onSubmit }) {
  const toast = useToast();
  const [values, setValues] = useState({ studentId: '', type: docTypes[0] || '', name: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    try {
      const read = await readAnyFile(f);
      setFile(read);
      setValues((v) => ({ ...v, name: v.name || f.name }));
    } catch (err) { toast(err.message, 'error'); e.target.value = ''; }
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a file', 'error');
    setBusy(true);
    try { await onSubmit(values, file); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Upload a document" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </>}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Student">
          <Select value={values.studentId} onChange={set('studentId')}>
            <option value="">Not student-specific</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={values.type} onChange={set('type')}>
            {docTypes.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="File" hint="Max 2 MB.">
          <input type="file" onChange={pick} className="field cursor-pointer text-xs" />
        </Field>
        <Field label="Display name"><Input value={values.name} onChange={set('name')} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

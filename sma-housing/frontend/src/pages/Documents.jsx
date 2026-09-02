import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { downloadDataUrl, exportCSV, fmtDT } from '../lib/utils.js';
import { Can, Empty, Options, PageHead, StudentLink } from '../components/ui.jsx';
import DocumentForm from '../components/DocumentForm.jsx';

export default function Documents() {
  const { db, commit, audit, toast } = useStore();
  const { student, masterList } = useLookups();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [uploading, setUploading] = useState(false);

  const rows = db.documents.filter((d) => {
    const s = student(d.studentId);
    const needle = q.toLowerCase();
    return (!needle || d.name.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)) && (!type || d.type === type);
  }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const download = (d) => {
    const f = d.fileKey ? db.files[d.fileKey] : null;
    if (!f || !f.data) return toast('File content is not available');
    downloadDataUrl(f.data, d.name);
  };

  const remove = (d) => {
    if (!window.confirm(`Delete "${d.name}" from the register?`)) return;
    if (d.fileKey) { delete db.files[d.fileKey]; commit(['files']); }
    db.documents = db.documents.filter((x) => x.id !== d.id);
    commit(['documents']);
    audit('DELETE', 'document', d.id, d.name);
    toast('Document deleted');
  };

  const doExport = () => {
    exportCSV('documents.csv', db.documents.map((d) => ({
      id: d.id, name: d.name, type: d.type, student_id: d.studentId, student: student(d.studentId).name,
      uploaded: d.uploadedAt, by: d.by, size: d.size, file_stored: d.fileKey ? 'yes' : 'name only'
    })));
    audit('EXPORT', 'report', 'documents.csv', 'CSV export');
    toast('Exported documents.csv');
  };

  return (
    <>
      <PageHead title="Document register" actions={
        <>
          <Can page="documents" action="export"><button className="btn" onClick={doExport}>⬇ Export CSV</button></Can>
          <Can page="documents" action="upload"><button className="btn primary" onClick={() => setUploading(true)}>＋ Upload document</button></Can>
        </>
      }>
        Housing agreements, undertakings, reports and supporting documents. Files up to 2 MB are stored in full and can be downloaded.
      </PageHead>

      <div className="card">
        <div className="filters">
          <div style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Document or student" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label>Type</label><select value={type} onChange={(e) => setType(e.target.value)}><Options values={masterList('docType')} includeBlank /></select></div>
        </div>
        <div className="tbl-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Document</th><th>Type</th><th>Student</th><th>Uploaded</th><th>By</th><th>Size</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>📄 {d.fileKey ? <a className="rowlink" onClick={() => download(d)}>{d.name}</a> : d.name}</td>
                    <td>{d.type}</td>
                    <td><StudentLink id={d.studentId} /></td>
                    <td>{fmtDT(d.uploadedAt)}</td>
                    <td style={{ fontSize: '.83rem' }}>{d.by}</td>
                    <td>{d.size}</td>
                    <td><Can page="documents" action="delete"><button className="btn small danger" onClick={() => remove(d)}>Delete</button></Can></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No documents match.</Empty>}
        </div>
      </div>

      {uploading ? <DocumentForm onClose={() => setUploading(false)} /> : null}
    </>
  );
}

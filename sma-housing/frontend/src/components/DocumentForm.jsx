/* Upload a document against a student. Files up to 2 MB are stored in full;
   larger ones are recorded by name only. */

import { useRef, useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { fmtSize, readFileInput, uid } from '../lib/utils.js';
import { Modal, Options, StudentOptions } from './ui.jsx';

export default function DocumentForm({ studentId, onClose }) {
  const { db, user, commit, audit, toast } = useStore();
  const { masterList, activeStudents, storeFile } = useLookups();
  const students = activeStudents();
  const types = masterList('docType');
  const fileRef = useRef(null);
  const [sid, setSid] = useState(studentId || students[0]?.id || '');
  const [type, setType] = useState(types[0] || '');
  const [name, setName] = useState('');

  const save = async () => {
    const fileObj = await readFileInput(fileRef.current);
    const docName = fileObj ? fileObj.name : name.trim();
    if (!docName) return toast('Choose a file or enter a name');
    const key = fileObj ? storeFile(fileObj) : null;
    if (key) commit(['files']);
    const id = uid('DOC');
    db.documents.push({
      id, studentId: sid, type, name: docName, uploadedAt: new Date().toISOString(),
      by: user.name, size: fileObj ? fmtSize(fileObj.size) : '—', fileKey: key
    });
    commit(['documents']);
    audit('CREATE', 'document', id, docName);
    toast('Document saved');
    onClose();
  };

  return (
    <Modal title="Upload document" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="frow">
        <div><label>Student</label><select value={sid} onChange={(e) => setSid(e.target.value)}><StudentOptions students={students} /></select></div>
        <div><label>Document type</label><select value={type} onChange={(e) => setType(e.target.value)}><Options values={types} /></select></div>
      </div>
      <div><label>File (image or PDF, up to 2 MB stored in full)</label><input type="file" ref={fileRef} /></div>
      <div><label>Or record by name only</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. housing-agreement.pdf" /></div>
    </Modal>
  );
}

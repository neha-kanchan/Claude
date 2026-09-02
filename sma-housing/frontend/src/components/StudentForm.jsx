/* Add / edit a student, including the photo. The picture is resized in the
   browser and stored in the shared file store; the student row keeps the key. */

import { useRef, useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { PHOTO_MAX_DIM, PHOTO_MAX_UPLOAD, initials, readImageInput, todayStr, uid } from '../lib/utils.js';
import { Modal, Options } from './ui.jsx';

export default function StudentForm({ studentId, onClose, onSaved }) {
  const { db, commit, audit, toast } = useStore();
  const { student, masterList, photoUrl, storeFile } = useLookups();
  const existing = studentId ? student(studentId) : null;
  const currentPhoto = existing ? photoUrl(existing) : null;

  const [form, setForm] = useState({
    name: existing?.name || '',
    id: existing?.id || 'STU-' + (1000 + db.students.length + 1),
    email: existing?.email || '',
    phone: existing?.phone || '',
    college: existing?.college || masterList('college')[0] || '',
    status: existing?.status === 'Inactive' ? 'Inactive' : 'Active',
    emergency: existing?.emergency || ''
  });
  const [preview, setPreview] = useState(currentPhoto);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return setPreview(removePhoto ? null : currentPhoto);
    if (!/^image\//.test(f.type)) return toast('That file is not an image — choose a JPEG or PNG');
    if (f.size > PHOTO_MAX_UPLOAD) return toast('Image is larger than ' + PHOTO_MAX_UPLOAD / 1048576 + ' MB');
    setRemovePhoto(false);
    setPreview(URL.createObjectURL(f));
  };

  const toggleRemove = (e) => {
    const on = e.target.checked;
    setRemovePhoto(on);
    if (on && fileRef.current) fileRef.current.value = '';
    setPreview(on ? null : currentPhoto);
  };

  const setStudentPhoto = (s, key) => {
    if (s.photoKey && s.photoKey !== key && db.files[s.photoKey]) delete db.files[s.photoKey];
    s.photoKey = key || null;
  };

  const save = async () => {
    const data = {
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      college: form.college, status: form.status, emergency: form.emergency.trim()
    };
    if (!data.name) return toast('Name is required');

    let photo = null;
    try { photo = removePhoto ? null : await readImageInput(fileRef.current); }
    catch (e) { return toast(e.message); }
    const photoNote = photo ? ' · photo updated' : removePhoto ? ' · photo removed' : '';

    if (studentId) {
      const s = student(studentId);
      const wasActive = s.status;
      Object.assign(s, data);
      if (wasActive !== 'Inactive' && data.status === 'Inactive' && s.room) {
        const a = db.allocations.find((x) => x.studentId === studentId && !x.to);
        if (a) { a.to = todayStr(); a.note = (a.note ? a.note + ' · ' : '') + 'Deactivated'; }
        s.room = null; s.building = null;
        commit(['allocations']);
      }
      if (photo || removePhoto) { setStudentPhoto(s, photo ? storeFile(photo) : null); commit(['files']); }
      audit('UPDATE', 'student', studentId, 'Profile updated' + photoNote);
    } else {
      const nid = form.id.trim() || uid('STU');
      if (db.students.some((x) => x.id === nid)) return toast('Student ID already exists');
      const key = photo ? storeFile(photo) : null;
      db.students.push({ id: nid, ...data, building: null, room: null, joined: todayStr(), photoKey: key });
      if (key) commit(['files']);
      audit('CREATE', 'student', nid, 'Student added' + photoNote);
    }
    commit(['students']);
    toast('Student saved');
    onClose();
    onSaved?.();
  };

  return (
    <Modal title={studentId ? 'Edit student' : 'Add student'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save student</button></>}>
      <div className="photo-field">
        <div className="photo-preview">
          {preview ? <img src={preview} alt="Student photo" /> : <span>{initials(form.name) || '?'}</span>}
        </div>
        <div className="photo-field-body">
          <label>Student photo</label>
          <input type="file" accept="image/*" ref={fileRef} onChange={pickPhoto} />
          <p className="hint">JPEG or PNG up to {PHOTO_MAX_UPLOAD / 1048576} MB. The photo is resized to {PHOTO_MAX_DIM}px before it is stored with the record.</p>
          {currentPhoto ? (
            <label className="inline-check">
              <input type="checkbox" checked={removePhoto} onChange={toggleRemove} /> Remove the current photo
            </label>
          ) : null}
        </div>
      </div>

      <div className="frow">
        <div><label>Full name</label><input value={form.name} onChange={set('name')} /></div>
        <div><label>Student ID</label><input value={form.id} onChange={set('id')} disabled={Boolean(studentId)} /></div>
      </div>
      <div className="frow">
        <div><label>Email</label><input value={form.email} onChange={set('email')} /></div>
        <div><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
      </div>
      <div className="frow">
        <div><label>College / Major</label><select value={form.college} onChange={set('college')}><Options values={masterList('college')} /></select></div>
        <div><label>Status</label><select value={form.status} onChange={set('status')}><option>Active</option><option>Inactive</option></select></div>
      </div>
      <div><label>Emergency contact</label><input value={form.emergency} onChange={set('emergency')} /></div>
    </Modal>
  );
}

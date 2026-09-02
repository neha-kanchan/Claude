/* Room assignment: closes the running allocation and opens a new one. */

import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { todayStr, uid } from '../lib/utils.js';
import { Modal } from './ui.jsx';

export default function AllocateForm({ studentId, onClose }) {
  const { db, commit, audit, notify, toast } = useStore();
  const { student, room, bldg } = useLookups();
  const s = student(studentId);
  const [roomId, setRoomId] = useState(s.room || '');
  const [from, setFrom] = useState(todayStr());
  const [note, setNote] = useState('');

  const occupants = (rid) => db.students.filter((x) => x.status === 'Active' && x.room === rid).length;
  const freeRooms = db.rooms.filter((r) => r.active !== false).filter((r) => occupants(r.id) < r.capacity || r.id === s.room);

  const save = () => {
    if (roomId === (s.room || '')) return onClose();
    const running = db.allocations.find((x) => x.studentId === studentId && !x.to);
    if (running) {
      running.to = todayStr();
      running.note = (running.note ? running.note + ' · ' : '') + (roomId ? 'Moved to ' + roomId : 'Unassigned');
    }
    if (roomId) {
      const r = room(roomId);
      s.room = roomId; s.building = r.buildingId;
      db.allocations.push({ id: uid('ALC'), studentId, roomId, from, to: '', note: note.trim() || 'Room assignment' });
    } else { s.room = null; s.building = null; }
    commit(['students', 'allocations']);
    audit('ALLOCATE', 'student', studentId, roomId ? 'Assigned to room ' + roomId : 'Room unassigned');
    notify('room', 'Room change', `${s.name} ${roomId ? 'assigned to ' + roomId : 'unassigned from room'}.`);
    toast('Room assignment saved');
    onClose();
  };

  return (
    <Modal title={'Room assignment — ' + s.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Assign</button></>}>
      <div><label>Current room</label><div className="mono">{s.room || 'None'}</div></div>
      <div className="frow">
        <div>
          <label>New room</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">— Unassign —</option>
            {freeRooms.map((r) => (
              <option key={r.id} value={r.id}>{bldg(r.buildingId).name} · Room {r.number} ({occupants(r.id)}/{r.capacity})</option>
            ))}
          </select>
        </div>
        <div><label>Effective from</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      </div>
      <div><label>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the change" /></div>
    </Modal>
  );
}

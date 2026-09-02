import { useMemo, useRef, useState } from 'react';
import { useCollection, useCreate, useUpdate, useAuditAction } from '../api/queries';
import { Button, Card, Empty, Field, Input, PageHeader, Select, Tag, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../lib/usePermissions';
import { useMasterValues, ATTENDANCE_FALLBACK } from '../lib/domain';
import { downloadCsv, fmtDate, todayStr, uid } from '../lib/format';

/* Roll call is a daily, repetitive job, so it is built for speed: one keystroke
   per student, a search box that stays focused, and no modal in the way. */
export default function Attendance() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [date, setDate] = useState(todayStr);
  const [filter, setFilter] = useState('');
  const searchRef = useRef(null);

  const { data: students = [] } = useCollection('students');
  const { data: attendance = [], isLoading } = useCollection('attendance');
  const create = useCreate('attendance');
  const update = useUpdate('attendance');
  const audit = useAuditAction();

  const statuses = useMasterValues('attendanceStatus');
  const options = statuses.length ? statuses : ATTENDANCE_FALLBACK;

  const active = useMemo(() => students.filter((s) => s.status !== 'Inactive'), [students]);
  const forDate = useMemo(() => {
    const map = {};
    for (const a of attendance) if (a.date === date) map[a.studentId] = a;
    return map;
  }, [attendance, date]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return active;
    return active.filter((s) =>
      s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || String(s.room || '').toLowerCase().includes(q));
  }, [active, filter]);

  const counts = options.reduce((acc, st) => {
    acc[st] = active.filter((s) => forDate[s.id]?.status === st).length;
    return acc;
  }, {});
  const recorded = active.filter((s) => forDate[s.id]).length;

  async function setStatus(student, status) {
    const existing = forDate[student.id];
    const stamp = { status, by: user?.name || 'system', at: new Date().toISOString() };
    if (existing) await update.mutateAsync({ id: existing.id, ...stamp });
    else await create.mutateAsync({ id: uid('ATT'), date, studentId: student.id, note: '', ...stamp });
  }

  async function markAllPresent() {
    const missing = shown.filter((s) => !forDate[s.id]);
    if (!missing.length) return toast('Everyone shown already has a status');
    for (const s of missing) await setStatus(s, 'Present');
    audit.mutate({ action: 'ATTENDANCE', entity: 'rollcall', entityId: date, details: `Bulk marked ${missing.length} Present` });
    toast(`Marked ${missing.length} present`);
  }

  return (
    <>
      <PageHeader title="Attendance & Roll Call" subtitle={`${recorded} of ${active.length} recorded for ${fmtDate(date)}`}>
        {can('attendance', 'export') && (
          <Button onClick={() => downloadCsv(`attendance-${date}.csv`,
            active.map((s) => ({ s, a: forDate[s.id] })), [
              { header: 'Student ID', value: (r) => r.s.id },
              { header: 'Name', value: (r) => r.s.name },
              { header: 'Room', value: (r) => r.s.room },
              { header: 'Date', value: () => date },
              { header: 'Status', value: (r) => r.a?.status || 'Unknown' },
              { header: 'Recorded by', value: (r) => r.a?.by || '' }
            ])}>Export CSV</Button>
        )}
        {can('attendance', 'record') && <Button variant="primary" onClick={markAllPresent}>Mark shown present</Button>}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-[200px_1fr]">
        <Field label="Roll call date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Find a student" hint="Type a name, ID or room — the list filters as you type.">
          <Input ref={searchRef} value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…" autoFocus />
        </Field>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {options.map((st) => (
          <span key={st} className="card px-3 py-1.5 text-xs">
            <span style={{ color: 'var(--ink-soft)' }}>{st}: </span>
            <strong className="tnum">{counts[st] || 0}</strong>
          </span>
        ))}
      </div>

      {isLoading ? <Empty>Loading…</Empty> : (
        <Card bodyClass="p-0">
          <ul>
            {shown.map((s) => {
              const current = forDate[s.id]?.status;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-0"
                  style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{s.id} · Room {s.room || '—'}</div>
                  </div>
                  {can('attendance', 'record') ? (
                    <div className="flex flex-wrap gap-1">
                      {options.map((st) => (
                        <button key={st} type="button" onClick={() => setStatus(s, st)}
                          aria-pressed={current === st}
                          className="rounded-md px-2 py-1 text-xs font-semibold transition-colors"
                          style={current === st
                            ? { background: 'var(--pine)', color: '#fff' }
                            : { background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                          {st}
                        </button>
                      ))}
                    </div>
                  ) : <Tag>{current || 'Unknown'}</Tag>}
                </li>
              );
            })}
          </ul>
          {!shown.length && <Empty>No students match “{filter}”.</Empty>}
        </Card>
      )}
    </>
  );
}

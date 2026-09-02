import { Link } from 'react-router-dom';
import { useCollections } from '../api/queries';
import { PageHeader, StatCard, Card, Tag, Empty } from '../components/ui';
import { fmtDateTime, fmtDate, todayStr } from '../lib/format';
import { isOverdue, openMovements, useStudentIndex } from '../lib/domain';

const NEEDED = ['students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'calendar'];

export default function Dashboard() {
  const { data, isLoading } = useCollections(NEEDED);
  const { studentName } = useStudentIndex();
  const today = todayStr();

  const students = data.students.filter((s) => s.status !== 'Inactive');
  const todays = data.attendance.filter((a) => a.date === today);
  const present = todays.filter((a) => a.status === 'Present').length;
  const absent = todays.filter((a) => a.status === 'Absent').length;
  const out = openMovements(data.movements);
  const overdue = out.filter(isOverdue);
  const openViolations = data.violations.filter((v) => v.status !== 'Closed');
  const openComplaints = data.complaints.filter((c) => c.status !== 'Resolved');
  const pendingRequests = data.requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status));
  const upcoming = [...data.calendar].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  if (isLoading) return <Empty>Loading dashboard…</Empty>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Housing overview for ${fmtDate(today)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Residents" value={students.length} sub="Active students" />
        <StatCard label="Present today" value={present}
          sub={todays.length ? `${todays.length} of ${students.length} recorded` : 'Roll call not started'}
          tone="leaf" />
        <StatCard label="Absent today" value={absent} sub="Needs follow-up" tone={absent ? 'brick' : undefined} />
        <StatCard label="Currently out" value={out.length}
          sub={overdue.length ? `${overdue.length} overdue` : 'All within time'}
          tone={overdue.length ? 'brick' : undefined} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open violations" value={openViolations.length} tone={openViolations.length ? 'amber' : undefined} />
        <StatCard label="Open complaints" value={openComplaints.length} tone={openComplaints.length ? 'amber' : undefined} />
        <StatCard label="Pending requests" value={pendingRequests.length} tone={pendingRequests.length ? 'blue' : undefined} />
        <StatCard label="Rooms occupied" value={new Set(students.map((s) => s.room).filter(Boolean)).size} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Overdue returns (${overdue.length})`} bodyClass="p-0">
          {overdue.length === 0 ? <Empty>Nobody is overdue. </Empty> : (
            <ul>
              {overdue.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0"
                  style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{studentName(m.studentId)}</div>
                    <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {m.purpose || 'Exit'} · expected {fmtDateTime(m.expectedReturn)}
                    </div>
                  </div>
                  <Tag tone="brick">Overdue</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming calendar" bodyClass="p-0"
          action={<Link to="/calendar" className="text-xs font-semibold" style={{ color: 'var(--leaf)' }}>View all</Link>}>
          {upcoming.length === 0 ? <Empty>No upcoming entries.</Empty> : (
            <ul>
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0"
                  style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{fmtDate(e.date)}</div>
                  </div>
                  {e.type && <Tag>{e.type}</Tag>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Latest violations" bodyClass="p-0"
          action={<Link to="/violations" className="text-xs font-semibold" style={{ color: 'var(--leaf)' }}>View all</Link>}>
          {openViolations.length === 0 ? <Empty>No open violations.</Empty> : (
            <ul>
              {openViolations.slice(0, 5).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0"
                  style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{v.type}</div>
                    <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{studentName(v.studentId)} · {fmtDate(v.date)}</div>
                  </div>
                  <Tag>{v.status}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Complaints needing attention" bodyClass="p-0"
          action={<Link to="/complaints" className="text-xs font-semibold" style={{ color: 'var(--leaf)' }}>View all</Link>}>
          {openComplaints.length === 0 ? <Empty>Nothing outstanding.</Empty> : (
            <ul>
              {openComplaints.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0"
                  style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.title}</div>
                    <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {c.category}{c.sub ? ' · ' + c.sub : ''} · {studentName(c.studentId)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.priority && <Tag>{c.priority}</Tag>}
                    <Tag>{c.status}</Tag>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

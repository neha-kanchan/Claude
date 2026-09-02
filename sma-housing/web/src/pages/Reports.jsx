import { useMemo, useState } from 'react';
import { useCollections } from '../api/queries';
import { BarChart } from '../components/BarChart';
import { Button, Empty, Field, Input, PageHeader, StatCard } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { useBuildingIndex } from '../lib/domain';
import { downloadCsv, fmtDate, todayStr } from '../lib/format';

const NEEDED = ['students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'buildings'];

const tally = (rows, key) => {
  const counts = new Map();
  for (const r of rows) {
    const k = (typeof key === 'function' ? key(r) : r[key]) || 'Unspecified';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export default function Reports() {
  const { data, isLoading } = useCollections(NEEDED);
  const { can } = usePermissions();
  const { buildingName } = useBuildingIndex();
  const [date, setDate] = useState(todayStr);

  const active = data.students.filter((s) => s.status !== 'Inactive');
  const dayAttendance = data.attendance.filter((a) => a.date === date);

  const byBuilding = useMemo(() => tally(active, (s) => buildingName(s.building)), [active, buildingName]);
  const byCollege = useMemo(() => tally(active, 'college'), [active]);
  const byStatus = useMemo(() => tally(dayAttendance, 'status'), [dayAttendance]);
  const violationTypes = useMemo(() => tally(data.violations, 'type'), [data.violations]);
  const complaintCategories = useMemo(() => tally(data.complaints, 'category'), [data.complaints]);
  const requestTypes = useMemo(() => tally(data.requests, 'type'), [data.requests]);

  const present = dayAttendance.filter((a) => a.status === 'Present').length;
  const rate = dayAttendance.length ? Math.round((present / dayAttendance.length) * 100) : 0;
  const resolved = data.complaints.filter((c) => c.status === 'Resolved').length;

  if (isLoading) return <Empty>Loading reports…</Empty>;

  return (
    <>
      <PageHeader title="Reports" subtitle="Operational summary across the current environment">
        {can('reports', 'export') && (
          <Button onClick={() => downloadCsv(`housing-summary-${date}.csv`, [
            { metric: 'Active residents', value: active.length },
            { metric: 'Attendance recorded (' + date + ')', value: dayAttendance.length },
            { metric: 'Present', value: present },
            { metric: 'Attendance rate %', value: rate },
            { metric: 'Open violations', value: data.violations.filter((v) => v.status !== 'Closed').length },
            { metric: 'Open complaints', value: data.complaints.length - resolved },
            { metric: 'Complaints resolved', value: resolved },
            { metric: 'Pending requests', value: data.requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status)).length }
          ], [{ header: 'Metric', value: (r) => r.metric }, { header: 'Value', value: (r) => r.value }])}>
            Export summary
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 max-w-[220px]">
        <Field label="Attendance snapshot date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active residents" value={active.length} />
        <StatCard label={`Attendance rate`} value={`${rate}%`} sub={fmtDate(date)} tone={rate >= 90 ? 'leaf' : 'amber'} />
        <StatCard label="Open cases" value={
          data.violations.filter((v) => v.status !== 'Closed').length + (data.complaints.length - resolved)
        } sub="Violations + complaints" />
        <StatCard label="Currently out" value={data.movements.filter((m) => m.type === 'Exit' && !m.returnedAt).length} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <BarChart title="Residents by building" data={byBuilding} valueLabel="residents" />
        <BarChart title="Residents by college" data={byCollege} valueLabel="residents" />
        <BarChart title={`Attendance on ${fmtDate(date)}`} data={byStatus} valueLabel="students"
          emptyText="No roll call recorded for this date." />
        <BarChart title="Violations by type" data={violationTypes} valueLabel="violations" />
        <BarChart title="Complaints by category" data={complaintCategories} valueLabel="complaints" />
        <BarChart title="Requests by type" data={requestTypes} valueLabel="requests" />
      </div>
    </>
  );
}

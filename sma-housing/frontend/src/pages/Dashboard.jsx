import { Link, useNavigate } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store.jsx';
import { fmtD, fmtDT, todayStr } from '../lib/utils.js';
import { Empty, PageHead, PrintButton, StudentLink, Tag } from '../components/ui.jsx';

export default function Dashboard() {
  const { db } = useStore();
  const { bldg, student, occupancy, overdueMovements, latestActivity } = useLookups();
  const navigate = useNavigate();

  const occ = occupancy();
  const today = todayStr();
  const att = db.attendance.filter((a) => a.date === today);
  const present = att.filter((a) => a.status === 'Present').length;
  const absent = att.filter((a) => a.status === 'Absent').length;
  const openC = db.complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length;
  const maint = db.complaints.filter((c) => c.category === 'Maintenance' && !['Resolved', 'Closed'].includes(c.status)).length;
  const openV = db.violations.filter((v) => v.status !== 'Closed').length;
  const newR = db.requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status)).length;
  const overdue = overdueMovements();

  const vioByType = {};
  db.violations.forEach((v) => { vioByType[v.type] = (vioByType[v.type] || 0) + 1; });
  const maxV = Math.max(1, ...Object.values(vioByType));
  const upcoming = db.calendar.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);

  return (
    <>
      <PageHead title="Housing dashboard" actions={<PrintButton />}>
        {db.settings.semester ? db.settings.semester + ' · ' : ''}{fmtD(today)}
      </PageHead>

      {overdue.length ? (
        <div className="card" style={{ borderLeft: '4px solid var(--brick)', marginBottom: '1rem' }}>
          <strong style={{ color: 'var(--brick)' }}>
            ⏰ {overdue.length} student{overdue.length > 1 ? 's have' : ' has'} exceeded the approved return time
          </strong>
          <div style={{ fontSize: '.87rem', marginTop: '.4rem' }}>
            {overdue.map((m) => `${student(m.studentId).name} — expected ${fmtDT(m.expectedReturn)}`).join(' · ')}
          </div>
          <button className="btn small" style={{ marginTop: '.6rem' }} onClick={() => navigate('/movements')}>Open entry / exit log</button>
        </div>
      ) : null}

      <div className="grid kpis" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="v">{db.students.filter((s) => s.status === 'Active').length}</div>
          <div className="l">Resident students</div>
          <div className="s">{db.students.filter((s) => s.status !== 'Active').length} inactive</div>
        </div>
        <div className="kpi blue"><div className="v">{occ.roomsUsed}/{occ.rooms}</div><div className="l">Rooms occupied</div><div className="s">{occ.roomsFree} available</div></div>
        <div className="kpi"><div className="v">{occ.rate}%</div><div className="l">Occupancy rate</div><div className="s">{occ.occupied} of {occ.cap} beds</div></div>
        <div className="kpi amber"><div className="v">{openC}</div><div className="l">Open complaints</div><div className="s">{maint} maintenance</div></div>
        <div className="kpi brick"><div className="v">{openV}</div><div className="l">Open violations</div><div className="s">{db.violations.length} total this semester</div></div>
        <div className="kpi violet"><div className="v">{newR}</div><div className="l">New requests</div><div className="s">awaiting decision</div></div>
        <div className="kpi"><div className="v">{present}</div><div className="l">Present today</div><div className="s">{absent} absent · {att.length} recorded</div></div>
      </div>

      <div className="grid two-col">
        <div className="card">
          <h2>Today's roll call</h2>
          {att.length ? (
            <>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Building / Room</th><th>Status</th><th>Latest activity</th></tr></thead>
                  <tbody>
                    {att.slice(0, 8).map((a) => {
                      const s = student(a.studentId);
                      return (
                        <tr key={a.id}>
                          <td><StudentLink id={s.id} /></td>
                          <td>{bldg(s.building).name} · {s.room || '—'}</td>
                          <td><Tag>{a.status}</Tag></td>
                          <td style={{ fontSize: '.8rem', color: 'var(--ink-soft)' }}>{latestActivity(s.id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className="btn small" style={{ marginTop: '.7rem' }} onClick={() => navigate('/attendance')}>Full roll call →</button>
            </>
          ) : (
            <Empty>No roll call recorded for today yet.<br />
              <button className="btn primary small" style={{ marginTop: '.6rem' }} onClick={() => navigate('/attendance')}>Start roll call</button>
            </Empty>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2>Violations by type</h2>
            {Object.keys(vioByType).length ? Object.entries(vioByType).map(([t, n]) => (
              <div key={t} className={'barrow ' + (t === 'Smoking' ? 'amber' : t === 'Property damage' ? 'brick' : '')}>
                <span className="lbl">{t}</span>
                <span className="bar" style={{ width: (n / maxV) * 60 + '%' }} /> {n}
              </div>
            )) : <Empty>No violations recorded.</Empty>}
          </div>
          <div className="card">
            <h2>Upcoming on the calendar</h2>
            {upcoming.length ? upcoming.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: '.6rem', padding: '.35rem 0', fontSize: '.87rem' }}>
                <span className="mono" style={{ color: 'var(--ink-soft)', minWidth: 70 }}>{fmtD(e.date)}</span> {e.title}
              </div>
            )) : <Empty>Nothing scheduled.</Empty>}
            <Link className="btn small" style={{ marginTop: '.5rem' }} to="/calendar">Open calendar →</Link>
          </div>
        </div>
      </div>
    </>
  );
}

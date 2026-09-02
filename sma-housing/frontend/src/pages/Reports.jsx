import { useState } from 'react';
import { useStore, useLookups } from '../lib/store.jsx';
import { addDays, exportCSV, fmtD, fmtDT, hoursBetween, todayStr } from '../lib/utils.js';
import { Can, Empty, PageHead, StudentLink } from '../components/ui.jsx';

function Bars({ data, cls }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <Empty>No data in range.</Empty>;
  const max = Math.max(1, ...Object.values(data));
  return entries.map(([k, n]) => (
    <div key={k} className={'barrow ' + (cls || '')}>
      <span className="lbl">{k}</span>
      <span className="bar" style={{ width: (n / max) * 55 + '%' }} /> {n}
    </div>
  ));
}

export default function Reports() {
  const { db, audit, toast } = useStore();
  const { student } = useLookups();
  const [period, setPeriod] = useState('monthly');
  const [range, setRange] = useState({ from: addDays(todayStr(), -30), to: todayStr() });

  const applyPeriod = (p) => {
    setPeriod(p);
    const t = todayStr();
    let from = t;
    if (p === 'weekly') from = addDays(t, -7);
    if (p === 'monthly') from = addDays(t, -30);
    if (p === 'semester') from = db.settings.semesterStart || addDays(t, -120);
    setRange({ from, to: t });
  };

  const inR = (d) => d && d.slice(0, 10) >= range.from && d.slice(0, 10) <= range.to;
  const att = db.attendance.filter((a) => inR(a.date));
  const attBy = {}; att.forEach((a) => { attBy[a.status] = (attBy[a.status] || 0) + 1; });
  const vio = db.violations.filter((v) => inR(v.date));
  const vioBy = {}; vio.forEach((v) => { vioBy[v.type] = (vioBy[v.type] || 0) + 1; });
  const vioByB = {}; vio.forEach((v) => { const b = (v.location || '').split('·')[0].trim() || 'Unknown'; vioByB[b] = (vioByB[b] || 0) + 1; });
  const repeat = {}; vio.forEach((v) => { repeat[v.studentId] = (repeat[v.studentId] || 0) + 1; });
  const repeaters = Object.entries(repeat).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

  const cmp = db.complaints.filter((c) => inR(c.createdAt));
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const cst = {
    avgResp: avg(cmp.filter((c) => c.respondedAt).map((c) => hoursBetween(c.createdAt, c.respondedAt))),
    avgReso: avg(cmp.filter((c) => c.resolvedAt).map((c) => hoursBetween(c.createdAt, c.resolvedAt))),
    open: cmp.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length,
    closed: cmp.filter((c) => ['Resolved', 'Closed'].includes(c.status)).length
  };
  const cmpByCol = {}; cmp.forEach((c) => { const col = student(c.studentId).college || '—'; cmpByCol[col] = (cmpByCol[col] || 0) + 1; });
  const req = db.requests.filter((r) => inR(r.createdAt));
  const reqBy = {}; req.forEach((r) => { reqBy[r.status] = (reqBy[r.status] || 0) + 1; });
  const late = db.movements.filter((m) => m.late && inR(m.at));

  const exportAttendance = () => {
    exportCSV(`attendance-${range.from}-to-${range.to}.csv`, db.attendance.filter((a) => a.date >= range.from && a.date <= range.to)
      .map((a) => ({ date: a.date, student_id: a.studentId, student: student(a.studentId).name, status: a.status, note: a.note, by: a.by })));
    audit('EXPORT', 'report', 'attendance range', `${range.from} → ${range.to}`);
    toast('Exported attendance');
  };

  const exportViolations = () => {
    exportCSV('violations.csv', db.violations.map((v) => ({
      id: v.id, student_id: v.studentId, student: student(v.studentId).name, type: v.type, date: v.date,
      time: v.time, location: v.location, description: v.description, staff: v.staff, action: v.action, status: v.status
    })));
    audit('EXPORT', 'report', 'violations.csv', 'CSV export');
    toast('Exported violations.csv');
  };

  return (
    <>
      <PageHead title="Reports" actions={<button className="btn" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>}>
        Daily, weekly, monthly and semester views across attendance, violations, complaints and requests.
      </PageHead>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filters" style={{ margin: 0 }}>
          <div>
            <label>Report period</label>
            <select value={period} onChange={(e) => applyPeriod(e.target.value)}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option><option value="semester">Semester</option>
            </select>
          </div>
          <div><label>From</label><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
          <div><label>To</label><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        </div>
      </div>

      <div className="grid two-col">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card">
            <h2>Attendance summary · {fmtD(range.from)} – {fmtD(range.to)}</h2>
            <Bars data={attBy} />
            <div style={{ marginTop: '.6rem' }}>
              <Can page="reports" action="export"><button className="btn small" onClick={exportAttendance}>⬇ Export attendance</button></Can>
            </div>
          </div>
          <div className="card">
            <h2>Violations</h2>
            <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', marginBottom: '.5rem' }}>Most common types</p>
            <Bars data={vioBy} cls="brick" />
            <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', margin: '.8rem 0 .5rem' }}>By building</p>
            <Bars data={vioByB} cls="amber" />
            <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', margin: '.8rem 0 .5rem' }}>Students with repeated violations</p>
            {repeaters.length ? (
              <table>
                <thead><tr><th>Student</th><th>Count</th></tr></thead>
                <tbody>{repeaters.map(([sid, n]) => <tr key={sid}><td><StudentLink id={sid} /></td><td>{n}</td></tr>)}</tbody>
              </table>
            ) : <Empty>No repeat violations in range.</Empty>}
            <div style={{ marginTop: '.6rem' }}>
              <Can page="reports" action="export"><button className="btn small" onClick={exportViolations}>⬇ Export violations</button></Can>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <div className="card">
            <h2>Complaints</h2>
            <div className="grid kpis" style={{ marginBottom: '.8rem' }}>
              <div className="kpi blue"><div className="v">{cst.avgResp ?? '—'}h</div><div className="l">Avg response</div></div>
              <div className="kpi"><div className="v">{cst.avgReso ?? '—'}h</div><div className="l">Avg resolution</div></div>
              <div className="kpi amber"><div className="v">{cst.open}</div><div className="l">Open</div></div>
              <div className="kpi"><div className="v">{cst.closed}</div><div className="l">Closed</div></div>
            </div>
            <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', marginBottom: '.5rem' }}>By academic college / major</p>
            <Bars data={cmpByCol} cls="blue" />
          </div>
          <div className="card"><h2>Requests</h2><Bars data={reqBy} cls="blue" /></div>
          <div className="card">
            <h2>Late returns</h2>
            {late.length ? late.map((m) => (
              <div key={m.id} style={{ fontSize: '.87rem', padding: '.35rem 0' }}>
                {student(m.studentId).name} — {fmtDT(m.returnedAt)} ({hoursBetween(m.expectedReturn, m.returnedAt)}h late)
              </div>
            )) : <Empty>No late returns in range.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}

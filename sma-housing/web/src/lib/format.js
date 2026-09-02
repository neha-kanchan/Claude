export const todayStr = () => new Date().toISOString().slice(0, 10);
export const nowTime = () => new Date().toTimeString().slice(0, 5);

export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtSize = (b) => {
  const n = Number(b);
  if (!n) return '—';
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
};

export const hoursBetween = (a, b) => Math.round(((new Date(b) - new Date(a)) / 36e5) * 10) / 10;

export const initials = (name) =>
  String(name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export const uid = (prefix) => `${prefix || 'ID'}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

/* Status vocabulary shared by every page, so one status never gets two colours. */
export const TAG_TONE = {
  Present: 'green', Absent: 'brick', Hospital: 'violet', 'Official Leave': 'blue',
  'Weekend Leave': 'amber', Unknown: 'grey',
  Open: 'brick', Investigation: 'amber', Decision: 'blue', Closed: 'grey',
  Submitted: 'blue', Assigned: 'violet', 'In Progress': 'amber', Resolved: 'green',
  'Under Review': 'amber', Approved: 'green', Completed: 'grey', Rejected: 'brick',
  Active: 'green', Inactive: 'grey', High: 'brick', Medium: 'amber', Low: 'blue'
};

export const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* Client-side CSV export. Used by every page's Export action. */
export function downloadCsv(filename, rows, columns) {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

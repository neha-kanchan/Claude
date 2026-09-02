/* Formatting, ids, CSV export and the student-photo pipeline.
   No escaping helpers here - React escapes everything it renders. */

export const uid = (p) => (p || 'ID') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const fmtD = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const hoursBetween = (a, b) => Math.round(((new Date(b) - new Date(a)) / 36e5) * 10) / 10;
export const addDays = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
export const initials = (n) => String(n || '').trim().split(/\s+/).map((x) => x[0] || '').slice(0, 2).join('').toUpperCase();
export const fmtSize = (b) => (!b ? '—' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

export const TAG_COLOR = {
  Present: 'green', Absent: 'brick', Hospital: 'violet', 'Official Leave': 'blue', 'Weekend Leave': 'amber', Unknown: 'grey',
  Open: 'brick', Investigation: 'amber', Decision: 'blue', Closed: 'grey',
  Submitted: 'blue', Assigned: 'violet', 'In Progress': 'amber', Resolved: 'green',
  'Under Review': 'amber', Approved: 'green', Completed: 'grey', Rejected: 'brick',
  Active: 'green', Inactive: 'grey', High: 'brick', Medium: 'amber', Low: 'blue'
};

export function exportCSV(filename, rows) {
  if (!rows.length) return false;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => {
    let v = r[c] == null ? '' : String(r[c]);
    if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }).join(','))).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  return true;
}

/* ---------------- files ---------------- */

export function readFileInput(inputEl) {
  return new Promise((resolve) => {
    const f = inputEl && inputEl.files && inputEl.files[0];
    if (!f) return resolve(null);
    if (f.size > 2 * 1024 * 1024) return resolve({ name: f.name, size: f.size, data: null });
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, size: f.size, mime: f.type, data: r.result });
    r.onerror = () => resolve(null);
    r.readAsDataURL(f);
  });
}

/* Student photos: downscaled in the browser so a phone snapshot does not travel
   to the database at full size. */
export const PHOTO_MAX_DIM = 480;
export const PHOTO_MAX_UPLOAD = 8 * 1024 * 1024;
const PHOTO_QUALITY = 0.85;

export function readImageInput(inputEl, maxDim) {
  const max = maxDim || PHOTO_MAX_DIM;
  return new Promise((resolve, reject) => {
    const f = inputEl && inputEl.files && inputEl.files[0];
    if (!f) return resolve(null);
    if (!/^image\//.test(f.type)) return reject(new Error('That file is not an image — choose a JPEG or PNG'));
    if (f.size > PHOTO_MAX_UPLOAD) return reject(new Error('Image is larger than ' + PHOTO_MAX_UPLOAD / 1048576 + ' MB'));
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read that file'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // flatten transparency for JPEG
        ctx.drawImage(img, 0, 0, w, h);
        const data = c.toDataURL('image/jpeg', PHOTO_QUALITY);
        const base64 = data.slice(data.indexOf(',') + 1);
        resolve({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', size: Math.round(base64.length * 3 / 4), data });
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  });
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || 'document';
  a.click();
}

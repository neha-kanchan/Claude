/* The original dependency-free client, after the move to per-record writes and
   server-held file bodies. It is still shipped and still has to work. */
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3200';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '/legacy/', { waitUntil: 'networkidle' });
ok(await page.locator('#loginScreen').isVisible(), 'legacy login screen renders');

await page.fill('#loginUser', 'amal');
await page.fill('#loginPass', 'admin123');
await page.click('#loginBtn');
await page.waitForSelector('#app.on', { timeout: 20000 });
ok(true, 'legacy sign-in works');

// data seeded by the server should be visible without the client seeding it
await page.waitForTimeout(1500);
const navCount = await page.locator('#nav a, #nav button, #nav div[onclick]').count();
ok(await page.locator('#content').innerText().then((t) => t.length > 50), 'dashboard content renders');

// exercise a write through the new per-record path
await page.evaluate(() => window.go('students'));
await page.waitForTimeout(1200);
const studentRows = await page.locator('#content table tbody tr').count();
ok(studentRows > 0, `student list shows server-seeded rows (${studentRows})`);

// a real mutation: flip a student's status, which goes through save('students')
const wrote = await page.evaluate(async () => {
  const s = DB.students[0];
  const before = s.status;
  s.status = before === 'Active' ? 'Inactive' : 'Active';
  save('students');
  await new Promise((r) => setTimeout(r, 1500));
  const res = await api('/students/' + encodeURIComponent(s.id));
  const server = await res.json();
  return { sent: s.status, stored: server.status };
});
ok(wrote.sent === wrote.stored, `per-record write reached the database (${wrote.stored})`);

// the diff engine must not delete records it never touched
const survived = await page.evaluate(async () => {
  await api('/students', { method: 'POST', body: JSON.stringify({ id: 'STU-OTHER', name: 'Added elsewhere' }) });
  DB.students[1].phone = '0500000999';
  save('students');
  await new Promise((r) => setTimeout(r, 1500));
  const res = await api('/students/STU-OTHER');
  return res.status;
});
ok(survived === 200, "another client's record survives a legacy save");

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

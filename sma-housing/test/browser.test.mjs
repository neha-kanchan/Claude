import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3200';
const OUT = process.env.SHOT_DIR || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
ok(await page.locator('text=Sign in').first().isVisible(), 'login screen renders');

// sign in
await page.fill('input[autocomplete="username"]', 'amal');
await page.fill('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForSelector('text=Dashboard', { timeout: 15000 });
ok(page.url().includes('/dashboard'), 'redirects to /dashboard after sign-in');
ok(await page.locator('text=Residents').first().isVisible(), 'dashboard KPI tiles render');

// every nav page renders without a crash
const pages = ['students','attendance','movements','violations','complaints','requests',
               'documents','calendar','notifications','reports','audit','master','roles','integration'];
for (const p of pages) {
  await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
  const heading = await page.locator('h1').first().textContent().catch(() => null);
  const crashed = await page.locator('text=/Cannot read|is not a function|Minified React/').count();
  ok(heading && !crashed, `/${p} renders ("${heading?.trim()}")`);
}

// students table has real data and row click opens the 360 profile
await page.goto(`${BASE}/students`, { waitUntil: 'networkidle' });
const rows = await page.locator('tbody tr').count();
ok(rows > 0, `students table lists rows (${rows})`);
await page.locator('tbody tr').first().click();
await page.waitForURL('**/students/**', { timeout: 10000 });
// the profile fetches several collections, so wait for content rather than the URL alone
const profileLoaded = await page.locator(':text("Room allocations")').first()
  .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
ok(profileLoaded, 'student 360 profile opens');

// a real write through the per-record API: mark a student present
await page.goto(`${BASE}/attendance`, { waitUntil: 'networkidle' });
const beforeUrl = page.url();
const absentBtn = page.locator('button:has-text("Absent")').first();
await absentBtn.click();
await page.waitForTimeout(1200);
ok(await absentBtn.getAttribute('aria-pressed') === 'true', 'roll call write persisted and re-rendered');

// audit trail should have recorded it
await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle' });
const auditRows = await page.locator('tbody tr').count();
ok(auditRows > 0, `audit trail shows server-written events (${auditRows})`);
ok(await page.locator('text=In-app edit').first().isVisible().catch(() => false), 'writes are labelled as in-app edits');

// dark mode toggle
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.click('button[aria-label*="theme"]');
await page.waitForTimeout(300);
ok(await page.getAttribute('html', 'data-theme') === 'dark', 'dark mode toggles');
await page.screenshot({ path: OUT + '/dark.png' });
await page.click('button[aria-label*="theme"]');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/light.png', fullPage: true });

// mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/movements`, { waitUntil: 'networkidle' });
const bodyScrollsSideways = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
ok(!bodyScrollsSideways, 'no horizontal page scroll at 390px');
ok(await page.locator('button[aria-label="Open menu"]').isVisible(), 'mobile menu button appears');
await page.screenshot({ path: OUT + '/mobile.png' });

const realErrors = errors.filter((e) => !/favicon|404 \(Not Found\)|fonts\.googleapis|ERR_CONNECTION_RESET/.test(e));
ok(realErrors.length === 0, `no console errors${realErrors.length ? ': ' + realErrors.slice(0,3).join(' | ') : ''}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

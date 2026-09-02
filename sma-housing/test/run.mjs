/* Boots a server on a scratch database, runs every suite against it, tears down.
   Usage: npm test          (API suites only - no browser needed)
          npm run test:all  (adds the browser suite; needs playwright installed) */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3399;
const BASE_URL = `http://localhost:${PORT}`;
const withBrowser = process.argv.includes('--browser');
const dbFile = path.join(root, 'db', 'test-run.sqlite');

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try { rmSync(dbFile + suffix); } catch { /* fresh run */ }
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT, SQLITE_FILE: dbFile, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'inherit']
});

const stop = (code) => { server.kill(); process.exit(code); };
process.on('SIGINT', () => stop(130));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE_URL + '/api/health');
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join('test', file)], {
      cwd: root, env: { ...process.env, BASE_URL }, stdio: 'inherit'
    });
    child.on('exit', (code) => resolve(code || 0));
  });
}

await waitForServer();

const suites = ['api-writes.test.mjs', 'api-files.test.mjs'];
if (withBrowser) suites.push('browser.test.mjs', 'legacy.test.mjs');

let failed = 0;
for (const suite of suites) {
  console.log(`\n── ${suite} ──`);
  failed += await runSuite(suite);
}

console.log(failed ? '\nSOME SUITES FAILED' : '\nAll suites passed.');
stop(failed ? 1 : 0);

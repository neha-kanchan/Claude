import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './src/db2.js';
import { buildRouter } from './src/routes.js';
import { seedIdentities, seedDemoData } from './src/seed2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

/* Two frontends ship with this server:
     web/dist  - the React client (npm --prefix web run build)
     public/   - the dependency-free client, which needs no build step
   The built client is served when it exists, and the original stays reachable
   at /legacy, so a checkout with nothing installed still runs. */
const REACT_DIR = path.join(__dirname, 'web', 'dist');
const LEGACY_DIR = path.join(__dirname, 'public');
const hasReactBuild = fs.existsSync(path.join(REACT_DIR, 'index.html'));
const primaryDir = hasReactBuild ? REACT_DIR : LEGACY_DIR;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.use('/api', buildRouter());

// Hashed asset filenames are immutable; index.html must never be cached.
app.use(express.static(primaryDir, {
  setHeaders: (res, filePath) => {
    if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.use('/legacy', express.static(LEGACY_DIR));
app.get('/legacy*', (_req, res) => res.sendFile(path.join(LEGACY_DIR, 'index.html')));

// SPA fallback: client-side routes are served the shell, unknown API paths are not.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(primaryDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initDb()
  .then(async (driver) => {
    for (const env of ['prod', 'test']) {
      await seedIdentities(env);
      // Production gets the demo dataset on a fresh database; Non-Production
      // starts empty so it can be filled by a clone from Production.
      if (env === 'prod') await seedDemoData(env);
    }
    app.listen(port, () => {
      console.log(`SMA Housing System (${driver.kind}) running on http://localhost:${port}`);
      console.log(hasReactBuild
        ? '  client: web/dist (React)   ·   original client at /legacy'
        : '  client: public/ (no build step)   ·   run "npm run build:web" for the React client');
    });
  })
  .catch((error) => { console.error('Unable to start:', error); process.exit(1); });

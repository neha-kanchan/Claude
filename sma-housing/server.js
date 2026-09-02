import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './src/db2.js';
import { buildRouter } from './src/routes.js';
import { seedIdentities } from './src/seed2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.use('/api', buildRouter());
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initDb()
  .then(async (driver) => {
    await seedIdentities('prod');
    await seedIdentities('test');
    app.listen(port, () => console.log(`SMA Housing System (${driver.kind}) running on http://localhost:${port}`));
  })
  .catch((error) => { console.error('Unable to start:', error); process.exit(1); });

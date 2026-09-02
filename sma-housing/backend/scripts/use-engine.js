#!/usr/bin/env node
/**
 * Switch the Prisma datasource between SQLite and PostgreSQL.
 *
 *   npm run db:sqlite      -> provider = "sqlite"
 *   npm run db:postgres    -> provider = "postgresql"
 *
 * Migration history is per-engine, so after switching you create a fresh one
 * for the new database:  npx prisma migrate dev --name init
 * Data does not travel with the switch - export a JSON backup from the app
 * first (Integration & API -> Download backup) if you need to carry it over.
 */

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const engines = { sqlite: 'sqlite', postgres: 'postgresql', postgresql: 'postgresql' };
const asked = (process.argv[2] || '').toLowerCase();
const provider = engines[asked];

if (!provider) {
  console.error(`Usage: node scripts/use-engine.js <sqlite|postgres>`);
  process.exit(1);
}

const schemaPath = join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');
const updated = schema.replace(/provider = "(sqlite|postgresql)"/, `provider = "${provider}"`);

if (updated === schema) {
  console.log(`Already using ${provider}.`);
  process.exit(0);
}

writeFileSync(schemaPath, updated);
console.log(`Prisma datasource is now ${provider}.`);
console.log('Next:');
console.log(`  1. Point DATABASE_URL at your ${provider === 'sqlite' ? 'file (file:./dev.db)' : 'PostgreSQL server'} in .env`);
console.log('  2. rm -rf prisma/migrations && npx prisma migrate dev --name init');
console.log('  3. npm run build && npm start');

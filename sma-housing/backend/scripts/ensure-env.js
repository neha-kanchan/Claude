#!/usr/bin/env node
/**
 * Creates backend/.env on a fresh checkout (.env is never committed), copying
 * .env.example and generating a real SESSION_SECRET so nobody ships the
 * placeholder by accident. Leaves an existing .env untouched.
 */

const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');

const dir = join(__dirname, '..');
const envPath = join(dir, '.env');
const examplePath = join(dir, '.env.example');

if (existsSync(envPath)) {
  console.log('.env already exists - leaving it alone.');
  process.exit(0);
}
if (!existsSync(examplePath)) {
  console.error('.env.example is missing; cannot create .env.');
  process.exit(1);
}

copyFileSync(examplePath, envPath);
const secret = randomBytes(32).toString('hex');
writeFileSync(envPath, readFileSync(envPath, 'utf8').replace('SESSION_SECRET=change-this-to-a-long-random-string', `SESSION_SECRET=${secret}`));

console.log('Created backend/.env with a generated SESSION_SECRET (SQLite at prisma/dev.db).');

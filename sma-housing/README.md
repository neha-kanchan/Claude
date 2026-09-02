# SMA Housing System — Student Housing Management

A full-stack, hostable web application: Node.js/Express REST API + PostgreSQL (or zero-config SQLite) + single-page frontend. Covers the complete requirements set: dashboard KPIs, student 360° profiles, daily roll call, entry/exit with overdue alerts, violations, complaints (incl. maintenance sub-types), requests, documents with stored file bodies, student photos, calendar, notifications, master data with date ranges, role-based page **and** button permissions enforced server-side, full audit trail, JSON backups, and separate Production / Non-Production environments with one-click cloning.

---

## 1. Quick start (2 minutes — nothing to install, nothing to download)

All dependencies are **already bundled** in this package, and the database engine (SQLite) is **built into Node.js itself** — so there is no `npm install` step and no admin rights needed. Requires **Node.js 24+** (the portable ZIP version works fine).

**Windows:** double-click `start-windows.cmd`, or in a terminal:

```powershell
cd path\to\sma-housing
node server.js
```

**Mac / Linux:**

```bash
cd path/to/sma-housing
node server.js
# → SMA Housing System (sqlite) running on http://localhost:3000
```

(`npm install` / `npm start` still work too, for developers who prefer them. On Node 22 run `node --experimental-sqlite server.js`.)

Open **http://localhost:3000** and sign in:

| Username | Password | Role |
|---|---|---|
| `amal` | `admin123` | Administrator (everything) |
| `sami` | `demo123` | Housing Supervisor (daily operations) |
| `ghada` | `demo123` | Security Officer (gate + roll call) |
| `vera` | `demo123` | Viewer (read-only) |

On first sign-in the app creates demo data (students, rooms, cases…) and saves it to the database. Use **Admin → Integration & API → Reset demo data** any time to start over. Change the demo passwords from the Roles & Permissions page before real use.

With no `DATABASE_URL` set, data is stored in `db/housing.sqlite` — fine for evaluation and small deployments.

## 2. Connecting PostgreSQL (production)

Set `DATABASE_URL` in `.env` (copy `.env.example`):

```
DATABASE_URL=postgres://user:password@host:5432/smahousing
```

Works unchanged with any managed Postgres: **Azure Database for PostgreSQL**, AWS RDS, Supabase, Neon, Railway… Tables are created automatically at startup (portable SQL, no migration tool needed). For providers that require TLS, append `?sslmode=require`.

## 3. Configuration (`.env`)

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | Postgres connection string; empty → SQLite file | *(empty)* |
| `SESSION_SECRET` | HMAC secret for login tokens — **change in production** | dev value |
| `AUTH_MODE` | `local` (username/password) or `entra` (Microsoft SSO) | `local` |
| `ENTRA_TENANT_ID` | Entra directory (tenant) ID | — |
| `ENTRA_API_AUDIENCE` | Application ID URI / client ID of the API app registration | — |

## 4. Microsoft Entra ID SSO (`AUTH_MODE=entra`)

The server verifies Microsoft-issued JWTs against your tenant's JWKS (issuer `https://login.microsoftonline.com/<tenant>/v2.0`) — the standard two-app-registration pattern:

1. **API registration** — expose an API scope; its Application ID URI is `ENTRA_API_AUDIENCE`. Define app roles `Housing.Admin`, `Housing.Staff`, `Housing.ReadOnly` and assign users/groups.
2. **SPA registration** — a public client that acquires tokens for that scope (wire MSAL.js in the frontend, or put the app behind Azure App Service Easy Auth).

Users are auto-provisioned on first sign-in; Entra app roles map to Administrator / Housing Supervisor / Viewer. Local login is disabled in this mode.

## 5. Environments: Production & Non-Production

Every record carries an environment tag, and the API scopes each request with the `X-Env: prod|test` header — one deployment, two isolated datasets. In the UI, the header dropdown switches environments; **Integration & API → Clone Production → Non-Prod** copies all production data into the test environment for safe experimentation (Administrator only).

## 6. REST API (for integrations)

All endpoints are under `/api`, JSON in/out, authenticated with `Authorization: Bearer <token>` (from `POST /api/auth/login` in local mode, or an Entra token in SSO mode). Add `X-Env: test` to target Non-Production.

```
GET    /api/students                 list (any field as query filter, e.g. ?college=Engineering)
GET    /api/students/SMA2026001      one record
POST   /api/students                 create (Admissions push)
PUT    /api/students/SMA2026001      update (merge)
DELETE /api/students/SMA2026001      delete
```

The same verbs work for `attendance`, `movements` (gate/card-access push), `violations`, `complaints`, `requests`, `documents`, `calendar`, `master`, … Plus:

```
POST /api/auth/login                       {username,password} → {token,user}
GET  /api/bootstrap                        everything the UI needs in one call
PUT  /api/sync/<collection>                batch upsert+delete (diffed & audited server-side)
GET  /api/files/<key>/download             stored file body (agreements, evidence…)
GET  /api/admin/backup                     full JSON dump of the current environment
POST /api/admin/clone-prod-to-test         copy prod → test
POST /api/admin/reset-demo                 wipe current environment & reseed identities
POST /api/users/<id>/password              admin sets a user's username/password
GET  /api/health                           liveness + db/auth mode
```

### Student photos

A student record carries an optional photo. **Add student** and **Edit profile** have a photo field with a live preview; the picture is downscaled in the browser (longest edge 480px, JPEG) before it is stored, so a phone snapshot arrives as ~40–80 KB instead of several megabytes. Images larger than 8 MB and non-image files are rejected at the form.

The photo body is kept in the same `files` store as document uploads, and the student row references it by key:

```
GET  /api/students/SMA2026001     → { ..., "photoKey": "FILE-3KD9Q" }
GET  /api/files/FILE-3KD9Q/download   the photo body
POST /api/students                create/update with "photoKey": "<key>"  (null clears it)
```

Photos appear as a thumbnail in the student list and on the student's 360° record; students without one keep the initials avatar. Replacing or removing a photo deletes the file it replaced, so the store does not accumulate orphans. Every photo change is audited with the profile update.

`students.photo_key` is added to existing databases automatically on start-up, so an installation created before this feature keeps its data and gains the column.

Every write — UI or API — is recorded in the audit log with user, role, action, entity and timestamp. Role permissions are enforced on the server for every route (a read-only role gets `403` even if it crafts raw requests).

## 7. Deploying

Any Node host works — Azure App Service, a Linux VM with pm2/systemd, Docker, Render, Railway…

```bash
# example: plain VM (dependencies already bundled; npm ci --omit=dev also works)
SESSION_SECRET=$(openssl rand -hex 32) DATABASE_URL=postgres://... PORT=80 node server.js
```

Notes:
- Put TLS in front (App Service/ingress/nginx). The app itself is a single stateless process; scale-out is safe when using Postgres.
- Backups: use your database's native backup (e.g. Azure automated backups) **plus** the in-app JSON export for portable snapshots.
- `db/` and `.env` are already git-ignored.

## 8. Project layout

```
server.js            Express app: security headers, static frontend, /api router
src/routes.js        All API routes (auth, bootstrap, sync, REST, files, admin)
src/auth.js          Local JWT sessions + Entra ID token verification
src/perms.js         Server-side role/permission checks (page + action level)
src/db2.js           Database adapter — same code drives PostgreSQL and SQLite
src/seed2.js         Roles/users identity seed + default permission sets
db/schema.sql        Normalized schema (one table per entity, env column on each)
public/              Frontend SPA (index.html, app.js, styles.css)
```

## 9. Verified

The build ships with two test suites that were run against **both** SQLite and PostgreSQL:
- 31 API assertions: auth, bootstrap, sync diffing, REST CRUD + filters, file download, per-role 403s, env isolation, clone, backup, password rotation, audit.
- Full browser-flow suite (jsdom): sign-in, first-run seeding, all 15 pages render, UI mutations persist to the database, client actions audited, environment switching.

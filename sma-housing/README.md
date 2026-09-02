# SMA Housing System — Student Housing Management

A full-stack, hostable web application: Node.js/Express REST API + PostgreSQL (or zero-config SQLite) + single-page frontend. Covers the complete requirements set: dashboard KPIs, student 360° profiles, daily roll call, entry/exit with overdue alerts, violations, complaints (incl. maintenance sub-types), requests, documents with stored file bodies, student photos, calendar, notifications, master data with date ranges, role-based page **and** button permissions enforced server-side, full audit trail, JSON backups, and separate Production / Non-Production environments with one-click cloning.

---

## 1. Quick start

Requires **Node.js 22.5+** (24+ recommended). The database engine (SQLite) is built into
Node itself, so nothing external needs installing for a local run.

```bash
npm install          # server dependencies
node server.js
# → SMA Housing System (sqlite) running on http://localhost:3000
```

On Node 22 the built-in SQLite is still behind a flag: `node --experimental-sqlite server.js`.

**Windows:** `start-windows.cmd` launches the server once `npm install` has been run.

Open **http://localhost:3000** and sign in:

| Username | Password | Role |
|---|---|---|
| `amal` | `admin123` | Administrator (everything) |
| `sami` | `demo123` | Housing Supervisor (daily operations) |
| `ghada` | `demo123` | Security Officer (gate + roll call) |
| `vera` | `demo123` | Viewer (read-only) |

A fresh database is seeded on first start: roles, users, and a demo dataset (24 students
across three buildings, rooms, cases, calendar). Non-Production starts empty so it can be
filled by a clone from Production. **Admin → Integration & API → Reset demo data** wipes
and reseeds the current environment. Change the demo passwords from Roles & Users before
any real use.

With no `DATABASE_URL` set, data lives in `db/housing.sqlite` — fine for evaluation and
small deployments.

### The two frontends

| | Served at | Needs a build? |
|---|---|---|
| **React client** (`web/`) — React 19, Vite, TanStack Query + Table, Tailwind 4 | `/` once built | yes |
| **Original client** (`public/`) — one file of vanilla JS, no toolchain | `/legacy`, and `/` when no build exists | no |

```bash
npm run install:web     # one-time: install the frontend toolchain
npm run build:web       # emits web/dist; the server then serves it at /
npm run dev:web         # Vite dev server on :5173, proxying /api to :3000
```

The server serves `web/dist` when it exists and falls back to `public/` when it does not, so
a checkout with only the server dependencies installed still runs a complete app. Both
clients talk to the same REST API and can be used side by side.

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
| `FILE_VIEW_TTL_MINUTES` | Lifetime of the signed ticket that lets `<img>` read a stored file | `10` |
| `SQLITE_FILE` | Override the SQLite path (used by the test runner) | `db/housing.sqlite` |

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
GET  /api/bootstrap                        every collection in one call (files: metadata only)
PUT  /api/sync/<collection>                whole-collection replace — see the warning below
GET  /api/files/<key>/download             stored file body, as an attachment (bearer token)
GET  /api/files/view-token                 short-lived ticket for reading file bodies
GET  /api/files/<key>/view?t=<ticket>      inline body for <img src>, authorised by the ticket
GET  /api/admin/backup                     full JSON dump of the current environment
POST /api/admin/clone-prod-to-test         copy prod → test
POST /api/admin/reset-demo                 wipe current environment & reseed
POST /api/users/<id>/password              admin sets a user's username/password
GET  /api/health                           liveness + db/auth mode
```

### Writing records

**Write one record at a time.** `PUT /api/sync/<collection>` treats its payload as the
whole truth for that collection and **deletes every record missing from it**, so two
clients using it concurrently will erase each other's work. It remains for bulk import and
for `settings` (a single document), but both frontends now write through
`POST`/`PUT`/`DELETE` on individual records, and integrations should too.

### File bodies

Bodies never travel with collection data: `/api/bootstrap` and the generic `files` reads
return metadata only (`id`, `name`, `mime`, `size`). A body is fetched deliberately, through
`/download` with a bearer token, or through `/view` with a ticket from
`/api/files/view-token`. The ticket exists because `<img src>` cannot send an
`Authorization` header; it grants read-only access, expires in minutes, and names the
environment it may read, so a Non-Production ticket cannot reach Production files.
Backups still include bodies.

### Student photos

A student record carries an optional photo. **Add student** and **Edit profile** have a photo field with a live preview; the picture is downscaled in the browser (longest edge 480px, JPEG) before it is stored, so a phone snapshot arrives as ~40–80 KB instead of several megabytes. Images larger than 8 MB and non-image files are rejected at the form.

The photo body is kept in the same `files` store as document uploads, and the student row references it by key:

```
GET  /api/students/SMA2026001            → { ..., "photoKey": "FILE-3KD9Q" }
GET  /api/files/FILE-3KD9Q/download      the photo body (bearer token)
GET  /api/files/FILE-3KD9Q/view?t=…      the same body, for <img src>
POST /api/students                       create/update with "photoKey": "<key>"  (null clears it)
```

Photos are loaded on demand through the view route rather than being sent with the student list, and appear as a thumbnail in the student list and on the student's 360° record; students without one keep the initials avatar. Replacing or removing a photo deletes the file it replaced, so the store does not accumulate orphans. Every photo change is audited with the profile update.

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
server.js            Express app: security headers, static frontends, /api router
src/routes.js        All API routes (auth, bootstrap, REST, files, admin)
src/auth.js          Local JWT sessions, Entra ID verification, file view tickets
src/perms.js         Server-side role/permission checks (page + action level)
src/db2.js           Database adapter — same code drives PostgreSQL and SQLite
src/seed2.js         Identity seed (roles/users) + demo dataset seed
db/schema.sql        Normalized schema (one table per entity, env column on each)
public/              Original client — index.html, app.js, styles.css, no build step
web/                 React client
  src/api/           fetch wrapper + TanStack Query hooks (the whole data layer)
  src/auth/          session context and the sign-in screen
  src/components/    UI kit, shared DataTable, BarChart, app shell
  src/pages/         one file per page (15 pages + the student profile)
  src/lib/           permissions mirror, formatting, image downscaling
test/                API and browser suites, plus the runner
```

## 9. Tests

```bash
npm test          # API suites: per-record writes, permissions, files, environments
npm run test:all  # the above plus a real-browser pass over all 15 pages
```

`test/run.mjs` boots a server against a scratch SQLite file, runs each suite, and tears it
down. The browser suites drive Chromium through Playwright (`npm i -D playwright`):
`browser.test.mjs` covers the React client — sign-in, all 15 pages rendering, a write that
persists, the audit trail recording it, dark mode, and no sideways scroll at 390px — and
`legacy.test.mjs` does the same for the original client, including the check that one
client's save no longer deletes another's records.

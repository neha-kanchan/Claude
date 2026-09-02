# SMA Housing System — Student Housing Management

A full-stack web application in two halves:

- **`frontend/`** — React 18 single-page app, built with Vite. Sixteen screens covering dashboard KPIs, student 360° profiles with photos, daily roll call, entry/exit with overdue alerts, violations, complaints and maintenance, requests, documents, calendar, notifications, reports, master data, roles and users, and the audit trail.
- **`backend/`** — Express REST API over **PostgreSQL** (with SQLite as a zero-config fallback for local runs), Microsoft Entra ID SSO or local JWT auth, role-based permissions enforced server-side, full audit trail and JSON backups.

The frontend never touches the database. It talks to the same REST API any other system would use.

## 1. Running it locally

You need **Node.js 22.5+** (24+ recommended). No admin rights? Download the **Windows Binary (.zip)** from [nodejs.org](https://nodejs.org), extract it into your Downloads or Desktop folder, and `start-windows.cmd` will find it — the portable build needs no installer.

```bash
npm run setup     # installs backend and frontend dependencies (once)
npm run build     # builds the React app into frontend/dist
npm start         # serves API + built frontend on http://localhost:3000
```

On Windows you can double-click `start-windows.cmd` instead of `npm start`, once you have run setup and build.

Sign in with:

| Username | Password | Role |
|---|---|---|
| `amal` | `admin123` | Administrator (everything) |
| `sami` | `demo123` | Housing Supervisor (daily operations) |
| `ghada` | `demo123` | Security Officer (gate + roll call) |
| `vera` | `demo123` | Viewer (read-only) |

On first sign-in the app creates a demo dataset (students, rooms, cases…) and saves it to the database. **Change these passwords from the Roles & Users page before any real use.**

## 2. Developing (two servers)

```bash
npm run dev:api   # terminal 1 — Express on :3000, restarts on save
npm run dev:web   # terminal 2 — Vite on :5173, hot reload, proxies /api to :3000
```

Open **http://localhost:5173** while developing: edits to React files appear instantly without a rebuild. In VS Code, **Terminal → Run Task → Start developing** launches both at once; `.vscode/launch.json` also has a *Debug backend API* configuration for breakpoints in the server.

## 3. The database

With no `DATABASE_URL` set, the app uses SQLite in `backend/db/housing.sqlite` — fine for evaluation and for local development, and it needs nothing installed.

For anything real, set `DATABASE_URL` and the app switches to PostgreSQL on start-up; tables are created automatically:

```bash
DATABASE_URL=postgres://user:password@host:5432/sma_housing npm start
```

Everything else — schema, migrations, the API — is identical on both engines.

## 4. Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | 3000 |
| `DATABASE_URL` | PostgreSQL connection string; empty = SQLite file | empty |
| `AUTH_MODE` | `local` (username/password) or `entra` (Microsoft SSO) | local |
| `SESSION_SECRET` | HMAC secret for login tokens — **must be changed in production** | dev value |
| `SESSION_HOURS` | Session lifetime | 12 |
| `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_API_AUDIENCE` | Entra ID app registration, used when `AUTH_MODE=entra` | empty |

## 5. REST API

All endpoints are under `/api`, JSON in/out, authenticated with `Authorization: Bearer <token>` from `POST /api/auth/login` (or an Entra token in SSO mode).

```
GET    /api/students                 list (any field as query filter, e.g. ?college=Engineering)
GET    /api/students/STU-1001        one record
POST   /api/students                 create (Admissions push)
PUT    /api/students/STU-1001        update (merge)
DELETE /api/students/STU-1001        delete
```

The same verbs work for `attendance`, `movements`, `violations`, `complaints`, `requests`, `documents`, `calendar`, `master`, … Plus:

```
POST /api/auth/login                       {username,password} → {token,user}
GET  /api/bootstrap                        everything the UI needs in one call
PUT  /api/sync/<collection>                batch upsert+delete (diffed & audited server-side)
GET  /api/files/<key>/download             stored file body (photos, agreements, evidence)
GET  /api/admin/backup                     full JSON dump of the database
POST /api/admin/reset-demo                 wipe the database & reseed identities
POST /api/users/<id>/password              admin sets a user's username/password
GET  /api/health                           liveness + db/auth mode
```

Every write — UI or API — is recorded in the audit log with user, role, action, entity and timestamp. Role permissions are enforced on the server for every route (a read-only role gets `403` even if it crafts raw requests).

### Student photos

Add student and Edit profile carry a photo field with a live preview. The image is downscaled in the browser (longest edge 480px, JPEG) before upload, so a phone snapshot arrives as ~40–80 KB rather than several megabytes; images over 8 MB and non-images are rejected at the form.

Photo bodies live in the same `files` store as document uploads, and the student row references one by key:

```
GET  /api/students/STU-1001       → { ..., "photoKey": "FILE-3KD9Q" }
GET  /api/files/FILE-3KD9Q/download   the photo body
POST /api/students                create/update with "photoKey": "<key>"  (null clears it)
```

Thumbnails appear in the student list and on the 360° record; students without a photo keep an initials avatar. Replacing or removing a photo deletes the file it replaced, and every photo change is audited with the profile update.

## 6. Deploying

Build the frontend, then run the backend — one process serves both.

```bash
npm run setup && npm run build
SESSION_SECRET=$(openssl rand -hex 32) DATABASE_URL=postgres://... PORT=8080 npm start
```

On a platform-as-a-service (Render, Railway, Azure App Service), set the build command to `npm run setup && npm run build`, the start command to `npm start`, and provide `DATABASE_URL` and `SESSION_SECRET` as environment variables.

Notes:
- **Use PostgreSQL in production.** Most hosts wipe the container disk on restart, which would take the SQLite file with it.
- Put TLS in front (the host's ingress, or nginx). The app is a single stateless process, so scaling out is safe once you are on Postgres.
- Backups: your database's own backups **plus** the in-app JSON export for portable snapshots.
- `backend/db/`, `.env` and `frontend/dist/` are git-ignored.

## 7. Project layout

```
package.json          root scripts: setup / build / start / dev:api / dev:web
.vscode/              VS Code tasks (run both servers) and a debug configuration
backend/
  server.js           Express app: security headers, /api router, serves frontend/dist
  src/routes.js       API routes (auth, bootstrap, sync, REST, files, admin)
  src/auth.js         Local JWT sessions + Entra ID token verification
  src/perms.js        Server-side role/permission checks (page + action level)
  src/db2.js          Database adapter — same code drives PostgreSQL and SQLite
  src/seed2.js        Roles/users identity seed + default permission sets
  db/schema.sql       Normalized schema, one table per entity
frontend/
  index.html          Vite entry point
  vite.config.js      Dev server + /api proxy to the backend
  src/main.jsx        React root
  src/App.jsx         Routes and per-page permission guards
  src/lib/            api client, data store, page catalogue, utils, demo seed
  src/components/     Layout, shared UI, student and document forms
  src/pages/          One component per screen
```

## 8. Verified

Run against **real PostgreSQL 16** with the production build served by Express:

- Sign-in, first-run seeding, all 15 navigation pages render, and no console errors.
- Student photo upload → thumbnail in the list → photo on the 360° record → survives a reload (read back from Postgres, stored as a 480px JPEG).
- Role permissions: a Viewer sees student photos but no Add/Edit buttons and no Roles page.
- Vite dev server on :5173 proxying `/api` to the backend on :3000.
- Databases created by earlier versions gain the `photo_key` column on start-up, with existing rows intact (checked on both PostgreSQL and SQLite).

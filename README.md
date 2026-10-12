# SWACHHITRA

Smart Waste Collection and Route Management System for Kolhapur Municipal Corporation.

## Architecture and roles

- `deputy_commissioner` — city-wide administrative scope.
- `assistant_commissioner` — assigned-division/zone administrative scope.
- `sanitary_inspector` — assigned-ward operational scope.
- `driver` — assigned route execution and GPS sharing.
- `citizen` — citizen reporting and account service role.

Role-specific dashboards and profiles are present in the current codebase. APIs enforce authentication, role checks, and operational-scope filtering; the Inspector dashboard is the ward-level operational interface.

## Current implementation

- MySQL-backed accounts, bcrypt password verification, server-side sessions, and active-user/role checks.
- Relational profiles and operational scope.
- Protected dashboards and API routes for Inspector, Assistant Commissioner, Deputy Commissioner, Driver, and Citizen workflows.
- Route/assignment/stop lifecycle operations, vehicle and driver management, collections, complaints, notifications, and reports.
- Driver browser geolocation upload and Inspector live-tracking polling.
- Reported GPS accuracy, heading, speed, coordinates, and last-update timestamp are persisted when the GPS metadata migration is applied.
- Leaflet/MapLibre maps use external map/font/routing services. Seed data and preloaded route shapes are development/demo data, not official municipal records.

## Project structure

```text
client/
  assets/
  dashboard/
  login/
  profile/                  # Shared profile stylesheet/core plus legacy entry files
  driverDash/
  driverProfile/
  inspectorDash/
  inspectorProfile/
  assistantDash/
  assistantProfile/
  deputyCommissionerDash/
  deputyCommissionerProfile/
  citizenDash/
  accountSecurity/
database/
  schema.sql                # Fresh-database baseline
  seed.sql                  # Development/demo accounts and data; never production
  migrations/               # Reviewed additive migrations for existing databases
server/
  config/
  controllers/
  middleware/
  routes/
  scripts/
  tests/
  utils/
  package.json
  package-lock.json
  server.js
.env.example
.gitignore
README.md
```

## Database setup

`database/schema.sql` is the maintained baseline for a fresh/rebuilt development database. It uses `CREATE TABLE IF NOT EXISTS`; that does **not** alter a table which already exists with an older definition. Back up and review the existing database before using any migration. Never run the baseline or demo seed as a substitute for an incremental migration on a production database.

For an existing database that has the previous GPS columns but no GPS quality metadata, take and verify a backup, then apply `database/migrations/SWACHHITRA_20261012_vehicle_gps_metadata.sql` once. It adds accuracy, heading, and speed columns used by the Driver GPS update endpoint and Inspector live-tracking response. Do not run it if these columns already exist; reconcile the schema first.

Run `database/seed.sql` only in an isolated development/test database. Its shared sample password is not suitable for production.

## Local development setup

1. Use Node.js 20 or later and a supported MySQL 8.x server.
2. Copy `.env.example` to `.env` in the project root. Keep `.env` private and out of Git/ZIP uploads. Configure local MySQL credentials and a unique random `SESSION_SECRET`.
3. Apply `database/schema.sql` to a fresh development database. If you are updating an existing database, use only the reviewed migrations required by that current schema.
4. Use `database/seed.sql` only if you need local demo data.
5. Install dependencies and run the server:

```bash
cd server
npm install
npm start
```

The application checks that the `sessions` table exists at startup; the runtime database account does not create schema tables. Apply the schema/migrations before starting the application.

Local routes include `/`, `/login`, `/driverDash/`, `/inspectorDash/`, `/assistantDash/`, and `/deputyCommissionerDash/`. Role-specific routes require a matching authenticated account and completed profile/scope.

## Tests

From `server/`:

```bash
npm run test:static
npm run check:deploy-config
npm run check:deploy-config:production
npm run test:deployment
```

- `test:static` runs source/regression checks that do not require a live server.
- `check:deploy-config:production` is expected to fail until actual production values are configured.
- `test:deployment` also includes live HTTP checks. Start the application with a test database first; a connection failure means runtime acceptance checks were not performed, not that those checks passed.

For two role accounts during local testing, use separate browser profiles or separate browsers because tabs in one browser profile share the same site session cookie.

## Adding a user

The development helper can create/update an account:

```bash
npm run create-user -- email@example.com A-Strong-Unique-Password role
```

Supported roles are `deputy_commissioner`, `assistant_commissioner`, `sanitary_inspector`, `driver`, and `citizen`. Staff/Driver accounts also need their database profile and authorized scope configured before operational APIs will accept their actions.

## Production Deployment Checklist

Do not deploy until all items below have been verified in the intended production environment:

1. Set `NODE_ENV=production` and configure a real public `APP_ORIGIN` using HTTPS. Set `TRUST_PROXY` to the exact trusted reverse-proxy topology; do not guess this value.
2. Generate a unique random `SESSION_SECRET` (at least 48 characters, with sufficient entropy). Never reuse development/test secrets.
3. Configure a dedicated MySQL account with only the required application privileges. Because the app no longer runs DDL at startup, it must not need `CREATE`/`ALTER` merely to manage sessions. Apply schema changes separately using a controlled migration account.
4. Configure `DB_PASSWORD` and secure networking/TLS for the chosen database host. Restrict network access to the application host where supported. Verify backup and restore procedures.
5. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` using the provider's correct TLS settings. For non-implicit-TLS connections the app now requires STARTTLS. Do not use example SMTP values.
6. Set `ALLOW_DEV_EMAIL_LINKS=false`. Do not deploy with `ALLOW_DEV_EMAIL_LINKS=true`. Verify account verification and password reset using real test mailboxes without printing tokens/secrets to logs.
7. Install dependencies from the updated lockfile (`npm install` after a dependency change; use `npm ci` once the lockfile is regenerated and committed). Do not deploy `node_modules` copied from a developer machine.
8. Verify `/api/health` and `/api/ready`; run live protected-route and role/scope tests with a non-production test database.
9. Test Driver GPS upload and Inspector polling on separate browser/device sessions. Verify accuracy metadata, stale readings, permission denial, session expiry, network recovery, and route completion/cancellation.
10. Ensure `.env`, `.git/`, `node_modules/`, and generated schema snapshots are excluded from deployment archives. If secrets were exposed to an untrusted location, rotate them. Do not deploy demo seed accounts or the shared `password123` credentials.
11. Optimize large image assets before production delivery and test the dashboard under the intended Content Security Policy, HTTPS, reverse proxy, and domain.
12. Confirm logs avoid passwords, session IDs/cookies, reset/verification tokens, and location data beyond approved operational need. Configure monitoring and incident/recovery procedures.

Production readiness is only established after these checks pass against the real hosting and database configuration. Passing static source tests alone is not a production sign-off.

## Repository and archive hygiene

The source distribution must exclude `.env`, `.git/`, `server/node_modules/`, and redundant generated snapshots. `.gitignore` alone does not remove files already tracked in Git; remove tracked dependency artifacts from the index and commit that cleanup. The current `server/swachhitra_schema_snapshot.sql` is a generated duplicate of the baseline DDL and must not be treated as a migration or source of truth.

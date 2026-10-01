# SWACHHITRA
Smart Waste Collection and Route Management System for Kolhapur Municipal Corporation.

## Architecture

SWACHHITRA uses five application roles:

- `deputy_commissioner` — city-wide administrative scope.
- `assistant_commissioner` — assigned-zone administrative scope.
- `sanitary_inspector` — assigned-ward operational scope.
- `driver` — route execution role.
- `citizen` — citizen reporting and service role.

The current backend exposes the shared administrative REST layer to the three administrative roles. The existing Inspector Dashboard page is intentionally protected to `sanitary_inspector` because its UI is the operational ward interface. Separate Deputy Commissioner and Assistant Commissioner pages can be added later without changing the underlying role-scoped API design.

## Current implementation

- MySQL authentication with bcrypt password verification.
- Session-based authentication with active-user validation.
- Role matching during login.
- Essential profile data with relational zone and ward scope.
- Role-scoped administrative REST endpoints for overview, routes, vehicles, drivers, assignments, collections, complaints, notifications, zones, and wards.
- Transactional route creation and route cancellation with vehicle/driver state updates.
- Inspector Dashboard database-backed rendering.
- Leaflet maps using seeded Kolhapur coordinates.

The map coordinates and seed values are development/demo data. They are not live municipal GPS telemetry or live municipal records.

## Project structure

```text
client/
  assets/logo.png
  dashboard/
  login/
  profile/
  InspectorDash/
database/
  schema.sql
  seed.sql
server/
  config/
  controllers/
  middleware/
  routes/
  scripts/
  package.json
  package-lock.json
  server.js
.env.example
.gitignore
README.md
```

## Database setup

`database/schema.sql` is the clean schema for the refactored structure. Because the `user_profiles` table and several relational fields were streamlined, use a backup and rebuild/migration process for an existing database rather than expecting `CREATE TABLE IF NOT EXISTS` to alter an old table definition automatically.

After creating the schema, run `database/seed.sql`.

The seed creates these development accounts, all using the password `password123`:

| Role | Email |
|---|---|
| Deputy Commissioner | `deputy.health@swachhitra.gov` |
| Assistant Commissioner | `assistant.central@swachhitra.gov` |
| Sanitary Inspector | `inspector.ward8@swachhitra.gov` |
| Driver | `driver.rajesh@swachhitra.gov` |
| Citizen | `citizen.priya@example.com` |

These credentials are for development/testing only.

## Run the server

1. Copy `.env.example` to `.env`.
2. Set the MySQL credentials and a long random `SESSION_SECRET` in `.env`.
3. Execute `database/schema.sql` in MySQL.
4. Execute `database/seed.sql` in MySQL.
5. Install server dependencies:

```bash
cd server
npm install
```

6. Start the server:

```bash
npm start
```

The public dashboard is available at `/`.

The login page is `/login`.

The authenticated profile page is `/profile`.

The Sanitary Inspector operational dashboard is `/InspectorDash` and requires an authenticated `sanitary_inspector` session.

## Adding another user

The development helper can create or update an account:

```bash
npm run create-user -- email@example.com YourPasswordHere role
```

Supported roles:

```text
Deputy Commissioner: deputy_commissioner
Assistant Commissioner: assistant_commissioner
Sanitary Inspector: sanitary_inspector
Driver: driver
Citizen: citizen
```

A newly created administrative or driver account still needs its profile scope (`zone_id` / `ward_id`) configured before scoped operational APIs can be used.

## Important exclusions

The source distribution intentionally does not include `.env`, `.git/`, `server/node_modules/`, or generated repository snapshots such as `repomix-output.xml`. These are either sensitive, reproducible, or unrelated to the application source.

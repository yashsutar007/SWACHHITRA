# SWACHHITRA
Smart Waste Collection and Route Management System.

## Current backend phase
- MySQL user authentication
- Session-based login
- Role validation
- Authenticated profile read/save
- Protected Sanitary Inspector page

## Run
1. Copy `.env.example` to `.env` and set MySQL credentials and a session secret.
2. Run `database/schema.sql` in MySQL.
3. Run `npm install` inside `server/`.
4. Create a test user:
   `npm run create-user -- inspector@example.com Password123! sanitary_inspector`
5. Start the server:
   `npm start`

The public dashboard remains at `/`. The Sanitary Inspector dashboard is `/sanitaryDash` and now requires an authenticated Sanitary Inspector session.

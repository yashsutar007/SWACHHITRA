"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
let passed = 0;
let failed = 0;

function read(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function test(name, callback) {
    try {
        callback();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${name} - ${error.message}`);
    }
}

test("Driver API is mounted and requires the Driver role", () => {
    const server = read("server/server.js");
    const routes = read("server/routes/driverRoutes.js");
    assert.match(server, /app\.use\("\/api\/driver", driverRoutes\)/);
    assert.match(routes, /router\.use\(requireRole\("driver"\)\)/);
    assert.match(routes, /router\.get\("\/me", getMyDriver\)/);
    assert.match(routes, /router\.get\("\/assignments", getMyAssignments\)/);
});

test("Driver identity is derived from the authenticated user, not request IDs", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /WHERE d\.user_id = \?/);
    assert.match(controller, /req\.currentUser\?\.id/);
    assert.doesNotMatch(controller, /req\.(?:query|body|params)\.driverId/);
});

test("Assignment and stop queries are restricted to the linked Driver record", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /WHERE ra\.driver_id = \?/);
    assert.match(controller, /ra\.unassigned_at IS NULL/);
    assert.match(controller, /owned_ra\.driver_id = \?/);
    assert.match(controller, /const placeholders = routeIds\.map\(\(\) => "\?"\)/);
});

test("Inspector account provisioning requires role and mutation security", () => {
    const routes = read("server/routes/inspectorRoutes.js");
    assert.match(routes, /router\.post\("\/drivers\/:id\/account", requireInspectorWrite, requireInspectorMutationSecurity, createDriverLoginAccount\)/);
});

test("New Driver account gets a random undisclosed password and hashed storage", () => {
    const controller = read("server/controllers/driverAccountController.js");
    assert.match(controller, /crypto\.randomBytes\(32\)/);
    assert.match(controller, /bcrypt\.hash\(undisclosedPassword, 12\)/);
    assert.match(controller, /The Driver must use Forgot Password to set a password/);
    assert.doesNotMatch(controller, /password:\s*undisclosedPassword/);
});

test("Account provisioning derives email, employee ID and ward from the scoped Driver Registry row", () => {
    const controller = read("server/controllers/driverAccountController.js");
    assert.match(controller, /INNER JOIN user_profiles inspector_scope/);
    assert.match(controller, /inspector_scope\.ward_id = w\.id/);
    assert.match(controller, /const email = normalizeEmail\(driver\.email\)/);
    assert.match(controller, /const employeeId = String\(driver\.employee_id/);
    assert.match(controller, /driver\.assigned_ward_id/);
    assert.match(controller, /UPDATE drivers\s+SET user_id = \?/);
});

test("Driver self-service cannot change official identity or jurisdiction", () => {
    const controller = read("server/controllers/profileController.js");
    assert.match(controller, /if \(user\.role === "driver"\)\s*\{\s*return res\.status\(403\)/);
    assert.match(controller, /Driver identity, licence details and assigned Ward are managed through the Inspector's Driver Registry/);
});

test("Linked Driver login email cannot be changed independently in the Registry", () => {
    const controller = read("server/controllers/inspectorController.js");
    assert.match(controller, /if \(existing\.user_id && currentEmail !== nextEmail\)/);
    assert.match(controller, /Registry email cannot be changed independently/);
});

test("Shared profile page is read-only for Drivers until Driver Dashboard is available", () => {
    const client = read("client/profile/profile.js");
    assert.match(client, /if \(role === "driver"\)/);
    assert.match(client, /control\.disabled = true/);
    assert.match(client, /submitButton\.hidden = true/);
});

test("Inspector fleet registry exposes account creation only for an unlinked Driver with an email", () => {
    const client = read("client/inspectorDash/inspectorDash.js");
    assert.match(client, /data-fleet-action="create-driver-account"/);
    assert.match(client, /driver\.userId/);
    assert.match(client, /driver\.email && driver\.email !== "—"/);
    assert.match(client, /\/api\/inspector\/drivers\/\$\{driverId\}\/account/);
});

test("Driver can set an initial password through the existing single-use reset flow", () => {
    const lifecycle = read("server/controllers/accountLifecycleController.js");
    assert.match(lifecycle, /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]\.includes\(user\.role\) && user\.status === "active"/);
    assert.match(lifecycle, /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]\.includes\(row\.role\) \|\| row\.status !== "active"/);
    assert.match(lifecycle, /INSERT INTO citizen_account_security \(user_id, email_verified_at, session_version\)[\s\S]*VALUES \(\?, NULL, 1\)[\s\S]*ON DUPLICATE KEY UPDATE[\s\S]*session_version = session_version \+ 1/);
    assert.match(lifecycle, /used_at IS NULL AND t\.expires_at > UTC_TIMESTAMP\(3\)/);
    assert.match(lifecycle, /UPDATE citizen_account_tokens SET used_at = COALESCE\(used_at, UTC_TIMESTAMP\(3\)\) WHERE user_id = \? AND used_at IS NULL/);
});

test("Readiness checks include the Driver module's core tables", () => {
    const server = read("server/server.js");
    for (const table of ["drivers", "vehicles", "route_assignments", "route_stops", "inspector_operational_areas"]) {
        assert.ok(server.includes(`"${table}"`), `Missing readiness dependency: ${table}`);
    }
});

console.log(`\nDriver foundation: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;

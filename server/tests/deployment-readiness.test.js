"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");

const SERVER_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
const BASE_URL = String(process.env.TEST_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
let passed = 0;
let failed = 0;
let skipped = 0;

function pass(name) {
    passed += 1;
    console.log(`PASS  ${name}`);
}

function fail(name, error) {
    failed += 1;
    console.error(`FAIL  ${name} - ${error?.message || error}`);
}

function skip(name, reason) {
    skipped += 1;
    console.log(`SKIP  ${name} - ${reason}`);
}

function isLocalServerUnavailable(error) {
    const localBase = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL);
    const code = error?.cause?.code || error?.code;
    return localBase && (
        ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code) ||
        (error instanceof TypeError && /fetch failed/i.test(error.message))
    );
}

async function test(name, work) {
    try {
        await work();
        pass(name);
    } catch (error) {
        if (error?.code === "LOCAL_TEST_SERVER_UNAVAILABLE") skip(name, error.message);
        else fail(name, error);
    }
}

function read(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

async function request(route) {
    try {
        return await fetch(`${BASE_URL}${route}`, { redirect: "manual", headers: { "Cache-Control": "no-cache" } });
    } catch (error) {
        if (isLocalServerUnavailable(error)) {
            const unavailable = new Error(`Local test server is unavailable at ${BASE_URL}; start server.js to run live integration checks.`);
            unavailable.code = "LOCAL_TEST_SERVER_UNAVAILABLE";
            throw unavailable;
        }
        throw error;
    }
}

async function main() {
    console.log("SWACHHITRA deployment readiness checks");
    console.log(`Base URL: ${BASE_URL}\n`);

    await test("Production startup requires HTTPS APP_ORIGIN and explicit TRUST_PROXY", () => {
        const source = read("server/server.js");
        assert.match(source, /parsedOrigin\.protocol !== "https:"/);
        assert.match(source, /Set TRUST_PROXY explicitly in production/);
        assert.match(source, /Production SESSION_SECRET must be a non-placeholder random secret/);
        assert.match(source, /Use a dedicated least-privilege MySQL account instead of root/);
        assert.match(source, /ALLOW_DEV_EMAIL_LINKS must not be enabled in production/);
    });

    await test("Citizen profile map CSP explicitly permits the exact OpenStreetMap tile host", () => {
        const source = read("server/server.js");
        assert.match(source, /img-src 'self' data: blob: https:\/\/unpkg\.com https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/);
        assert.match(source, /connect-src 'self' https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/);
    });

    await test("Citizen live tracking is protected, ward-scoped and supported by the map CSP", () => {
        const routes = read("server/routes/citizenRoutes.js");
        const controller = read("server/controllers/citizenController.js");
        const server = read("server/server.js");
        const html = read("client/citizenDash/citizenDash.html");
        const js = read("client/citizenDash/citizenDash.js");
        const css = read("client/citizenDash/citizenDash.css");
        assert.match(routes, /router\.use\(requireRole\("citizen"\)\)/);
        assert.match(routes, /router\.get\("\/live-tracking", getCitizenLiveTracking\)/);
        assert.match(controller, /async function getCitizenLiveTracking\(req, res\)/);
        assert.match(controller, /WHERE r\.ward_id = \?/);
        assert.match(controller, /WHERE u\.id = \?/);
        assert.match(server, /function setCitizenDashboardHeaders\(res\)/);
        assert.match(server, /script-src 'self' https:\/\/unpkg\.com/);
        assert.match(server, /img-src 'self' data: blob: https:\/\/unpkg\.com https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/);
        assert.match(html, /id="citizenLiveTrackingMap"/);
        assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
        assert.match(js, /\/api\/citizen\/live-tracking/);
        assert.match(css, /\.citizen-live-truck-marker/);
    });

    await test("Inspector tracking map has fullscreen control and AC-matching green markers", () => {
        const html = read("client/inspectorDash/inspectorDash.html");
        const js = read("client/inspectorDash/inspectorDash.js");
        const css = read("client/inspectorDash/inspectorDash.css");
        const assistant = read("client/assistantDash/assistantDash.js");
        const acHtml = read("client/assistantDash/assistantDash.html");
        assert.match(html, /id="trackingMapFullscreenButton"/);
        assert.match(js, /function toggleTrackingMapFullscreen\(\)/);
        assert.match(js, /class="custom-truck-marker gps-\$\{escapeHTML\(gpsState\)\}"/);
        assert.match(css, /\.custom-truck-marker \{[\s\S]{0,350}background: #416d27/);
        assert.match(assistant, /function renderOverviewMapInspectorAreas\(\)/);
        const inspectorAreaFunction = assistant.match(/function renderOverviewMapInspectorAreas\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
        assert.match(inspectorAreaFunction, /inspector\?\.scope\?\.ward_id/);
        assert.match(inspectorAreaFunction, /ward\.boundary\.polygon/);
        assert.doesNotMatch(inspectorAreaFunction, /operational_area\?\.polygon/);
        assert.match(acHtml, /Inspector-assigned Ward boundary/);
    });

    await test("Production configuration checker exists and never prints configured secret values", () => {
        const source = read("server/scripts/check-deployment-config.js");
        assert.match(source, /--production/);
        assert.match(source, /SESSION_SECRET/);
        assert.match(source, /SMTP_HOST/);
        assert.match(source, /ALLOW_DEV_EMAIL_LINKS/);
        assert.doesNotMatch(source, /console\.(log|warn|error)\([^\n]*process\.env\.[A-Z_]+/);
    });

    await test("Graceful shutdown handlers and runtime readiness endpoint are configured", () => {
        const source = read("server/server.js");
        assert.match(source, /process\.once\("SIGINT"/);
        assert.match(source, /process\.once\("SIGTERM"/);
        assert.match(source, /await db\.end\(\)/);
        assert.match(source, /app\.get\("\/api\/ready"/);
        for (const table of ["users", "user_profiles", "wards", "complaints", "citizen_account_security", "citizen_account_tokens", "sessions"]) {
            assert.ok(source.includes(`"${table}"`), `readiness should include ${table}`);
        }
    });

    await test("Package exposes config and deployment test scripts", () => {
        const pkg = JSON.parse(read("server/package.json"));
        assert.equal(pkg.scripts["check:deploy-config"], "node scripts/check-deployment-config.js");
        assert.equal(pkg.scripts["check:deploy-config:production"], "node scripts/check-deployment-config.js --production");
        assert.equal(pkg.scripts["test:deployment"], "node tests/deployment-readiness.test.js");
    });

    await test("README contains production deployment checklist and environment template is complete", () => {
        const example = read(".env.example");
        const readme = read("README.md");
        assert.match(readme, /## Production Deployment Checklist/);
        assert.match(readme, /Do not deploy with .*ALLOW_DEV_EMAIL_LINKS=true/);
        assert.match(example, /ALLOW_DEV_EMAIL_LINKS=true/);
        assert.match(example, /DB_CONNECTION_LIMIT/);
        assert.match(example, /SESSION_TTL_HOURS/);
    });

    await test("Session store startup checks schema without runtime DDL and uses consistent expiry comparison", () => {
        const store = read("server/config/mysqlSessionStore.js");
        const serverSource = read("server/server.js");
        assert.match(store, /async assertTableExists\(\)/);
        assert.match(store, /information_schema\.TABLES/);
        assert.doesNotMatch(store, /CREATE TABLE IF NOT EXISTS/);
        assert.doesNotMatch(store, /TRUNCATE TABLE/i);
        assert.match(store, /DELETE FROM \${this\.tableName}/);
        assert.match(store, /expires IS NOT NULL AND expires <= \?/);
        assert.match(serverSource, /await sessionStore\.assertTableExists\(\)/);
    });

    await test("Inspector dashboard has a dedicated CSP and private no-store headers", () => {
        const source = read("server/server.js");
        assert.match(source, /function setInspectorDashboardHeaders\(res\)/);
        assert.match(source, /function setInspectorDashboardHeaders\(res\)[\s\S]*?Content-Security-Policy/);
        const shortRoute = source.slice(source.indexOf('// Protected Sanitary Inspector dashboard'), source.indexOf('// Protected Assistant Commissioner dashboard'));
        const directRoute = source.slice(source.indexOf('"/inspectorDash/inspectorDash.html"'), source.indexOf('"/assistantDash/assistantDash.html"'));
        assert.match(shortRoute, /setInspectorDashboardHeaders\(res\)/);
        assert.match(directRoute, /setInspectorDashboardHeaders\(res\)/);
    });

    await test("GPS accuracy, heading and speed are stored and returned to the Inspector", () => {
        const schema = read("database/schema.sql");
        const migration = read("database/migrations/SWACHHITRA_20261012_vehicle_gps_metadata.sql");
        const driver = read("server/controllers/driverController.js");
        const inspector = read("server/controllers/inspectorController.js");
        const inspectorJs = read("client/inspectorDash/inspectorDash.js");
        for (const field of ["current_location_accuracy_meters", "current_location_heading_degrees", "current_location_speed_mps"]) {
            assert.match(schema, new RegExp(field));
            assert.match(migration, new RegExp(field));
            assert.match(driver, new RegExp(field));
            assert.match(inspector, new RegExp(field));
        }
        assert.match(inspectorJs, /Reported GPS accuracy/);
    });

    await test("Package declares supported Node range and patched Nodemailer release line", () => {
        const pkg = JSON.parse(read("server/package.json"));
        assert.equal(pkg.engines?.node, ">=20.0.0");
        assert.equal(pkg.dependencies?.nodemailer, "^10.1.0");
        assert.ok(pkg.scripts["test:static"]);
    });

    await test("Live health endpoint responds with safe headers", async () => {
        const response = await request("/api/health");
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.success, true);
        assert.equal(body.status, "ok");
        assert.match(String(response.headers.get("cache-control") || ""), /no-store/i);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
    });

    await test("Live readiness endpoint confirms required tables are present", async () => {
        const response = await request("/api/ready");
        assert.equal(response.status, 200, `readiness returned HTTP ${response.status}`);
        const body = await response.json();
        assert.equal(body.success, true);
        assert.equal(body.status, "ready");
        assert.equal(body.checks?.database, "ok");
        assert.equal(body.checks?.accountSecuritySchema, "ok");
    });

    await test("Citizen dashboard remains protected from anonymous requests", async () => {
        const response = await request("/citizenDash");
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/login");
        assert.match(String(response.headers.get("cache-control") || ""), /no-store/i);
    });

    console.log(`\nResult: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed) process.exitCode = 1;
}

main().catch(error => {
    console.error("Deployment readiness suite could not complete:", error?.message || error);
    process.exitCode = 1;
});

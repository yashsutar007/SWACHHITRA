"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");

const SERVER_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
const BASE_URL = String(process.env.TEST_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
let passed = 0;
let failed = 0;

function pass(name) {
    passed += 1;
    console.log(`PASS  ${name}`);
}

function fail(name, error) {
    failed += 1;
    console.error(`FAIL  ${name} - ${error?.message || error}`);
}

async function test(name, work) {
    try {
        await work();
        pass(name);
    } catch (error) {
        fail(name, error);
    }
}

function read(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

async function request(route) {
    return fetch(`${BASE_URL}${route}`, { redirect: "manual", headers: { "Cache-Control": "no-cache" } });
}

async function main() {
    console.log("SWACHHITRA Part 7 deployment readiness checks");
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

    await test("Deployment runbook and safe environment template exist", () => {
        const example = read(".env.example");
        const guidePath = path.join(PROJECT_ROOT, "DEPLOYMENT_READINESS_Citizen_Part7.txt");
        assert.ok(fs.existsSync(guidePath), "deployment guide missing");
        assert.match(example, /ALLOW_DEV_EMAIL_LINKS=true/);
        assert.match(example, /DB_CONNECTION_LIMIT/);
        assert.match(example, /SESSION_TTL_HOURS/);
        assert.match(fs.readFileSync(guidePath, "utf8"), /Do not deploy with ALLOW_DEV_EMAIL_LINKS=true/);
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

    console.log(`\nResult: ${passed} passed, ${failed} failed, 0 skipped`);
    if (failed) process.exitCode = 1;
}

main().catch(error => {
    console.error("Deployment readiness suite could not complete:", error?.message || error);
    process.exitCode = 1;
});

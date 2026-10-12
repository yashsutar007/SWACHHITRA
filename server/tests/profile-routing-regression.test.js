"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
const server = fs.readFileSync(path.join(PROJECT_ROOT, "server/server.js"), "utf8");
let passed = 0;
let failed = 0;

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

function routeBlock(start, end) {
    const from = server.indexOf(start);
    assert.notEqual(from, -1, `Missing route start: ${start}`);
    const to = server.indexOf(end, from);
    assert.notEqual(to, -1, `Missing route end after ${start}`);
    return server.slice(from, to);
}

test("A reusable profile-completion guard checks the authenticated database profile", () => {
    assert.match(server, /function requireCompletedRoleProfile\(role\)/);
    assert.match(server, /isProfileCompleteForRole\(role, profile\)/);
    assert.match(server, /FROM user_profiles\s+WHERE user_id = \?/);
    assert.match(server, /return redirectToOwnProfile\(req, res\)/);
});

test("Driver dashboard also requires a linked non-inactive Driver Registry record", () => {
    const block = routeBlock('app.get(["/driverDash"', '// Protected Sanitary Inspector dashboard');
    assert.match(block, /requirePageRole\("driver"\)/);
    assert.match(block, /requireCompletedRoleProfile\("driver"\)/);
    assert.match(server, /FROM drivers\s+WHERE user_id = \?\s+AND status <> 'inactive'/);
});

test("Inspector operational dashboard and direct HTML URL enforce profile completion", () => {
    const block = routeBlock('// Protected Sanitary Inspector dashboard', '// Protected Assistant Commissioner dashboard');
    const direct = routeBlock('app.get(\n    "/inspectorDash/inspectorDash.html"', 'app.get(\n    "/assistantDash/assistantDash.html"');
    assert.match(block, /requirePageRole\("sanitary_inspector"\)[\s\S]*requireCompletedRoleProfile\("sanitary_inspector"\)/);
    assert.match(direct, /requirePageRole\("sanitary_inspector"\)[\s\S]*requireCompletedRoleProfile\("sanitary_inspector"\)/);
});

test("Assistant Commissioner operational dashboard and direct HTML URL enforce profile completion", () => {
    const block = routeBlock('// Protected Assistant Commissioner dashboard', '// Protected Deputy Commissioner city-wide dashboard');
    const direct = routeBlock('app.get(\n    "/assistantDash/assistantDash.html"', '// Public Citizen registration page');
    assert.match(block, /requirePageRole\("assistant_commissioner"\)[\s\S]*requireCompletedRoleProfile\("assistant_commissioner"\)/);
    assert.match(direct, /requirePageRole\("assistant_commissioner"\)[\s\S]*requireCompletedRoleProfile\("assistant_commissioner"\)/);
});

test("Deputy Commissioner operational dashboard enforces profile completion", () => {
    const block = routeBlock('// Protected Deputy Commissioner city-wide dashboard', '// Direct protected dashboard HTML entry points');
    assert.match(block, /requirePageRole\("deputy_commissioner"\)[\s\S]*requireCompletedRoleProfile\("deputy_commissioner"\)/);
});

test("Role-specific profile setup pages remain accessible without a completed-profile guard", () => {
    for (const [route, role] of [
        ["/inspectorProfile", "sanitary_inspector"],
        ["/assistantProfile", "assistant_commissioner"],
        ["/deputyCommissionerProfile", "deputy_commissioner"],
        ["/driverProfile", "driver"]
    ]) {
        const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`app\\.get\\(\\[\\"${escaped}\\"[^\\]]*\\],\\s*requirePageRole\\(\\"${role}\\"\\),\\s*\\(req, res\\)\\s*=>`);
        assert.match(server, pattern, `Profile setup route should be role-protected but not completion-blocked: ${route}`);
    }
});

test("Citizen dashboard retains its dedicated address and boundary completion guard", () => {
    const block = routeBlock('app.get(\n    ["/citizenDash", "/citizenDash/"],', 'app.get(\n    "/citizenDash/citizenDash.html"');
    assert.match(block, /requirePageRole\("citizen"\)/);
    assert.match(block, /requireCompletedCitizenProfile/);
});

console.log(`\nProfile routing regression: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

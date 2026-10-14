"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const assistantJs = fs.readFileSync(path.join(projectRoot, "client/assistantDash/assistantDash.js"), "utf8");
const assistantController = fs.readFileSync(path.join(projectRoot, "server/controllers/assistantController.js"), "utf8");
const assistantRoutes = fs.readFileSync(path.join(projectRoot, "server/routes/assistantRoutes.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "server/package.json"), "utf8"));

const cssFiles = [
    "client/accountSecurity/accountSecurity.css",
    "client/assistantDash/assistantDash.css",
    "client/assistantProfile/assistantProfile.css",
    "client/citizenDash/citizenDash.css",
    "client/dashboard/dashboard.css",
    "client/deputyCommissionerDash/deputyCommissionerDash.css",
    "client/deputyCommissionerProfile/deputyCommissionerProfile.css",
    "client/driverDash/driverDash.css",
    "client/driverProfile/driverProfile.css",
    "client/inspectorDash/inspectorDash.css",
    "client/inspectorProfile/inspectorProfile.css",
    "client/login/login.css",
    "client/profile/profile.css"
];

let passed = 0;
let failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name} - ${error.message}`); }
}

test("Ward create cursor uses the Leaflet map instance rather than the DOM element", () => {
    assert.match(assistantJs, /const mapInstance = state\.wardCreateMap/);
    assert.match(assistantJs, /typeof mapInstance\.getContainer === "function"/);
    assert.doesNotMatch(assistantJs, /dom\.wardCreateMap\?\.getContainer\(\)/);
});

test("Ward creation still derives the division from authenticated AC scope", () => {
    assert.match(assistantRoutes, /router\.use\(\s*requireRole\("assistant_commissioner"\)\s*\)/);
    assert.match(assistantRoutes, /router\.post\(\s*"\/wards",\s*requireAssistantMutationSecurity,\s*createOperationalWard/s);
    assert.match(assistantController, /const scope = await getAssistantScope\(req, connection\)/);
    assert.match(assistantController, /WHERE division_id = \?/);
});

test("A new division without wards receives a deterministic app-managed compatibility zone", () => {
    assert.match(assistantController, /zoneSuffix = "-OPS"/);
    assert.match(assistantController, /INSERT INTO zones \(zone_code, zone_name, status\)/);
    assert.match(assistantController, /Operational Zone \(app-managed\)/);
    assert.match(assistantController, /zone_scope: "app_managed_compatibility"/);
    assert.doesNotMatch(assistantController, /No legacy compatibility zone is currently associated with this division/);
});

test("Created ward and compatibility zone share the same transaction", () => {
    assert.match(assistantController, /await connection\.beginTransaction\(\)/);
    assert.match(assistantController, /INSERT INTO wards \([\s\S]*?zone_id,[\s\S]*?division_id,[\s\S]*?\)/);
    assert.match(assistantController, /await connection\.commit\(\)/);
    assert.match(assistantController, /await connection\.rollback\(\)/);
});

test("All app CSS files include the green gradient animation and reduced-motion handling", () => {
    for (const relative of cssFiles) {
        const css = fs.readFileSync(path.join(projectRoot, relative), "utf8");
        assert.match(css, /@keyframes swachhitra-green-sidebar-flow/, `${relative}: missing green animation`);
        assert.match(css, /prefers-reduced-motion:\s*reduce/, `${relative}: missing reduced-motion support`);
        assert.match(css, /\.sidebar[\s\S]*?animation: swachhitra-green-sidebar-flow/, `${relative}: missing sidebar animation rule`);
    }
});

console.log(`\nWard creation / theme checks: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;

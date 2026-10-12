"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
let passed = 0;
let failed = 0;

function file(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

async function test(label, callback) {
    try {
        await callback();
        passed += 1;
        console.log(`PASS ${label}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${label} - ${error.message}`);
    }
}

async function main() {
    console.log("SWACHHITRA staff account provisioning checks\n");

    await test("Assistant Inspector account endpoint is behind the AC role and mutation security", () => {
        const routes = file("server/routes/assistantRoutes.js");
        assert.match(routes, /router\.use\(\s*requireRole\("assistant_commissioner"\)\s*\)/);
        assert.match(routes, /router\.post\(\s*"\/inspectors\/accounts",\s*requireAssistantMutationSecurity,\s*createInspectorAccount\s*\)/);
    });

    await test("Inspector provisioning derives the Assistant Commissioner's Division from the authenticated account", () => {
        const controller = file("server/controllers/assistantInspectorAccountController.js");
        assert.match(controller, /req\.currentUser\?\.id/);
        assert.match(controller, /u\.role = 'assistant_commissioner'/);
        assert.match(controller, /p\.division_id/);
        assert.doesNotMatch(controller, /req\.body\?\.division_id/);
        assert.match(controller, /Number\(ward\.division_id\) !== divisionId/);
    });

    await test("Inspector provisioning requires an eligible Ward with a configured planning boundary", () => {
        const controller = file("server/controllers/assistantInspectorAccountController.js");
        assert.match(controller, /w\.status AS ward_status/);
        assert.match(controller, /z\.status AS zone_status/);
        assert.match(controller, /getWardPlanningBoundary\(/);
        assert.match(controller, /No usable boundary is configured/);
    });

    await test("Inspector account creation stores a bcrypt hash and never returns the generated password", () => {
        const controller = file("server/controllers/assistantInspectorAccountController.js");
        assert.match(controller, /crypto\.randomBytes\(32\)/);
        assert.match(controller, /bcrypt\.hash\(undisclosedPassword, 12\)/);
        assert.match(controller, /password_hash, role, status/);
        assert.doesNotMatch(controller, /password:\s*undisclosedPassword/);
        assert.match(controller, /connection\.beginTransaction\(\)/);
        assert.match(controller, /connection\.commit\(\)/);
        assert.match(controller, /connection\.rollback\(\)/);
    });

    await test("Inspector creation writes the scoped profile, scope history, notification and session version atomically", () => {
        const controller = file("server/controllers/assistantInspectorAccountController.js");
        assert.match(controller, /INSERT INTO user_profiles/);
        assert.match(controller, /INSERT INTO inspector_scope_history/);
        assert.match(controller, /INSERT INTO notifications/);
        assert.match(controller, /INSERT INTO citizen_account_security/);
    });

    await test("Password recovery supports provisioned staff and retains Citizen-only email verification", () => {
        const lifecycle = file("server/controllers/accountLifecycleController.js");
        const approvedRoles = /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]/;
        assert.match(lifecycle, /function findEligiblePasswordResetTarget\(/);
        assert.match(lifecycle, /AND u\.status = 'active'/);
        assert.match(lifecycle, new RegExp(approvedRoles.source + "\\.includes\\(row\\.role\\)"));
        assert.match(lifecycle, /if \(!row \|\| row\.role !== "citizen" \|\| row\.status !== "active"\)/);
        assert.match(lifecycle, /If this address belongs to an eligible active SWACHHITRA account/);
    });

    await test("Assistant dashboard exposes a provision form for official Inspector details and a scoped Ward", () => {
        const html = file("client/assistantDash/assistantDash.html");
        const script = file("client/assistantDash/assistantDash.js");
        const css = file("client/assistantDash/assistantDash.css");
        assert.match(html, /id="createInspectorAccountButton"/);
        assert.match(html, /id="createInspectorAccountForm"/);
        assert.match(html, /id="newInspectorEmail"/);
        assert.match(html, /id="newInspectorWard"/);
        assert.match(script, /fetchJSON\(`\$\{API_BASE\}\/inspectors\/accounts`/);
        assert.match(script, /X-CSRF-Token/);
        assert.match(css, /\.account-modal-card/);
    });

    await test("Inspector self-service cannot change the official full name or employee ID after provisioning", () => {
        const controller = file("server/controllers/profileController.js");
        const script = file("client/profile/profile.js");
        assert.match(controller, /official name is managed by the Assistant Commissioner/);
        assert.match(controller, /official employee ID is managed by the Assistant Commissioner/);
        assert.match(script, /readonly: role === "sanitary_inspector" && Boolean\(profile\.full_name\)/);
        assert.match(script, /readonly: role === "sanitary_inspector" && Boolean\(profile\.employee_id\)/);
    });

    await test("Public self-registration remains Citizen-only", () => {
        const routes = file("server/routes/authRoutes.js");
        const lifecycle = file("server/controllers/accountLifecycleController.js");
        const login = file("client/login/login.html");
        assert.match(routes, /router\.post\("\/register-citizen", protectCitizenRegistration, registerCitizen\)/);
        assert.match(lifecycle, /VALUES \(\?, \?, 'citizen', 'active'\)/);
        assert.match(login, /New Citizen\?/);
        assert.match(login, /Staff cannot self-register/);
        assert.doesNotMatch(login, /Create an Inspector account|Create a Driver account|Staff registration/i);
    });

    await test("Inspector provisioning path does not permit choosing a password or role in the browser", () => {
        const html = file("client/assistantDash/assistantDash.html");
        const script = file("client/assistantDash/assistantDash.js");
        assert.doesNotMatch(html, /id="newInspectorPassword"/);
        assert.match(script, /ward_id: Number\(dom\.newInspectorWard\?\.value\)/);
        assert.doesNotMatch(script, /role:\s*["']sanitary_inspector["']/);
    });

    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

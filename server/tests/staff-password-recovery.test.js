"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
let passed = 0;
function check(name, fn) {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
}

check("Recovery endpoints are role-protected and CSRF-protected", () => {
    const routes = read("server/routes/authRoutes.js");
    assert.match(routes, /password\/activation\/driver[\s\S]*requireRole\("sanitary_inspector"\)[\s\S]*requireInspectorMutationSecurity/);
    assert.match(routes, /password\/activation\/inspector[\s\S]*requireRole\("assistant_commissioner"\)[\s\S]*requireAssistantMutationSecurity/);
    assert.match(routes, /password\/reset-assigned-staff[\s\S]*protectResetPassword[\s\S]*resetPasswordWithRecoveryCode/);
});

check("Driver code issuance verifies linked account and current Inspector Ward/Division", () => {
    const controller = read("server/controllers/staffPasswordRecoveryController.js");
    assert.match(controller, /INNER JOIN drivers dr ON dr\.user_id = u\.id/);
    assert.match(controller, /inspector_scope\.ward_id = w\.id/);
    assert.match(controller, /inspector_scope\.division_id = w\.division_id/);
});

check("Inspector code issuance verifies the current Assistant Commissioner assignment", () => {
    const controller = read("server/controllers/staffPasswordRecoveryController.js");
    assert.match(controller, /target_profile\.scope_assigned_by = issuer_profile\.user_id/);
    assert.match(controller, /issuer_profile\.division_id = target_profile\.division_id/);
});

check("Recovery credentials are hashed, expire, and are consumed once", () => {
    const controller = read("server/controllers/staffPasswordRecoveryController.js");
    assert.match(controller, /crypto\.randomBytes\(16\)\.toString\("hex"\)/);
    assert.match(controller, /hashToken\(code\)/);
    assert.match(controller, /INTERVAL \? MINUTE/);
    assert.match(controller, /used_at = COALESCE\(used_at, UTC_TIMESTAMP\(3\)\)/);
    assert.match(controller, /UPDATE citizen_account_tokens SET used_at = COALESCE/);
});

check("Password reset rechecks the active assignment and invalidates sessions", () => {
    const controller = read("server/controllers/staffPasswordRecoveryController.js");
    assert.match(controller, /assignmentStillValid\(connection, Number\(tokenRow\.user_id\), tokenRow\.role\)/);
    assert.match(controller, /bcrypt\.hash\(password, 12\)/);
    assert.match(controller, /session_version = session_version \+ 1/);
});

check("Code issuer and reset pages are linked and avoid token URLs for staff codes", () => {
    const forgot = read("client/accountSecurity/forgotPassword.html");
    const reset = read("client/accountSecurity/resetPassword.html");
    const resetJs = read("client/accountSecurity/resetPassword.js");
    const issue = read("client/accountSecurity/issueRecoveryCode.html");
    assert.match(forgot, /href="\/issueRecoveryCode"/);
    assert.match(forgot, /href="\/resetPassword"/);
    assert.match(reset, /recovery_code/);
    assert.match(resetJs, /password\/reset-assigned-staff/);
    assert.match(resetJs, /history\.replaceState/);
    assert.match(issue, /issueRecoveryCode\.js/);
});

check("No-SMTP production mode is explicit and Citizen registration stays closed", () => {
    const server = read("server/server.js");
    const config = read("server/scripts/check-deployment-config.js");
    const lifecycle = read("server/controllers/accountLifecycleController.js");
    assert.match(server, /ALLOW_NO_SMTP_FOR_STAFF_RECOVERY/);
    assert.match(config, /ALLOW_NO_SMTP_FOR_STAFF_RECOVERY/);
    assert.match(lifecycle, /CITIZEN_EMAIL_VERIFICATION_REQUIRED/);
});

console.log(`
Staff recovery static checks: ${passed} passed, 0 failed`);

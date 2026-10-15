"use strict";

const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BASE_URL = String(process.env.TEST_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(label) { passed += 1; console.log(`PASS  ${label}`); }
function fail(label, error) { failed += 1; console.error(`FAIL  ${label} - ${error?.message || error}`); }
function skip(label, reason) { skipped += 1; console.log(`SKIP  ${label} - ${reason}`); }

function isLocalServerUnavailable(error) {
    const localBase = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL);
    const code = error?.cause?.code || error?.code;
    return localBase && (
        ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code) ||
        (error instanceof TypeError && /fetch failed/i.test(error.message))
    );
}

async function test(label, callback) {
    try { await callback(); pass(label); }
    catch (error) {
        if (error?.code === "LOCAL_TEST_SERVER_UNAVAILABLE") skip(label, error.message);
        else fail(label, error);
    }
}

async function request(route, options = {}) {
    let response;
    try {
        response = await fetch(`${BASE_URL}${route}`, {
            redirect: "manual",
            ...options,
            headers: { ...(options.headers || {}) }
        });
    } catch (error) {
        if (isLocalServerUnavailable(error)) {
            const unavailable = new Error(`Local test server is unavailable at ${BASE_URL}; start server.js to run live integration checks.`);
            unavailable.code = "LOCAL_TEST_SERVER_UNAVAILABLE";
            throw unavailable;
        }
        throw error;
    }
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* page HTML */ }
    return { response, raw, body };
}

function file(name) { return fs.readFileSync(path.join(PROJECT_ROOT, name), "utf8"); }

async function main() {
    console.log("SWACHHITRA Citizen Part 6 account lifecycle regression suite");
    console.log(`Base URL: ${BASE_URL}\n`);

    await test("Additive migration creates hashed account tokens and keeps existing Citizens verified", async () => {
        const sql = file("database/migrations/SWACHHITRA_Citizen_Part6_account_security_migration.sql");
        assert.match(sql, /CREATE TABLE IF NOT EXISTS citizen_account_security/i);
        assert.match(sql, /CREATE TABLE IF NOT EXISTS citizen_account_tokens/i);
        assert.match(sql, /token_hash CHAR\(64\)/i);
        assert.match(sql, /SELECT\s+id,\s*UTC_TIMESTAMP\(3\),\s*0\s+FROM\s+users\s+WHERE\s+role\s*=\s*'citizen'/i);
        assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
        assert.doesNotMatch(sql, /\bALTER\s+TABLE\s+users\b/i);
    });

    await test("Tokens are random, SHA-256 hashed, purpose-specific and expiring", async () => {
        const controller = file("server/controllers/accountLifecycleController.js");
        assert.match(controller, /crypto\.randomBytes\(32\)/);
        assert.match(controller, /createHash\("sha256"\)/);
        assert.match(controller, /email_verification:\s*24 \* 60 \* 60 \* 1000/);
        assert.match(controller, /password_reset:\s*30 \* 60 \* 1000/);
        assert.match(controller, /used_at IS NULL AND t\.expires_at > UTC_TIMESTAMP\(3\)/);
    });

    await test("Staff password reset links are gated by current assignments", async () => {
        const controller = file("server/controllers/accountLifecycleController.js");
        assert.match(controller, /function findEligiblePasswordResetTarget\(/);
        assert.match(controller, /driver_registry\.user_id = u\.id/);
        assert.match(controller, /LOWER\(CONVERT\(TRIM\(driver_registry\.email\) USING utf8mb4\)\) COLLATE utf8mb4_unicode_ci\s*=\s*LOWER\(CONVERT\(u\.email USING utf8mb4\)\) COLLATE utf8mb4_unicode_ci/);
        assert.match(controller, /LOWER\(CONVERT\(TRIM\(inspector_profile\.official_email\) USING utf8mb4\)\) COLLATE utf8mb4_unicode_ci\s*=\s*LOWER\(CONVERT\(u\.email USING utf8mb4\)\) COLLATE utf8mb4_unicode_ci/);
        assert.match(controller, /inspector_profile\.scope_assigned_by/);
        assert.match(controller, /assigning_ac\.role = 'assistant_commissioner'/);
        assert.match(controller, /findEligiblePasswordResetTarget\(\s*connection,\s*row\.email,\s*Number\(row\.user_id\)\s*\)/);
        assert.match(controller, /If this address belongs to an eligible active SWACHHITRA account/);
        assert.match(controller, /UPDATE users SET password_hash = \? WHERE id = \? AND role = \? AND status = 'active'/);
        assert.match(controller, /session_version = session_version \+ 1/);
        // Email verification confirmation remains restricted to Citizen tokens.
        assert.match(controller, /if \(!row \|\| row\.role !== "citizen" \|\| row\.status !== "active"\)/);
    });

    await test("Citizen signup creates a session and redirects to profile setup", async () => {
        const controller = file("server/controllers/accountLifecycleController.js");
        const registerScript = file("client/citizenDash/citizenRegister.js");
        assert.match(controller, /VALUES \(\?, UTC_TIMESTAMP\(3\), 0\)/);
        assert.match(controller, /req\.session\.regenerate/);
        assert.match(controller, /req\.session\.role = "citizen"/);
        assert.match(controller, /redirectTo: "\/citizenDash\/profile"/);
        assert.match(registerScript, /window\.location\.replace\(redirectTo\)/);
    });

    await test("Login and middleware enforce email verification and session-version revocation", async () => {
        const auth = file("server/controllers/authController.js");
        const middleware = file("server/middleware/authMiddleware.js");
        assert.match(auth, /EMAIL_NOT_VERIFIED/);
        assert.match(auth, /Number\(account\.session_version \|\| 0\) !== Number\(user\.session_version \|\| 0\)/);
        assert.match(auth, /req\.session\.sessionVersion = Number\(user\.session_version \|\| 0\)/);
        assert.match(auth, /SESSION_REVOKED/);
        assert.match(middleware, /cas\.email_verified_at/);
        assert.match(middleware, /req\.session\.sessionVersion/);
    });

    await test("Public lifecycle endpoints are registered behind origin and rate-limit middleware", async () => {
        const routes = file("server/routes/authRoutes.js");
        assert.match(routes, /protectLogin, login/);
        assert.match(routes, /protectLogout, logout/);
        assert.match(routes, /protectVerificationRequest, requestEmailVerification/);
        assert.match(routes, /protectVerificationConfirm, confirmEmailVerification/);
        assert.match(routes, /protectForgotPassword, requestPasswordReset/);
        assert.match(routes, /protectResetPassword, resetPassword/);
    });

    await test("Account security pages, scripts and login links exist", async () => {
        for (const name of [
            "client/accountSecurity/verifyEmail.html",
            "client/accountSecurity/verifyEmail.js",
            "client/accountSecurity/forgotPassword.html",
            "client/accountSecurity/forgotPassword.js",
            "client/accountSecurity/resetPassword.html",
            "client/accountSecurity/resetPassword.js",
            "client/accountSecurity/accountSecurity.css",
            "client/accountSecurity/issueRecoveryCode.html",
            "client/accountSecurity/issueRecoveryCode.js",
            "server/controllers/staffPasswordRecoveryController.js"
        ]) assert.ok(fs.existsSync(path.join(PROJECT_ROOT, name)), `${name} should exist`);
        assert.match(file("client/login/login.html"), /href="\/forgotPassword"/);
        assert.match(file("client/login/login.js"), /EMAIL_NOT_VERIFIED/);
        assert.match(file("client/citizenDash/citizenRegister.js"), /redirectTo/);
    });

    await test("Production requires SMTP unless the explicit staff-only recovery mode is enabled", async () => {
        const server = file("server/server.js");
        const checker = file("server/scripts/check-deployment-config.js");
        const lifecycle = file("server/controllers/accountLifecycleController.js");
        const mail = file("server/utils/emailService.js");
        assert.match(server, /Production account email delivery requires/);
        assert.match(server, /ALLOW_NO_SMTP_FOR_STAFF_RECOVERY/);
        assert.match(server, /ALLOW_DEV_EMAIL_LINKS must not be enabled in production/);
        assert.match(server, /cleanupExpiredAccountTokens/);
        assert.match(checker, /ALLOW_NO_SMTP_FOR_STAFF_RECOVERY/);
        assert.match(lifecycle, /Email delivery is not configured on this server/);
        assert.match(lifecycle, /Citizen account created/);
        assert.doesNotMatch(lifecycle.slice(lifecycle.indexOf("async function requestPasswordReset"), lifecycle.indexOf("async function resetPassword")), /staff_activation_code|recovery code process/i);
        assert.match(server, /Email-based password-reset links cannot be delivered/i);
        for (const setting of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) assert.ok(server.includes(setting));
        assert.match(mail, /disableFileAccess: true/);
        assert.match(mail, /disableUrlAccess: true/);
    });

    await test("Citizen profile CSP permits the exact OpenStreetMap tile host", async () => {
        const server = file("server/server.js");
        // Scope the assertion to the two Citizen profile routes. A shared profile
        // CSP helper elsewhere in server.js may legitimately contain the same
        // source expression and must not be counted as a Citizen route.
        const citizenProfileStart = server.indexOf('app.get(\n    ["/citizenDash/profile", "/citizenDash/profile/"]');
        const citizenProfileEnd = server.indexOf("// API routes", citizenProfileStart);
        assert.ok(
            citizenProfileStart >= 0 && citizenProfileEnd > citizenProfileStart,
            "both protected Citizen profile entry points should be registered"
        );
        const citizenProfileRoutes = server.slice(citizenProfileStart, citizenProfileEnd);
        const imgMatches = citizenProfileRoutes.match(/img-src 'self' data: blob: https:\/\/unpkg\.com https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/g) || [];
        const connectMatches = citizenProfileRoutes.match(/connect-src 'self' https:\/\/unpkg\.com https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/g) || [];
        assert.equal(imgMatches.length, 2, "both protected Citizen profile entry points should allow the base tile host");
        assert.equal(connectMatches.length, 2, "both protected Citizen profile entry points should allow same-host and tile connections");
        const mapScript = file("client/citizenDash/citizenProfile.js");
        assert.match(mapScript, /tileLayer\.on\("tileerror"/);
        assert.match(mapScript, /citizenMapTileStatus/);
    });

    await test("Forgot/reset password pages use email links only and hide staff-code controls", async () => {
        const forgotHtml = file("client/accountSecurity/forgotPassword.html");
        const forgotJs = file("client/accountSecurity/forgotPassword.js");
        const resetHtml = file("client/accountSecurity/resetPassword.html");
        const resetJs = file("client/accountSecurity/resetPassword.js");
        assert.doesNotMatch(forgotHtml, /I already have a recovery code|Authority: issue a staff code|recovery code|issueRecoveryCode/i);
        assert.match(forgotJs, /Send password reset link/);
        assert.doesNotMatch(forgotJs, /staff_activation_code|recoveryCode|issueRecoveryCode/i);
        assert.doesNotMatch(resetHtml, /recoveryCode|One-time recovery code/i);
        assert.match(resetJs, /\/api\/auth\/password\/reset/);
        assert.doesNotMatch(resetJs, /reset-assigned-staff|recoveryCode/i);
    });

    await test("Assistant Commissioner bootstrap script binds the account to a real active Division and Deputy Commissioner", async () => {
        const script = file("server/scripts/createAssistantCommissioner.js");
        assert.match(script, /role !== "deputy_commissioner"/);
        assert.match(script, /division\.status !== "active"/);
        assert.match(script, /scope_assigned_by/);
        assert.match(script, /division_id/);
        assert.match(script, /bcrypt\.hash\(bootstrapPassword, 12\)/);
        assert.match(script, /connection\.rollback\(\)/);
    });

    await test("Account mail flows expose safe delivery-mode help and generate host-correct local links", async () => {
        const controller = file("server/controllers/accountLifecycleController.js");
        const mail = file("server/utils/emailService.js");
        assert.match(controller, /function emailDeliveryMode\(\)/);
        assert.match(controller, /emailDeliveryMode: emailDeliveryMode\(\)/);
        assert.match(controller, /APP_ORIGIN must be the HTTPS origin only in production/);
        assert.match(controller, /use the exact host through which the user reached/);
        assert.match(controller, /ALLOW_DEV_EMAIL_LINKS=true/);
        assert.match(mail, /async function verifySmtpConnection\(\)/);
        assert.match(mail, /function configurationStatus\(\)/);
        assert.ok(fs.existsSync(path.join(PROJECT_ROOT, "server/scripts/test-account-email.js")));
    });

    await test("Verification and reset pages remove stale development links and prevent token retention in URL", async () => {
        const verifyScript = file("client/accountSecurity/verifyEmail.js");
        const forgotScript = file("client/accountSecurity/forgotPassword.js");
        assert.match(verifyScript, /link\?\.remove\(\)/);
        assert.match(verifyScript, /history\.replaceState/);
        assert.match(forgotScript, /link\?\.remove\(\)/);
        assert.match(verifyScript, /emailDeliveryMode/);
        assert.match(forgotScript, /emailDeliveryMode/);
    });

    await test("Health endpoint is reachable", async () => {
        const r = await request("/api/health");
        assert.equal(r.response.status, 200);
        assert.equal(r.body?.success, true);
    });

    await test("Email verification and recovery pages are no-store and protected against framing", async () => {
        for (const route of ["/verifyEmail", "/forgotPassword", "/resetPassword", "/issueRecoveryCode"]) {
            const r = await request(route);
            assert.equal(r.response.status, 200, `${route} status`);
            assert.match(String(r.response.headers.get("cache-control") || ""), /no-store/i, `${route} cache control`);
            assert.match(String(r.response.headers.get("content-security-policy") || ""), /frame-ancestors 'none'/i, `${route} CSP`);
        }
    });

    await test("Invalid verification token is rejected", async () => {
        const r = await request("/api/auth/citizen/verification/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: "not-a-token" })
        });
        assert.equal(r.response.status, 400);
        assert.equal(r.body?.code, "INVALID_OR_EXPIRED_TOKEN");
    });

    await test("Invalid reset token is rejected before changing a password", async () => {
        const r = await request("/api/auth/password/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: "a".repeat(64), password: "short", confirm_password: "short" })
        });
        assert.equal(r.response.status, 400);
        assert.equal(r.body?.code, "INVALID_PASSWORD");
    });

    await test("Unknown email receives a generic password-reset response", async () => {
        const email = `part6-unknown-${Date.now()}@example.invalid`;
        const r = await request("/api/auth/password/forgot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        assert.equal(r.response.status, 200);
        assert.equal(r.body?.success, true);
        assert.match(r.body?.message || "", /If this address belongs to an eligible active SWACHHITRA account/i);
        assert.doesNotMatch(r.body?.message || "", /does not exist|unknown email/i);
    });

    console.log(`\nResult: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

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

async function test(label, callback) {
    try { await callback(); pass(label); }
    catch (error) { fail(label, error); }
}

async function request(route, options = {}) {
    const response = await fetch(`${BASE_URL}${route}`, {
        redirect: "manual",
        ...options,
        headers: { ...(options.headers || {}) }
    });
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

    await test("Password reset is available to active users in approved roles without changing Citizen verification rules", async () => {
        const controller = file("server/controllers/accountLifecycleController.js");
        assert.match(controller, /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]\.includes\(user\.role\) && user\.status === "active"/);
        assert.match(controller, /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]\.includes\(row\.role\) \|\| row\.status !== "active"/);
        assert.match(controller, /WHERE id = \? AND role = \? AND status = 'active'/);
        assert.match(controller, /INSERT INTO citizen_account_security \(user_id, email_verified_at, session_version\)[\s\S]*VALUES \(\?, NULL, 1\)[\s\S]*ON DUPLICATE KEY UPDATE[\s\S]*session_version = session_version \+ 1/);
        assert.match(controller, /If this address belongs to an eligible active SWACHHITRA account/);
        // Email verification remains restricted to Citizens.
        assert.match(controller, /if \(!row \|\| row\.role !== "citizen" \|\| row\.status !== "active"\)/);
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
        assert.match(file("client/citizenDash/citizenRegister.js"), /developmentVerificationPath/);
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
        assert.match(lifecycle, /CITIZEN_EMAIL_VERIFICATION_REQUIRED/);
        assert.match(lifecycle, /staff_activation_code/);
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
        const connectMatches = citizenProfileRoutes.match(/connect-src 'self' https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tile\.openstreetmap\.org/g) || [];
        assert.equal(imgMatches.length, 2, "both protected Citizen profile entry points should allow the base tile host");
        assert.equal(connectMatches.length, 2, "both protected Citizen profile entry points should allow same-host and tile connections");
        const mapScript = file("client/citizenDash/citizenProfile.js");
        assert.match(mapScript, /tileLayer\.on\("tileerror"/);
        assert.match(mapScript, /citizenMapTileStatus/);
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

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { sendAccountEmail, isConfigured: isEmailConfigured } = require("../utils/emailService");

const TOKEN_TTL_MS = {
    email_verification: 24 * 60 * 60 * 1000,
    password_reset: 30 * 60 * 1000
};

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
    return value.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
    return value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72;
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function devLinksAllowed() {
    return process.env.NODE_ENV !== "production" &&
        String(process.env.ALLOW_DEV_EMAIL_LINKS || "false").toLowerCase() === "true";
}

function absoluteOrigin(req) {
    // Production links must use the trusted configured public origin. Do not
    // build public email links from an arbitrary Host header in production.
    if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
        const configured = String(process.env.APP_ORIGIN || "").trim();
        if (!configured) throw new Error("APP_ORIGIN is required for production email links.");
        const parsed = new URL(configured);
        if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
            throw new Error("APP_ORIGIN must be the HTTPS origin only in production.");
        }
        return parsed.origin;
    }

    // In local development use the exact host through which the user reached
    // the app. This prevents a stale APP_ORIGIN (for example localhost while
    // browsing via 127.0.0.1 or a LAN IP) from generating unusable links.
    const protocol = req.protocol === "https" ? "https" : "http";
    const host = String(req.get("host") || "localhost:5000").trim();
    const parsedRequestOrigin = new URL(`${protocol}://${host}`);
    if (!["http:", "https:"].includes(parsedRequestOrigin.protocol) || parsedRequestOrigin.username || parsedRequestOrigin.password) {
        throw new Error("Could not determine a safe local application origin for the account link.");
    }
    return parsedRequestOrigin.origin;
}

function emailDeliveryMode() {
    if (devLinksAllowed()) return "development_link";
    return isEmailConfigured() ? "smtp" : "not_configured";
}

function emailDeliveryHelp() {
    if (devLinksAllowed()) {
        return "Local development links are enabled. Open the local link shown below to continue.";
    }
    if (!isEmailConfigured()) {
        return "Email delivery is not configured. For local testing, set ALLOW_DEV_EMAIL_LINKS=true in the project-root .env and restart the server, or configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM.";
    }
    return "The email server is configured. If the message does not arrive, check the server terminal for the sanitized SMTP error code, confirm SMTP credentials and sender verification, and check Spam/Junk.";
}

function emailResultStatus(result, error) {
    if (error) return "failed";
    if (result?.sent === true) return "sent";
    if (result?.reason === "not_configured") return "not_configured";
    return "not_sent";
}

function relativeLink(path, token) {
    const url = new URL(path, "http://localhost");
    url.searchParams.set("token", token);
    return `${url.pathname}${url.search}`;
}

function absoluteLink(req, path, token) {
    const url = new URL(path, `${absoluteOrigin(req)}/`);
    url.searchParams.set("token", token);
    return url.toString();
}

async function createToken(connection, userId, purpose) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const ttlSeconds = Math.floor(TOKEN_TTL_MS[purpose] / 1000);

    await connection.execute(
        `UPDATE citizen_account_tokens
         SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3))
         WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
        [userId, purpose]
    );
    await connection.execute(
        `INSERT INTO citizen_account_tokens
            (user_id, purpose, token_hash, expires_at, used_at)
         VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), NULL)`,
        [userId, purpose, tokenHash, ttlSeconds]
    );
    return rawToken;
}

async function issueTokenForUser(userId, purpose) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const token = await createToken(connection, userId, purpose);
        await connection.commit();
        return token;
    } catch (error) {
        try { await connection.rollback(); } catch { /* preserve original error */ }
        throw error;
    } finally {
        connection.release();
    }
}

async function sendVerification(req, email, token) {
    const url = absoluteLink(req, "/verifyEmail", token);
    const text = [
        "Welcome to SWACHHITRA.",
        "Verify your Citizen account by opening this link:",
        url,
        "This link expires in 24 hours. If you did not create the account, ignore this message."
    ].join("\n\n");
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Verify your SWACHHITRA Citizen account</h2><p>Confirm that you control this email address to activate Citizen sign-in.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#25451b;color:#fff;text-decoration:none;border-radius:8px">Verify email address</a></p><p>This link expires in 24 hours. If you did not create the account, ignore this message.</p></div>`;
    return sendAccountEmail({ to: email, subject: "Verify your SWACHHITRA Citizen account", text, html });
}

async function sendPasswordReset(req, email, token) {
    const url = absoluteLink(req, "/resetPassword", token);
    const text = [
        "A password reset was requested for your SWACHHITRA account.",
        "Choose a new password using this link:",
        url,
        "This link expires in 30 minutes and works only once. If you did not request a reset, ignore this message."
    ].join("\n\n");
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Reset your SWACHHITRA password</h2><p>Use the link below to choose a new password.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#25451b;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p><p>This link expires in 30 minutes and works only once. If you did not request a reset, ignore this message.</p></div>`;
    return sendAccountEmail({ to: email, subject: "Reset your SWACHHITRA password", text, html });
}

function reportEmailDeliveryError(error, operation) {
    // Never log the token, email address, SMTP credentials, or provider response.
    const allowedCode = String(error?.code || "provider_error").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "provider_error";
    const responseCode = Number(error?.responseCode);
    const smtpCode = Number.isInteger(responseCode) && responseCode >= 400 && responseCode <= 599 ? `, SMTP ${responseCode}` : "";
    console.error(`${operation} email delivery failed (${allowedCode}${smtpCode}). Check SMTP_HOST/PORT/SECURE, authentication, outbound network access and the verified sender address.`);
}

async function cleanupExpiredAccountTokens() {
    const [result] = await db.execute(
        `DELETE FROM citizen_account_tokens
         WHERE expires_at <= UTC_TIMESTAMP(3)
            OR (used_at IS NOT NULL AND used_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY)`
    );
    return Number(result.affectedRows || 0);
}

function validateTokenString(value) {
    const token = String(value || "").trim();
    return /^[a-f0-9]{64}$/i.test(token) ? token : "";
}

function sendValidationError(res, code, message) {
    return res.status(400).json({ success: false, code, message });
}

async function registerCitizen(req, res) {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirm_password || req.body?.password_confirmation || "");

    if (!email || !validEmail(email)) return sendValidationError(res, "INVALID_EMAIL", "Enter a valid email address.");
    if (!validPassword(password)) return sendValidationError(res, "INVALID_PASSWORD", "Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
    if (password !== confirmation) return sendValidationError(res, "PASSWORD_MISMATCH", "Password and confirmation do not match.");

    const passwordHash = await bcrypt.hash(password, 12);
    const connection = await db.getConnection();
    let userId;
    let token;
    try {
        await connection.beginTransaction();
        const [insert] = await connection.execute(
            "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'citizen', 'active')",
            [email, passwordHash]
        );
        userId = Number(insert.insertId);
        await connection.execute(
            "INSERT INTO citizen_account_security (user_id, email_verified_at, session_version) VALUES (?, NULL, 0)",
            [userId]
        );
        token = await createToken(connection, userId, "email_verification");
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch { /* preserve original error */ }
        if (error?.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                code: "EMAIL_ALREADY_REGISTERED",
                message: "An account with this email already exists. Sign in or request account help."
            });
        }
        console.error("Citizen registration failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to create the Citizen account right now." });
    } finally {
        connection.release();
    }

    let emailSent = false;
    let emailError = null;
    let emailResult = null;
    try {
        emailResult = await sendVerification(req, email, token);
        emailSent = emailResult.sent === true;
    } catch (error) {
        emailError = error;
        reportEmailDeliveryError(error, "Verification");
    }

    const deliveryStatus = emailResultStatus(emailResult, emailError);
    const response = {
        success: true,
        verificationRequired: true,
        emailSent,
        emailDeliveryStatus: deliveryStatus,
        emailDeliveryMode: emailDeliveryMode(),
        message: emailSent
            ? "Account created. Check your inbox and Spam/Junk folder for the verification email before signing in."
            : deliveryStatus === "not_configured"
                ? "Account created, but this server cannot send email yet. Enable local development links or configure SMTP as described below."
                : "Account created, but the verification email was not delivered. Check the server terminal and SMTP configuration, then request a new link."
    };
    if (devLinksAllowed()) {
        response.developmentVerificationPath = relativeLink("/verifyEmail", token);
        if (!emailSent) response.message = "Account created. Use the local development verification link below; SMTP email delivery is not available or did not succeed.";
    }
    if (deliveryStatus === "not_configured") response.deliveryHelp = emailDeliveryHelp();
    else if (deliveryStatus === "failed" || deliveryStatus === "not_sent") response.deliveryHelp = emailDeliveryHelp();
    return res.status(201).json(response);
}

async function requestEmailVerification(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!email || !validEmail(email)) return sendValidationError(res, "INVALID_EMAIL", "Enter a valid email address.");

    let developmentVerificationPath;
    try {
        const [rows] = await db.execute(
            `SELECT u.id, u.email, u.role, u.status, s.email_verified_at
             FROM users u
             LEFT JOIN citizen_account_security s ON s.user_id = u.id
             WHERE u.email = ? LIMIT 1`,
            [email]
        );
        const user = rows[0];
        if (user && user.role === "citizen" && user.status === "active" && !user.email_verified_at) {
            const token = await issueTokenForUser(Number(user.id), "email_verification");
            try { await sendVerification(req, user.email, token); }
            catch (error) { reportEmailDeliveryError(error, "Verification resend"); }
            if (devLinksAllowed()) developmentVerificationPath = relativeLink("/verifyEmail", token);
        }
    } catch (error) {
        console.error("Verification resend failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to process the request right now." });
    }

    const response = {
        success: true,
        message: "If this address belongs to an unverified Citizen account, a verification link will be sent. Check Inbox and Spam/Junk.",
        emailDeliveryMode: emailDeliveryMode()
    };
    if (developmentVerificationPath) {
        response.developmentVerificationPath = developmentVerificationPath;
        response.message = "If this is an unverified Citizen account, use the local development verification link below. The link appears only for eligible accounts.";
    } else if (response.emailDeliveryMode === "not_configured") {
        response.deliveryHelp = emailDeliveryHelp();
    } else if (response.emailDeliveryMode === "smtp") {
        response.deliveryHelp = emailDeliveryHelp();
    }
    return res.json(response);
}

async function confirmEmailVerification(req, res) {
    const token = validateTokenString(req.body?.token);
    if (!token) return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This verification link is invalid or expired. Request a new link.");

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            `SELECT t.id AS token_id, t.user_id, u.role, u.status
             FROM citizen_account_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND t.purpose = 'email_verification'
               AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP(3)
             LIMIT 1 FOR UPDATE`,
            [hashToken(token)]
        );
        const row = rows[0];
        if (!row || row.role !== "citizen" || row.status !== "active") {
            await connection.rollback();
            return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This verification link is invalid or expired. Request a new link.");
        }

        await connection.execute(
            "UPDATE citizen_account_security SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3)) WHERE user_id = ?",
            [row.user_id]
        );
        await connection.execute(
            "UPDATE citizen_account_tokens SET used_at = UTC_TIMESTAMP(3) WHERE id = ? AND used_at IS NULL",
            [row.token_id]
        );
        await connection.execute(
            "UPDATE citizen_account_tokens SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3)) WHERE user_id = ? AND purpose = 'email_verification' AND used_at IS NULL",
            [row.user_id]
        );
        await connection.commit();
        return res.json({ success: true, message: "Email verified. You can now sign in to SWACHHITRA." });
    } catch (error) {
        try { await connection.rollback(); } catch { /* no active transaction */ }
        console.error("Email verification failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to verify this email right now." });
    } finally {
        connection.release();
    }
}

async function requestPasswordReset(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!email || !validEmail(email)) return sendValidationError(res, "INVALID_EMAIL", "Enter a valid email address.");

    let developmentResetPath;
    try {
        const [rows] = await db.execute(
            `SELECT u.id, u.email, u.role, u.status
             FROM users u WHERE u.email = ? LIMIT 1`,
            [email]
        );
        const user = rows[0];
        if (user && ["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"].includes(user.role) && user.status === "active") {
            const token = await issueTokenForUser(Number(user.id), "password_reset");
            try { await sendPasswordReset(req, user.email, token); }
            catch (error) { reportEmailDeliveryError(error, "Password reset"); }
            if (devLinksAllowed()) developmentResetPath = relativeLink("/resetPassword", token);
        }
    } catch (error) {
        console.error("Password reset request failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to process the request right now." });
    }

    const response = {
        success: true,
        message: "If this address belongs to an eligible active SWACHHITRA account, password reset instructions will be sent. Check Inbox and Spam/Junk.",
        emailDeliveryMode: emailDeliveryMode()
    };
    if (developmentResetPath) {
        response.developmentResetPath = developmentResetPath;
        response.message = "If this is an eligible active SWACHHITRA account, use the local development password-reset link below. The link appears only for eligible accounts.";
    } else if (response.emailDeliveryMode === "not_configured") {
        response.deliveryHelp = emailDeliveryHelp();
    } else if (response.emailDeliveryMode === "smtp") {
        response.deliveryHelp = emailDeliveryHelp();
    }
    return res.json(response);
}

async function resetPassword(req, res) {
    const token = validateTokenString(req.body?.token);
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirm_password || req.body?.password_confirmation || "");

    if (!token) return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired. Request a new link.");
    if (!validPassword(password)) return sendValidationError(res, "INVALID_PASSWORD", "Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
    if (password !== confirmation) return sendValidationError(res, "PASSWORD_MISMATCH", "Password and confirmation do not match.");

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            `SELECT t.id AS token_id, t.user_id, u.role, u.status
             FROM citizen_account_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND t.purpose = 'password_reset'
               AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP(3)
             LIMIT 1 FOR UPDATE`,
            [hashToken(token)]
        );
        const row = rows[0];
        if (!row || !["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"].includes(row.role) || row.status !== "active") {
            await connection.rollback();
            return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired. Request a new link.");
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const [passwordUpdate] = await connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND role = ? AND status = 'active'",
            [passwordHash, row.user_id, row.role]
        );
        if (passwordUpdate.affectedRows !== 1) {
            await connection.rollback();
            return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired. Request a new link.");
        }

        if (row.role === "citizen") {
            const [securityUpdate] = await connection.execute(
                "UPDATE citizen_account_security SET session_version = session_version + 1 WHERE user_id = ?",
                [row.user_id]
            );
            if (securityUpdate.affectedRows !== 1) throw new Error("Citizen account security record is missing.");
        } else {
            // The existing security table also stores session versions for Drivers.
            // A Driver's email remains unverified/not applicable; only the version is used here.
            await connection.execute(
                `INSERT INTO citizen_account_security (user_id, email_verified_at, session_version)
                 VALUES (?, NULL, 1)
                 ON DUPLICATE KEY UPDATE
                    session_version = session_version + 1,
                    updated_at = CURRENT_TIMESTAMP(3)`,
                [row.user_id]
            );
        }
        await connection.execute(
            "UPDATE citizen_account_tokens SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3)) WHERE user_id = ? AND used_at IS NULL",
            [row.user_id]
        );
        await connection.commit();
        return res.json({ success: true, message: "Password changed. All existing sessions have been invalidated; sign in with your new password." });
    } catch (error) {
        try { await connection.rollback(); } catch { /* no active transaction */ }
        console.error("Password reset failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to reset the password right now." });
    } finally {
        connection.release();
    }
}

module.exports = {
    registerCitizen,
    requestEmailVerification,
    confirmEmailVerification,
    requestPasswordReset,
    resetPassword,
    cleanupExpiredAccountTokens
};

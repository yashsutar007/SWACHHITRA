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
    if (isEmailConfigured()) return "smtp";
    return "not_configured";
}


function emailDeliveryHelp() {
    if (devLinksAllowed()) {
        return "Local development links are enabled. Open the local link shown below to continue.";
    }
    if (!isEmailConfigured()) {
        if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
            return "Email delivery is not configured on this server. Password-reset links cannot be sent until an administrator configures SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM.";
        }
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

    try {
        await connection.beginTransaction();
        const [insert] = await connection.execute(
            "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'citizen', 'active')",
            [email, passwordHash]
        );
        userId = Number(insert.insertId);

        /*
         * Requested demo onboarding: Citizens can create an account and
         * immediately complete their profile without an email-verification
         * round trip. This intentionally does NOT prove ownership of the
         * mailbox; users must enter an address they control so password-reset
         * email can reach them. Re-enable verified/pending signup if the site
         * later adopts mandatory email ownership verification.
         */
        await connection.execute(
            `INSERT INTO citizen_account_security
                (user_id, email_verified_at, session_version)
             VALUES (?, UTC_TIMESTAMP(3), 0)`,
            [userId]
        );
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch { /* preserve original error */ }
        if (error?.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                code: "EMAIL_ALREADY_REGISTERED",
                message: "An account with this email already exists. Sign in or use Forgot Password."
            });
        }
        console.error("Citizen registration failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to create the Citizen account right now." });
    } finally {
        connection.release();
    }

    // Establish a fresh session so the Citizen can proceed straight to the
    // protected profile/location setup page after successful registration.
    try {
        await new Promise((resolve, reject) => {
            req.session.regenerate(error => error ? reject(error) : resolve());
        });
        req.session.userId = userId;
        req.session.email = email;
        req.session.role = "citizen";
        req.session.sessionVersion = 0;
        await new Promise((resolve, reject) => {
            req.session.save(error => error ? reject(error) : resolve());
        });

        return res.status(201).json({
            success: true,
            accountCreated: true,
            authenticated: true,
            emailVerified: true,
            redirectTo: "/citizenDash/profile",
            message: "Citizen account created. Continue to create your profile and confirm your Ward."
        });
    } catch (error) {
        console.error("Citizen post-registration session failed.", error?.code || "session_error");
        // The account is already committed; allow the user to sign in normally.
        return res.status(201).json({
            success: true,
            accountCreated: true,
            authenticated: false,
            redirectTo: "/login",
            message: "Your account was created. Sign in with your email and password to continue to your profile."
        });
    }
}

async function requestEmailVerification(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!email || !validEmail(email)) return sendValidationError(res, "INVALID_EMAIL", "Enter a valid email address.");
    if (!isEmailConfigured() && !devLinksAllowed()) {
        return res.json({
            success: true,
            message: "If this address belongs to an unverified Citizen account, a verification link will be sent when email delivery is configured.",
            emailDeliveryMode: "not_configured",
            deliveryHelp: emailDeliveryHelp()
        });
    }

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
            `SELECT t.id AS token_id, t.user_id, u.email, u.role, u.status
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

/*
 * Password reset is assignment-aware for staff:
 * - Drivers must have a linked login that matches their Inspector-managed
 *   Driver Registry email, an active Ward/Zone/Division, and an active
 *   Inspector assigned to that same Ward by an active AC.
 * - Inspectors must have an assigned active Ward/Division and still be
 *   assigned by an active AC in that Division. Their official email must
 *   match the account email.
 * - Assistant Commissioners need an active Division profile.
 * - Citizens and the city-wide Deputy Commissioner retain standard email
 *   reset behavior.
 * The identical eligibility predicate is reused at token redemption so an
 * assignment being removed after the email request invalidates the link.
 */
const PASSWORD_RESET_ELIGIBILITY_SQL = `(
    u.role = 'citizen'
    OR u.role = 'deputy_commissioner'
    OR (
        u.role = 'assistant_commissioner'
        AND EXISTS (
            SELECT 1
            FROM user_profiles ac_profile
            INNER JOIN divisions ac_division
                ON ac_division.id = ac_profile.division_id
               AND ac_division.status = 'active'
            WHERE ac_profile.user_id = u.id
              AND ac_profile.division_id IS NOT NULL
        )
    )
    OR (
        u.role = 'sanitary_inspector'
        AND EXISTS (
            SELECT 1
            FROM user_profiles inspector_profile
            INNER JOIN divisions inspector_division
                ON inspector_division.id = inspector_profile.division_id
               AND inspector_division.status = 'active'
            INNER JOIN zones inspector_zone
                ON inspector_zone.id = inspector_profile.zone_id
               AND inspector_zone.status = 'active'
            INNER JOIN wards inspector_ward
                ON inspector_ward.id = inspector_profile.ward_id
               AND inspector_ward.division_id = inspector_profile.division_id
               AND inspector_ward.zone_id = inspector_profile.zone_id
               AND inspector_ward.status = 'active'
            INNER JOIN users assigning_ac
                ON assigning_ac.id = inspector_profile.scope_assigned_by
               AND assigning_ac.role = 'assistant_commissioner'
               AND assigning_ac.status = 'active'
            INNER JOIN user_profiles assigning_ac_profile
                ON assigning_ac_profile.user_id = assigning_ac.id
               AND assigning_ac_profile.division_id = inspector_profile.division_id
            WHERE inspector_profile.user_id = u.id
              AND LOWER(CONVERT(TRIM(inspector_profile.official_email) USING utf8mb4)) COLLATE utf8mb4_unicode_ci
                  = LOWER(CONVERT(u.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci
        )
    )
    OR (
        u.role = 'driver'
        AND EXISTS (
            SELECT 1
            FROM drivers driver_registry
            INNER JOIN wards driver_ward
                ON driver_ward.id = driver_registry.assigned_ward_id
               AND driver_ward.status = 'active'
            INNER JOIN zones driver_zone
                ON driver_zone.id = driver_ward.zone_id
               AND driver_zone.status = 'active'
            INNER JOIN divisions driver_division
                ON driver_division.id = driver_ward.division_id
               AND driver_division.status = 'active'
            INNER JOIN user_profiles driver_profile
                ON driver_profile.user_id = u.id
               AND driver_profile.ward_id = driver_ward.id
               AND driver_profile.division_id = driver_ward.division_id
               AND driver_profile.zone_id = driver_ward.zone_id
            INNER JOIN user_profiles assigned_inspector_profile
                ON assigned_inspector_profile.ward_id = driver_ward.id
               AND assigned_inspector_profile.division_id = driver_ward.division_id
            INNER JOIN users assigned_inspector
                ON assigned_inspector.id = assigned_inspector_profile.user_id
               AND assigned_inspector.role = 'sanitary_inspector'
               AND assigned_inspector.status = 'active'
            INNER JOIN users assigning_ac
                ON assigning_ac.id = assigned_inspector_profile.scope_assigned_by
               AND assigning_ac.role = 'assistant_commissioner'
               AND assigning_ac.status = 'active'
            INNER JOIN user_profiles assigning_ac_profile
                ON assigning_ac_profile.user_id = assigning_ac.id
               AND assigning_ac_profile.division_id = driver_ward.division_id
            WHERE driver_registry.user_id = u.id
              AND driver_registry.status <> 'inactive'
              AND LOWER(CONVERT(TRIM(driver_registry.email) USING utf8mb4)) COLLATE utf8mb4_unicode_ci
                  = LOWER(CONVERT(u.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci
              AND LOWER(
                    COALESCE(
                        NULLIF(
                            CONVERT(driver_profile.official_email USING utf8mb4) COLLATE utf8mb4_unicode_ci,
                            _utf8mb4'' COLLATE utf8mb4_unicode_ci
                        ),
                        CONVERT(u.email USING utf8mb4) COLLATE utf8mb4_unicode_ci
                    )
                  ) COLLATE utf8mb4_unicode_ci
                  = LOWER(CONVERT(u.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci
        )
    )
)`;

async function findEligiblePasswordResetTarget(executor, email, userId = null) {
    const whereUserId = userId === null || userId === undefined ? "" : " AND u.id = ?";
    const params = [normalizeEmail(email)];
    if (whereUserId) params.push(Number(userId));

    const [rows] = await executor.execute(
        `SELECT u.id, u.email, u.role, u.status
         FROM users u
         WHERE LOWER(CONVERT(u.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci
             = LOWER(CONVERT(? USING utf8mb4)) COLLATE utf8mb4_unicode_ci
           AND u.status = 'active'
           AND ${PASSWORD_RESET_ELIGIBILITY_SQL}
           ${whereUserId}
         LIMIT 1`,
        params
    );
    return rows[0] || null;
}

async function invalidateOutstandingPasswordResetTokens(userId) {
    await db.execute(
        `UPDATE citizen_account_tokens
         SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3))
         WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL`,
        [Number(userId)]
    );
}

async function requestPasswordReset(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!email || !validEmail(email)) return sendValidationError(res, "INVALID_EMAIL", "Enter a valid email address.");

    const smtpConfigured = isEmailConfigured();
    const localDevelopmentLinks = !smtpConfigured && devLinksAllowed();
    const deliveryMode = smtpConfigured
        ? "smtp"
        : localDevelopmentLinks
            ? "development_link"
            : "not_configured";

    let developmentResetPath;
    try {
        // Unassigned/inactive staff and unknown addresses receive the exact
        // same public response as valid accounts; no reset URL is returned.
        const user = await findEligiblePasswordResetTarget(db, email);
        if (user && (smtpConfigured || localDevelopmentLinks)) {
            const token = await issueTokenForUser(Number(user.id), "password_reset");
            if (smtpConfigured) {
                try {
                    const mailResult = await sendPasswordReset(req, user.email, token);
                    if (mailResult?.sent !== true) {
                        await invalidateOutstandingPasswordResetTokens(Number(user.id));
                        reportEmailDeliveryError({ code: mailResult?.reason || "not_sent" }, "Password reset");
                    }
                } catch (error) {
                    try { await invalidateOutstandingPasswordResetTokens(Number(user.id)); } catch { /* do not expose delivery internals */ }
                    reportEmailDeliveryError(error, "Password reset");
                }
            } else {
                // This branch is restricted to local development by devLinksAllowed().
                developmentResetPath = relativeLink("/resetPassword", token);
            }
        }
    } catch (error) {
        console.error("Password reset request failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to process the request right now." });
    }

    const response = {
        success: true,
        message: "If this address belongs to an eligible active SWACHHITRA account and its current assignment permits recovery, a password reset link will be sent by email. Check Inbox and Spam/Junk.",
        emailDeliveryMode: deliveryMode
    };

    if (developmentResetPath) {
        response.developmentResetPath = developmentResetPath;
        response.message = "If this address belongs to an eligible active SWACHHITRA account, use the local development reset link below.";
    } else {
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
            `SELECT t.id AS token_id, t.user_id, u.email, u.role, u.status
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

        // Re-check role-specific assignment at redemption. If an Inspector
        // lost the Ward/AC assignment or a Driver lost their Registry link
        // after the email was requested, the link is no longer accepted.
        const eligibleAtRedemption = await findEligiblePasswordResetTarget(
            connection,
            row.email,
            Number(row.user_id)
        );
        if (!eligibleAtRedemption) {
            await connection.rollback();
            return sendValidationError(res, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid, expired, or the account's required assignment is no longer active.");
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
                `UPDATE citizen_account_security
                 SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3)),
                     session_version = session_version + 1
                 WHERE user_id = ?`,
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

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const RECOVERY_CODE_TTL_MINUTES = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECOVERY_CODE_RE = /^[a-f0-9]{32}$/i;
const CODE_ISSUE_WINDOW_MS = 15 * 60 * 1000;
const CODE_ISSUE_MAX = 5;
const codeIssueBuckets = new Map();

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function validPassword(value) {
    return value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72;
}

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token).toLowerCase(), "utf8").digest("hex");
}

function validationError(res, message, code = "INVALID_RECOVERY_DETAILS") {
    return res.status(400).json({ success: false, code, message });
}

function allowCodeIssue(req, res, role) {
    const now = Date.now();
    for (const [key, bucket] of codeIssueBuckets) {
        if (now - bucket.startedAt >= CODE_ISSUE_WINDOW_MS) codeIssueBuckets.delete(key);
    }
    const issuerId = Number(req.currentUser?.id) || 0;
    const key = `${role}:${issuerId}:${String(req.ip || req.socket?.remoteAddress || "unknown")}`;
    let bucket = codeIssueBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= CODE_ISSUE_WINDOW_MS) {
        bucket = { startedAt: now, count: 0 };
    }
    if (bucket.count >= CODE_ISSUE_MAX) {
        const retryAfter = Math.max(1, Math.ceil((CODE_ISSUE_WINDOW_MS - (now - bucket.startedAt)) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({ success: false, code: "RECOVERY_CODE_ISSUE_LIMITED", message: "Too many recovery codes were issued. Wait before issuing another code." });
    }
    bucket.count += 1;
    codeIssueBuckets.set(key, bucket);
    return null;
}

async function createRecoveryCode(connection, userId) {
    const code = crypto.randomBytes(16).toString("hex");
    await connection.execute(
        `UPDATE citizen_account_tokens
         SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3))
         WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL`,
        [userId]
    );
    await connection.execute(
        `INSERT INTO citizen_account_tokens
            (user_id, purpose, token_hash, expires_at, used_at)
         VALUES (?, 'password_reset', ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE), NULL)`,
        [userId, hashToken(code), RECOVERY_CODE_TTL_MINUTES]
    );
    return code;
}

async function issueDriverRecoveryCode(req, res) {
    const inspectorUserId = Number(req.currentUser?.id);
    const email = normalizeEmail(req.body?.email);

    if (!Number.isSafeInteger(inspectorUserId) || inspectorUserId <= 0) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!email || email.length > 190 || !EMAIL_RE.test(email)) {
        return validationError(res, "INVALID_EMAIL", "Enter the Driver's assigned login email address.");
    }
    const rateLimited = allowCodeIssue(req, res, "sanitary_inspector");
    if (rateLimited) return rateLimited;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // The target must be a real active Driver login linked to an active
        // Driver Registry row in the current Inspector's own Ward/Division.
        const [rows] = await connection.execute(
            `SELECT u.id AS user_id
             FROM users u
             INNER JOIN drivers dr ON dr.user_id = u.id
             INNER JOIN wards w ON w.id = dr.assigned_ward_id
             INNER JOIN zones z ON z.id = w.zone_id
             INNER JOIN user_profiles inspector_scope
                ON inspector_scope.user_id = ?
               AND inspector_scope.ward_id = w.id
               AND inspector_scope.division_id = w.division_id
             WHERE LOWER(u.email) = ?
               AND u.role = 'driver' AND u.status = 'active'
               AND dr.status <> 'inactive'
               AND w.status = 'active' AND z.status = 'active'
             LIMIT 1 FOR UPDATE`,
            [inspectorUserId, email]
        );

        if (!rows[0]) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "No active Driver login was found in your assigned Ward/Division. Verify the Driver Registry assignment and login email."
            });
        }

        const code = await createRecoveryCode(connection, Number(rows[0].user_id));
        await connection.commit();

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            recoveryCode: code,
            expiresInMinutes: RECOVERY_CODE_TTL_MINUTES,
            message: "Give this one-time code directly to the assigned Driver. It can be used once within 30 minutes. The code is not sent by email and will not be shown again."
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch { /* preserve original error */ }
        }
        console.error("Driver recovery-code issue failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to issue a recovery code right now." });
    } finally {
        connection?.release();
    }
}

async function issueInspectorRecoveryCode(req, res) {
    const assistantUserId = Number(req.currentUser?.id);
    const email = normalizeEmail(req.body?.email);

    if (!Number.isSafeInteger(assistantUserId) || assistantUserId <= 0) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!email || email.length > 190 || !EMAIL_RE.test(email)) {
        return validationError(res, "INVALID_EMAIL", "Enter the Inspector's assigned login email address.");
    }
    const rateLimited = allowCodeIssue(req, res, "assistant_commissioner");
    if (rateLimited) return rateLimited;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // An Assistant Commissioner can issue a code only for an active
        // Inspector whom that account assigned in its own active Division.
        const [rows] = await connection.execute(
            `SELECT u.id AS user_id
             FROM users u
             INNER JOIN user_profiles target_profile ON target_profile.user_id = u.id
             INNER JOIN user_profiles issuer_profile
                ON issuer_profile.user_id = ?
               AND issuer_profile.division_id = target_profile.division_id
             INNER JOIN divisions dv ON dv.id = target_profile.division_id AND dv.status = 'active'
             INNER JOIN wards w
                ON w.id = target_profile.ward_id
               AND w.division_id = target_profile.division_id
               AND w.status = 'active'
             WHERE LOWER(u.email) = ?
               AND u.role = 'sanitary_inspector' AND u.status = 'active'
               AND target_profile.scope_assigned_by = issuer_profile.user_id
             LIMIT 1 FOR UPDATE`,
            [assistantUserId, email]
        );

        if (!rows[0]) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "No active Inspector account assigned by you in your current Division was found. Verify the Inspector's assignment and login email."
            });
        }

        const code = await createRecoveryCode(connection, Number(rows[0].user_id));
        await connection.commit();

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            recoveryCode: code,
            expiresInMinutes: RECOVERY_CODE_TTL_MINUTES,
            message: "Give this one-time code directly to the assigned Inspector. It can be used once within 30 minutes. The code is not sent by email and will not be shown again."
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch { /* preserve original error */ }
        }
        console.error("Inspector recovery-code issue failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to issue a recovery code right now." });
    } finally {
        connection?.release();
    }
}

async function assignmentStillValid(connection, userId, role) {
    let rows;
    if (role === "driver") {
        [rows] = await connection.execute(
            `SELECT dr.id
             FROM drivers dr
             INNER JOIN users driver_user ON driver_user.id = dr.user_id
             INNER JOIN wards w ON w.id = dr.assigned_ward_id AND w.status = 'active'
             INNER JOIN zones z ON z.id = w.zone_id AND z.status = 'active'
             INNER JOIN user_profiles driver_profile
                ON driver_profile.user_id = driver_user.id
               AND driver_profile.ward_id = w.id
               AND driver_profile.division_id = w.division_id
               AND driver_profile.zone_id = w.zone_id
             WHERE dr.user_id = ?
               AND dr.status <> 'inactive'
               AND EXISTS (
                    SELECT 1
                    FROM users inspector_user
                    INNER JOIN user_profiles inspector_profile
                        ON inspector_profile.user_id = inspector_user.id
                       AND inspector_profile.ward_id = w.id
                       AND inspector_profile.division_id = w.division_id
                    WHERE inspector_user.role = 'sanitary_inspector'
                      AND inspector_user.status = 'active'
               )
             LIMIT 1 FOR UPDATE`,
            [userId]
        );
        return rows.length > 0;
    }

    if (role === "sanitary_inspector") {
        [rows] = await connection.execute(
            `SELECT target_profile.user_id
             FROM user_profiles target_profile
             INNER JOIN divisions dv
                ON dv.id = target_profile.division_id AND dv.status = 'active'
             INNER JOIN wards w
                ON w.id = target_profile.ward_id
               AND w.division_id = target_profile.division_id
               AND w.status = 'active'
             INNER JOIN users assigning_ac
                ON assigning_ac.id = target_profile.scope_assigned_by
               AND assigning_ac.role = 'assistant_commissioner'
               AND assigning_ac.status = 'active'
             INNER JOIN user_profiles ac_profile
                ON ac_profile.user_id = assigning_ac.id
               AND ac_profile.division_id = target_profile.division_id
             WHERE target_profile.user_id = ?
             LIMIT 1 FOR UPDATE`,
            [userId]
        );
        return rows.length > 0;
    }

    return false;
}

async function resetPasswordWithRecoveryCode(req, res) {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || req.body?.recoveryCode || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirm_password || req.body?.password_confirmation || "");

    if (!email || email.length > 190 || !EMAIL_RE.test(email)) {
        return validationError(res, "INVALID_EMAIL", "Enter the email address assigned to your account.");
    }
    if (!RECOVERY_CODE_RE.test(code)) {
        return validationError(res, "INVALID_OR_EXPIRED_CODE", "The recovery code is invalid or expired. Ask the assigning authority for a new code.");
    }
    if (!validPassword(password)) {
        return validationError(res, "INVALID_PASSWORD", "Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
    }
    if (password !== confirmation) {
        return validationError(res, "PASSWORD_MISMATCH", "Password and confirmation do not match.");
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [tokenRows] = await connection.execute(
            `SELECT t.id AS token_id, t.user_id, u.role, u.status
             FROM citizen_account_tokens t
             INNER JOIN users u ON u.id = t.user_id
             WHERE LOWER(u.email) = ?
               AND t.token_hash = ?
               AND t.purpose = 'password_reset'
               AND t.used_at IS NULL
               AND t.expires_at > UTC_TIMESTAMP(3)
             LIMIT 1 FOR UPDATE`,
            [email, hashToken(code)]
        );
        const tokenRow = tokenRows[0];

        if (!tokenRow || tokenRow.status !== "active" || !["driver", "sanitary_inspector"].includes(tokenRow.role)) {
            await connection.rollback();
            return validationError(res, "INVALID_OR_EXPIRED_CODE", "The recovery code or account is invalid, expired, inactive, or no longer assigned.");
        }

        if (!(await assignmentStillValid(connection, Number(tokenRow.user_id), tokenRow.role))) {
            await connection.rollback();
            return validationError(res, "INVALID_OR_EXPIRED_CODE", "The recovery code or account is invalid, expired, inactive, or no longer assigned.");
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const [update] = await connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND role = ? AND status = 'active'",
            [passwordHash, Number(tokenRow.user_id), tokenRow.role]
        );
        if (update.affectedRows !== 1) {
            await connection.rollback();
            return validationError(res, "INVALID_OR_EXPIRED_CODE", "The recovery code or account is invalid, expired, inactive, or no longer assigned.");
        }

        await connection.execute(
            `INSERT INTO citizen_account_security (user_id, email_verified_at, session_version)
             VALUES (?, NULL, 1)
             ON DUPLICATE KEY UPDATE
                session_version = session_version + 1,
                updated_at = CURRENT_TIMESTAMP(3)`,
            [Number(tokenRow.user_id)]
        );
        await connection.execute(
            "UPDATE citizen_account_tokens SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3)) WHERE user_id = ? AND used_at IS NULL",
            [Number(tokenRow.user_id)]
        );

        await connection.commit();
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            message: "Password created successfully. All existing sessions have been invalidated. Sign in with your new password."
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch { /* preserve original error */ }
        }
        console.error("Staff password activation failed.", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to set the password right now. Please request a new code if the problem continues." });
    } finally {
        connection?.release();
    }
}

module.exports = {
    issueDriverRecoveryCode,
    issueInspectorRecoveryCode,
    resetPasswordWithRecoveryCode
};

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { getWardPlanningBoundary } = require("../utils/geography");

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength) {
    const text = String(value ?? "").trim();
    if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
        return null;
    }
    return text;
}

function validEmail(value) {
    return typeof value === "string" &&
        value.length <= 190 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * POST /api/assistant/inspectors/accounts
 *
 * Provision a Sanitary Inspector account inside the authenticated Assistant
 * Commissioner's division and assign its initial Ward in the same transaction.
 * The official email, identity and scope are entered/approved by the AC; the
 * employee chooses their own password through the single-use reset flow.
 */
async function createInspectorAccount(req, res) {
    const assistantUserId = positiveInteger(req.currentUser?.id);
    const fullName = cleanText(req.body?.full_name, 120);
    const email = normalizeEmail(req.body?.email);
    const employeeId = cleanText(req.body?.employee_id, 60);
    const hasMobileNumber = req.body?.mobile_number != null && String(req.body.mobile_number).trim() !== "";
    const mobileNumber = hasMobileNumber
        ? cleanText(req.body.mobile_number, 20)
        : null;
    const wardId = positiveInteger(req.body?.ward_id);
    const reason = req.body?.reason == null || String(req.body.reason).trim() === ""
        ? null
        : cleanText(req.body.reason, 500);

    if (!assistantUserId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!fullName) {
        return res.status(400).json({ success: false, message: "Enter a valid Inspector full name (maximum 120 characters)." });
    }
    if (!validEmail(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid official email address." });
    }
    if (!employeeId) {
        return res.status(400).json({ success: false, message: "Enter a valid employee ID (maximum 60 characters)." });
    }
    if (hasMobileNumber && (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber))) {
        return res.status(400).json({ success: false, message: "Mobile number must contain exactly 10 digits." });
    }
    if (!wardId) {
        return res.status(400).json({ success: false, message: "Select an active Ward for this Inspector." });
    }
    if (req.body?.reason != null && String(req.body.reason).trim() !== "" && !reason) {
        return res.status(400).json({ success: false, message: "Assignment reason must be 500 characters or fewer." });
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        // Derive the AC's identity and Division from the authenticated account,
        // never from browser-supplied scope identifiers.
        const [assistantRows] = await connection.execute(
            `SELECT u.id AS user_id, u.status AS user_status,
                    p.full_name, p.employee_id, p.division_id,
                    d.division_code, d.division_name, d.status AS division_status
             FROM users u
             INNER JOIN user_profiles p ON p.user_id = u.id
             INNER JOIN divisions d ON d.id = p.division_id
             WHERE u.id = ? AND u.role = 'assistant_commissioner'
             LIMIT 1 FOR UPDATE`,
            [assistantUserId]
        );
        const assistant = assistantRows[0];
        if (!assistant || assistant.user_status !== "active") {
            throw createHttpError(401, "The Assistant Commissioner account is unavailable or inactive.");
        }
        if (assistant.division_status !== "active" || !positiveInteger(assistant.division_id)) {
            throw createHttpError(403, "An active Division must be assigned to the Assistant Commissioner before creating Inspector accounts.");
        }

        const divisionId = Number(assistant.division_id);
        const [wardRows] = await connection.execute(
            `SELECT w.id, w.zone_id, w.division_id, w.ward_number,
                    w.ward_code, w.ward_name, w.status AS ward_status,
                    z.status AS zone_status, d.status AS division_status
             FROM wards w
             INNER JOIN zones z ON z.id = w.zone_id
             INNER JOIN divisions d ON d.id = w.division_id
             WHERE w.id = ?
             LIMIT 1 FOR UPDATE`,
            [wardId]
        );
        const ward = wardRows[0];

        if (!ward || ward.ward_status !== "active") {
            throw createHttpError(404, "The selected Ward does not exist or is inactive.");
        }
        if (Number(ward.division_id) !== divisionId) {
            throw createHttpError(403, "You can create an Inspector account only for a Ward in your assigned Division.");
        }
        if (ward.zone_status !== "active" || ward.division_status !== "active") {
            throw createHttpError(409, "The selected Ward's Division and Zone must both be active.");
        }

        const planningBoundary = await getWardPlanningBoundary(
            Number(ward.id),
            ward.ward_code,
            connection
        );
        if (!planningBoundary) {
            throw createHttpError(409, `No usable boundary is configured for Ward ${Number(ward.ward_number)}. Configure the Ward boundary before provisioning the Inspector account.`);
        }

        const [emailRows] = await connection.execute(
            "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1 FOR UPDATE",
            [email]
        );
        if (emailRows.length) {
            throw createHttpError(409, "This email is already associated with a SWACHHITRA account. Use a unique email address for the Inspector.");
        }

        const [employeeRows] = await connection.execute(
            "SELECT user_id FROM user_profiles WHERE LOWER(employee_id) = LOWER(?) LIMIT 1 FOR UPDATE",
            [employeeId]
        );
        if (employeeRows.length) {
            throw createHttpError(409, "This employee ID is already assigned to another account.");
        }

        // Do not disclose or return this generated password. Only its bcrypt
        // hash is saved; the Inspector sets a private password via Forgot Password.
        const undisclosedPassword = crypto.randomBytes(32).toString("base64url");
        const passwordHash = await bcrypt.hash(undisclosedPassword, 12);

        const [userInsert] = await connection.execute(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES (?, ?, 'sanitary_inspector', 'active')`,
            [email, passwordHash]
        );
        const userId = Number(userInsert.insertId);

        await connection.execute(
            `INSERT INTO user_profiles
                (user_id, full_name, mobile_number, official_email, employee_id,
                 department, designation, division_id, zone_id, ward_id,
                 scope_assigned_by, scope_assigned_at)
             VALUES (?, ?, ?, ?, ?, 'Solid Waste Management', 'Sanitary Inspector',
                     ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                userId,
                fullName,
                mobileNumber,
                email,
                employeeId,
                divisionId,
                Number(ward.zone_id),
                Number(ward.id),
                assistantUserId
            ]
        );

        // The shared security table stores session versions for every account
        // type. Email verification remains Citizen-specific in authController.
        await connection.execute(
            `INSERT INTO citizen_account_security (user_id, email_verified_at, session_version)
             VALUES (?, NULL, 0)`,
            [userId]
        );

        await connection.execute(
            `INSERT INTO inspector_scope_history
                (inspector_user_id, previous_division_id, previous_ward_id,
                 new_division_id, new_ward_id, assigned_by, reason)
             VALUES (?, NULL, NULL, ?, ?, ?, ?)`,
            [userId, divisionId, Number(ward.id), assistantUserId, reason]
        );

        await connection.execute(
            `INSERT INTO notifications
                (recipient_user_id, title, message, notification_type, priority)
             VALUES (?, ?, ?, ?, ?)`,
            [
                userId,
                "Operational jurisdiction assigned",
                `You have been assigned to ${assistant.division_name} - ${ward.ward_name}. Use Forgot Password on the sign-in page to set your private password before signing in.`,
                "scope_assignment",
                "high"
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return res.status(201).json({
            success: true,
            accountCreated: true,
            inspector: {
                user_id: userId,
                email,
                full_name: fullName,
                employee_id: employeeId
            },
            scope: {
                division_id: divisionId,
                ward_id: Number(ward.id),
                ward_number: Number(ward.ward_number),
                ward_name: ward.ward_name
            },
            message: "Inspector login created and Ward assigned. The Inspector must use Forgot Password to set a private password before signing in."
        });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Inspector account rollback failed:", rollbackError?.code || "rollback_error");
            }
        }

        if (error?.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        if (error?.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "The email or employee ID is already in use. Refresh the Inspector register and verify the details." });
        }

        console.error("Inspector account provisioning failed:", error?.code || "database_error");
        return res.status(500).json({ success: false, message: "Unable to create the Inspector account. No changes were committed." });
    } finally {
        connection?.release();
    }
}

module.exports = { createInspectorAccount };

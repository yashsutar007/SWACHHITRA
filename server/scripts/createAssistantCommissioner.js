"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
// This loads the project-root .env, while preserving explicit PowerShell env values.
const db = require("../config/db");

function parseArgs(argv) {
    const values = {};
    for (const arg of argv) {
        if (!arg.startsWith("--") || !arg.includes("=")) {
            throw new Error("Arguments must use --name=value format.");
        }
        const index = arg.indexOf("=");
        values[arg.slice(2, index)] = arg.slice(index + 1).trim();
    }
    return values;
}

function requiredText(value, label, maxLength) {
    const text = String(value || "").trim();
    if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
        throw new Error(`${label} is required and must be no longer than ${maxLength} characters.`);
    }
    return text;
}

function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error(`${label} must be a positive integer.`);
    }
    return number;
}

async function main() {
    let connection;
    let transactionStarted = false;

    try {
        const args = parseArgs(process.argv.slice(2));
        const email = requiredText(args.email, "Email", 190).toLowerCase();
        const fullName = requiredText(args.name, "Full name", 120);
        const employeeId = requiredText(args["employee-id"], "Employee ID", 60);
        const divisionId = positiveInteger(args["division-id"], "Division ID");
        const assigningDcId = positiveInteger(
            args["assigned-by-user-id"],
            "Assigning Deputy Commissioner user ID"
        );

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Enter a valid official email address.");
        }
        if (Buffer.byteLength(fullName, "utf8") > 120) {
            throw new Error("Full name is too long.");
        }

        const bootstrapPassword = crypto.randomBytes(24).toString("base64url");
        const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const [dcRows] = await connection.execute(
            `SELECT id, role, status
             FROM users
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [assigningDcId]
        );
        const assigningDc = dcRows[0];
        if (!assigningDc || assigningDc.role !== "deputy_commissioner" || assigningDc.status !== "active") {
            throw new Error("The assigning user must be an active Deputy Commissioner account.");
        }

        const [divisionRows] = await connection.execute(
            `SELECT id, division_code, division_name, office_location, status
             FROM divisions
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [divisionId]
        );
        const division = divisionRows[0];
        if (!division || division.status !== "active") {
            throw new Error("The selected Division does not exist or is inactive.");
        }

        const [emailRows] = await connection.execute(
            `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE`,
            [email]
        );
        if (emailRows.length) {
            throw new Error("That email is already associated with a SWACHHITRA account.");
        }

        const [employeeRows] = await connection.execute(
            `SELECT user_id FROM user_profiles WHERE LOWER(employee_id) = LOWER(?) LIMIT 1 FOR UPDATE`,
            [employeeId]
        );
        if (employeeRows.length) {
            throw new Error("That employee ID is already assigned to another account.");
        }

        const [userInsert] = await connection.execute(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES (?, ?, 'assistant_commissioner', 'active')`,
            [email, passwordHash]
        );
        const userId = Number(userInsert.insertId);

        await connection.execute(
            `INSERT INTO user_profiles
                (user_id, full_name, official_email, employee_id, department,
                 designation, office_location, division_id, scope_assigned_by,
                 scope_assigned_at)
             VALUES (?, ?, ?, ?, 'Solid Waste Management', 'Assistant Commissioner', ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                userId,
                fullName,
                email,
                employeeId,
                division.office_location || null,
                divisionId,
                assigningDcId
            ]
        );

        await connection.execute(
            `INSERT INTO citizen_account_security
                (user_id, email_verified_at, session_version)
             VALUES (?, NULL, 0)`,
            [userId]
        );

        await connection.commit();
        transactionStarted = false;

        console.log("\nASSISTANT COMMISSIONER ACCOUNT CREATED.");
        console.log(`User ID: ${userId}`);
        console.log(`Division: ${division.division_name} (${division.division_code})`);
        console.log(`Bootstrap password (give only to the official through a secure channel): ${bootstrapPassword}`);
        console.log("The assigned Division and assigning Deputy Commissioner are saved in the user profile.");
        console.log("Do not post or share this terminal output. The official should replace the bootstrap password once email reset is available.");
    } catch (error) {
        if (connection && transactionStarted) {
            try { await connection.rollback(); } catch { /* keep the original error */ }
        }
        console.error(`Assistant Commissioner creation failed: ${error?.message || "unknown error"}`);
        process.exitCode = 1;
    } finally {
        if (connection) connection.release();
        try { await db.end(); } catch { /* pool may already be closed */ }
    }
}

main();

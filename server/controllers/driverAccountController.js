"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
    return typeof value === "string" &&
        value.length <= 190 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * POST /api/inspector/drivers/:id/account
 *
 * Creates a Driver login account (or links an existing active Driver login)
 * to one Driver Registry record. The email, employee ID and Ward come from
 * the Inspector-managed record, not from the request body. New accounts get
 * a random undisclosed password and must use the existing password-reset
 * workflow to choose their own password.
 */
async function createDriverLoginAccount(req, res) {
    const driverId = Number(req.params?.id);
    const inspectorUserId = Number(req.currentUser?.id);

    if (!Number.isSafeInteger(driverId) || driverId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid Driver Registry ID."
        });
    }

    if (!Number.isSafeInteger(inspectorUserId) || inspectorUserId <= 0) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        // A Driver can be provisioned only within the Inspector's own
        // saved Division/Ward scope. Unassigned common-pool records cannot
        // be converted into login accounts from this endpoint.
        const [driverRows] = await connection.execute(
            `
            SELECT
                d.id,
                d.user_id,
                d.employee_id,
                d.full_name,
                d.mobile_number,
                d.email,
                d.license_number,
                d.license_type,
                d.assigned_ward_id,
                d.status AS driver_status,
                w.zone_id,
                w.division_id,
                w.status AS ward_status,
                z.status AS zone_status
            FROM drivers d
            INNER JOIN wards w
                ON w.id = d.assigned_ward_id
            INNER JOIN zones z
                ON z.id = w.zone_id
            INNER JOIN user_profiles inspector_scope
                ON inspector_scope.user_id = ?
               AND inspector_scope.ward_id = w.id
               AND inspector_scope.division_id = w.division_id
            WHERE d.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [inspectorUserId, driverId]
        );

        const driver = driverRows[0];

        if (!driver) {
            throw createHttpError(
                404,
                "Driver not found in your assigned Division/Ward."
            );
        }

        if (driver.user_id !== null && driver.user_id !== undefined) {
            throw createHttpError(
                409,
                "This Driver already has a linked login account."
            );
        }

        if (driver.driver_status === "inactive") {
            throw createHttpError(
                409,
                "An inactive Driver cannot be given a login account. Reactivate the Driver first."
            );
        }

        if (
            driver.ward_status !== "active" ||
            driver.zone_status !== "active" ||
            !driver.assigned_ward_id ||
            !driver.zone_id
        ) {
            throw createHttpError(
                409,
                "The Driver must have an active Ward and Zone assignment before login access can be created."
            );
        }

        const email = normalizeEmail(driver.email);
        const employeeId = String(driver.employee_id || "").trim();
        const fullName = String(driver.full_name || "").trim();

        if (!isValidEmail(email)) {
            throw createHttpError(
                400,
                "Add a valid email address to this Driver in the Driver Registry before creating a login."
            );
        }

        if (!employeeId || employeeId.length > 60 || !fullName) {
            throw createHttpError(
                409,
                "The Driver Registry record needs a valid employee ID and full name before login access can be created."
            );
        }

        const [duplicateDriverEmails] = await connection.execute(
            `
            SELECT id
            FROM drivers
            WHERE LOWER(email) = ?
              AND id <> ?
            LIMIT 1
            FOR UPDATE
            `,
            [email, driverId]
        );

        if (duplicateDriverEmails.length) {
            throw createHttpError(
                409,
                "This email address is used by another Driver Registry record. Give each Driver a unique login email."
            );
        }

        const [userRows] = await connection.execute(
            `
            SELECT id, email, role, status
            FROM users
            WHERE LOWER(email) = ?
            LIMIT 1
            FOR UPDATE
            `,
            [email]
        );

        let userId;
        let accountCreated = false;

        if (userRows.length) {
            const existingUser = userRows[0];

            if (existingUser.role !== "driver") {
                throw createHttpError(
                    409,
                    "This email is already registered to a different role. Use a dedicated email for the Driver login."
                );
            }

            if (existingUser.status !== "active") {
                throw createHttpError(
                    409,
                    "The existing Driver login account is inactive. Reactivate it through authorized account administration first."
                );
            }

            userId = Number(existingUser.id);

            const [otherLinks] = await connection.execute(
                `
                SELECT id
                FROM drivers
                WHERE user_id = ?
                  AND id <> ?
                LIMIT 1
                FOR UPDATE
                `,
                [userId, driverId]
            );

            if (otherLinks.length) {
                throw createHttpError(
                    409,
                    "This login account is already linked to another Driver Registry record."
                );
            }
        } else {
            // The generated password is never returned or logged. The Driver
            // chooses a real password through the password-reset flow.
            const undisclosedPassword = crypto.randomBytes(32).toString("base64url");
            const passwordHash = await bcrypt.hash(undisclosedPassword, 12);

            const [insertUserResult] = await connection.execute(
                `
                INSERT INTO users (email, password_hash, role, status)
                VALUES (?, ?, 'driver', 'active')
                `,
                [email, passwordHash]
            );

            userId = Number(insertUserResult.insertId);
            accountCreated = true;
        }

        const [profileRows] = await connection.execute(
            `
            SELECT employee_id, zone_id, ward_id
            FROM user_profiles
            WHERE user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [userId]
        );

        const existingProfile = profileRows[0] || null;

        if (
            existingProfile?.employee_id &&
            String(existingProfile.employee_id).trim().toLowerCase() !== employeeId.toLowerCase()
        ) {
            throw createHttpError(
                409,
                "The login profile has a different employee ID. Resolve the account/registry mismatch before linking it."
            );
        }

        if (
            existingProfile?.ward_id !== null &&
            existingProfile?.ward_id !== undefined &&
            Number(existingProfile.ward_id) !== Number(driver.assigned_ward_id)
        ) {
            throw createHttpError(
                409,
                "The login profile has a different Ward assignment. Resolve the scope mismatch before linking it."
            );
        }

        if (
            existingProfile?.zone_id !== null &&
            existingProfile?.zone_id !== undefined &&
            Number(existingProfile.zone_id) !== Number(driver.zone_id)
        ) {
            throw createHttpError(
                409,
                "The login profile has a different Zone assignment. Resolve the scope mismatch before linking it."
            );
        }

        const [duplicateProfileEmployee] = await connection.execute(
            `
            SELECT user_id
            FROM user_profiles
            WHERE employee_id = ?
              AND user_id <> ?
            LIMIT 1
            FOR UPDATE
            `,
            [employeeId, userId]
        );

        if (duplicateProfileEmployee.length) {
            throw createHttpError(
                409,
                "This employee ID is already used by another account profile. Resolve the duplicate before linking."
            );
        }

        const profileValues = [
            fullName,
            driver.mobile_number || null,
            email,
            employeeId,
            Number(driver.division_id) || null,
            Number(driver.zone_id),
            Number(driver.assigned_ward_id),
            driver.license_number || null,
            driver.license_type || null
        ];

        if (existingProfile) {
            await connection.execute(
                `
                UPDATE user_profiles
                SET full_name = ?,
                    mobile_number = ?,
                    official_email = ?,
                    employee_id = ?,
                    department = COALESCE(department, 'Solid Waste Management'),
                    designation = COALESCE(designation, 'Driver'),
                    division_id = ?,
                    zone_id = ?,
                    ward_id = ?,
                    license_number = ?,
                    license_type = ?
                WHERE user_id = ?
                `,
                [...profileValues, userId]
            );
        } else {
            await connection.execute(
                `
                INSERT INTO user_profiles
                (
                    user_id,
                    full_name,
                    mobile_number,
                    official_email,
                    employee_id,
                    department,
                    designation,
                    division_id,
                    zone_id,
                    ward_id,
                    license_number,
                    license_type
                )
                VALUES (?, ?, ?, ?, ?, 'Solid Waste Management', 'Driver', ?, ?, ?, ?, ?)
                `,
                [userId, ...profileValues]
            );
        }

        const [linkResult] = await connection.execute(
            `
            UPDATE drivers
            SET user_id = ?
            WHERE id = ?
              AND user_id IS NULL
            `,
            [userId, driverId]
        );

        if (linkResult.affectedRows !== 1) {
            throw createHttpError(
                409,
                "The Driver Registry record was linked by another request. Refresh the Driver Registry and try again."
            );
        }

        await connection.commit();
        transactionStarted = false;

        return res.status(accountCreated ? 201 : 200).json({
            success: true,
            accountCreated,
            driverId,
            userId,
            message: accountCreated
                ? "Driver login created and linked. The Driver must use Forgot Password to set a password before signing in."
                : "Existing Driver login linked. The account password has not been changed."
        });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Driver account transaction rollback failed:",
                    rollbackError?.code || "rollback_error"
                );
            }
        }

        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        if (error?.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "A matching login or employee profile already exists. Refresh the Driver Registry and verify the records."
            });
        }

        console.error(
            "Driver login provisioning failed:",
            error?.code || "database_error"
        );

        return res.status(500).json({
            success: false,
            message: "Unable to create or link the Driver login. No changes were committed."
        });
    } finally {
        connection?.release();
    }
}

module.exports = {
    createDriverLoginAccount
};

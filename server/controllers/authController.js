const bcrypt = require("bcryptjs");
const db = require("../config/db");


const VALID_ROLES = new Set([
    "deputy_commissioner",
    "assistant_commissioner",
    "sanitary_inspector",
    "driver",
    "citizen"
]);


function normalizeEmail(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}


function normalizeRole(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}


/*
 * POST /api/auth/login
 *
 * Validates:
 *   - email
 *   - password
 *   - selected role
 *
 * Then creates a fresh session.
 *
 * The controller checks whether a profile exists, but it does NOT
 * create or modify a profile automatically.
 */
async function login(req, res) {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const requestedRole = normalizeRole(req.body?.role);

    if (!email || !password || !requestedRole) {
        return res.status(400).json({
            success: false,
            message: "Email, password and role are required."
        });
    }

    if (!VALID_ROLES.has(requestedRole)) {
        return res.status(400).json({
            success: false,
            message: "Invalid login role."
        });
    }

    try {
        const [rows] = await db.execute(
            `
            SELECT
                id,
                email,
                password_hash,
                role,
                status
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [email]
        );

        const user = rows[0];

        if (!user || user.status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.role !== requestedRole) {
            return res.status(401).json({
                success: false,
                message: "Invalid email, password or role."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email, password or role."
            });
        }


        /*
         * Check profile existence.
         *
         * It is intentionally allowed to be NULL because a new user
         * should be able to log in and complete the profile manually.
         */
        const [profileRows] = await db.execute(
            `
            SELECT
                user_id,
                full_name,
                mobile_number,
                zone_id,
                ward_id
            FROM user_profiles
            WHERE user_id = ?
            LIMIT 1
            `,
            [user.id]
        );

        const profile = profileRows[0] || null;


        /*
         * Regenerate the session after successful authentication.
         * This prevents session fixation.
         */
        await new Promise((resolve, reject) => {
            req.session.regenerate(error => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });


        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;


        return res.json({
            success: true,
            message: "Login successful.",

            user: {
                id: user.id,
                email: user.email,
                role: user.role
            },

            profileComplete: Boolean(profile),

            profile: profile
                ? {
                    user_id: profile.user_id,
                    full_name: profile.full_name,
                    mobile_number: profile.mobile_number,
                    zone_id: profile.zone_id,
                    ward_id: profile.ward_id
                }
                : null
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to process login."
        });
    }
}


/*
 * GET /api/auth/me
 *
 * Returns the current authenticated user.
 * Also tells the frontend whether a profile exists.
 */
async function me(req, res) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated."
        });
    }

    try {
        const [rows] = await db.execute(
            `
            SELECT
                u.id,
                u.email,
                u.role,
                u.status,

                up.user_id AS profile_user_id,
                up.full_name,
                up.mobile_number,
                up.zone_id,
                up.ward_id

            FROM users u

            LEFT JOIN user_profiles up
                ON up.user_id = u.id

            WHERE u.id = ?

            LIMIT 1
            `,
            [req.session.userId]
        );

        const user = rows[0];

        if (!user || user.status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Session is no longer valid."
            });
        }


        /*
         * Make sure the session still represents the same
         * database identity.
         */
        if (
            normalizeEmail(req.session.email) &&
            normalizeEmail(req.session.email) !==
                normalizeEmail(user.email)
        ) {
            return res.status(401).json({
                success: false,
                message: "Session is no longer valid."
            });
        }


        if (
            normalizeRole(req.session.role) &&
            normalizeRole(req.session.role) !==
                normalizeRole(user.role)
        ) {
            return res.status(401).json({
                success: false,
                message: "Session is no longer valid."
            });
        }


        const profileExists =
            user.profile_user_id !== null;


        return res.json({
            success: true,

            user: {
                id: user.id,
                email: user.email,
                role: user.role
            },

            profileComplete: profileExists,

            profile: profileExists
                ? {
                    user_id: user.profile_user_id,
                    full_name: user.full_name,
                    mobile_number: user.mobile_number,
                    zone_id: user.zone_id,
                    ward_id: user.ward_id
                }
                : null
        });

    } catch (error) {
        console.error(
            "Session lookup error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify the current session."
        });
    }
}


/*
 * POST /api/auth/logout
 */
function logout(req, res) {
    if (!req.session) {
        res.clearCookie("swachhitra.sid");

        return res.json({
            success: true,
            message: "Logged out successfully."
        });
    }


    req.session.destroy(error => {

        if (error) {
            console.error(
                "Logout error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to log out."
            });
        }


        res.clearCookie(
            "swachhitra.sid",
            {
                httpOnly: true,
                sameSite: "lax",
                secure:
                    process.env.NODE_ENV === "production"
            }
        );


        return res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
}


module.exports = {
    login,
    me,
    logout
};
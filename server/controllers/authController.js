const bcrypt = require("bcryptjs");
const db = require("../config/db");
const {
    isProfileCompleteForRole
} = require("./profileController");


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


function toNullableId(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isInteger(number) && number > 0
        ? number
        : null;
}


/*
 * Build one consistent profile/scope response for login and /me.
 *
 * The authenticated session stores only user identity. Current role and
 * current operational scope are always re-read from MySQL so changes made by
 * an administrator/supervisor take effect without trusting stale session data.
 */
function buildProfileResponse(profile) {
    if (!profile) {
        return null;
    }

    return {
        user_id: Number(profile.user_id),
        full_name: profile.full_name,
        mobile_number: profile.mobile_number,
        official_email: profile.official_email,
        employee_id: profile.employee_id,
        department: profile.department,
        designation: profile.designation,
        office_location: profile.office_location,
        working_shift: profile.working_shift,
        official_contact_number: profile.official_contact_number,
        address: profile.address,
        city: profile.city,
        preferred_language: profile.preferred_language,
        notification_preference: profile.notification_preference,

        division_id: toNullableId(profile.division_id),
        zone_id: toNullableId(profile.zone_id),
        ward_id: toNullableId(profile.ward_id),

        division: profile.division_id === null
            ? null
            : {
                id: Number(profile.division_id),
                code: profile.division_code,
                name: profile.division_name,
                office_location: profile.division_office_location
            },

        zone: profile.zone_id === null
            ? null
            : {
                id: Number(profile.zone_id),
                code: profile.zone_code,
                name: profile.zone_name
            },

        ward: profile.ward_id === null
            ? null
            : {
                id: Number(profile.ward_id),
                number: profile.ward_number === null
                    ? null
                    : Number(profile.ward_number),
                code: profile.ward_code,
                name: profile.ward_name
            },

        scope_assigned_by: toNullableId(
            profile.scope_assigned_by
        ),
        scope_assigned_at: profile.scope_assigned_at,

        license_number: profile.license_number,
        license_type: profile.license_type,
        vehicle_number: profile.vehicle_number,
        jurisdiction: profile.jurisdiction
    };
}


function buildScopeResponse(role, profile) {
    if (role === "deputy_commissioner") {
        return {
            type: "city",
            division: null,
            zone: null,
            ward: null,
            assigned_by: null,
            assigned_at: null
        };
    }

    if (!profile) {
        return {
            type: role === "sanitary_inspector"
                ? "ward"
                : role === "assistant_commissioner"
                    ? "division"
                    : "legacy",
            division: null,
            zone: null,
            ward: null,
            assigned_by: null,
            assigned_at: null
        };
    }

    if (role === "assistant_commissioner") {
        return {
            type: "division",
            division: profile.division_id === null
                ? null
                : {
                    id: Number(profile.division_id),
                    code: profile.division_code,
                    name: profile.division_name,
                    office_location:
                        profile.division_office_location
                },
            zone: null,
            ward: null,
            assigned_by: toNullableId(
                profile.scope_assigned_by
            ),
            assigned_at: profile.scope_assigned_at
        };
    }

    if (role === "sanitary_inspector") {
        return {
            type: "ward",
            division: profile.division_id === null
                ? null
                : {
                    id: Number(profile.division_id),
                    code: profile.division_code,
                    name: profile.division_name,
                    office_location:
                        profile.division_office_location
                },
            zone: profile.zone_id === null
                ? null
                : {
                    id: Number(profile.zone_id),
                    code: profile.zone_code,
                    name: profile.zone_name
                },
            ward: profile.ward_id === null
                ? null
                : {
                    id: Number(profile.ward_id),
                    number: profile.ward_number === null
                        ? null
                        : Number(profile.ward_number),
                    code: profile.ward_code,
                    name: profile.ward_name
                },
            assigned_by: toNullableId(
                profile.scope_assigned_by
            ),
            assigned_at: profile.scope_assigned_at
        };
    }

    return {
        type: "legacy",
        division: profile.division_id === null
            ? null
            : {
                id: Number(profile.division_id),
                code: profile.division_code,
                name: profile.division_name,
                office_location:
                    profile.division_office_location
            },
        zone: profile.zone_id === null
            ? null
            : {
                id: Number(profile.zone_id),
                code: profile.zone_code,
                name: profile.zone_name
            },
        ward: profile.ward_id === null
            ? null
            : {
                id: Number(profile.ward_id),
                number: profile.ward_number === null
                    ? null
                    : Number(profile.ward_number),
                code: profile.ward_code,
                name: profile.ward_name
            },
        assigned_by: toNullableId(
            profile.scope_assigned_by
        ),
        assigned_at: profile.scope_assigned_at
    };
}


async function getUserWithProfile(userId) {
    const [rows] = await db.execute(
        `
        SELECT
            u.id,
            u.email,
            u.role,
            u.status,

            p.user_id AS profile_user_id,
            p.full_name,
            p.mobile_number,
            p.official_email,
            p.employee_id,
            p.department,
            p.designation,
            p.office_location,
            p.working_shift,
            p.official_contact_number,
            p.address,
            p.city,
            p.preferred_language,
            p.notification_preference,

            p.division_id,
            p.zone_id,
            p.ward_id,
            p.scope_assigned_by,
            p.scope_assigned_at,

            p.license_number,
            p.license_type,
            p.vehicle_number,
            p.jurisdiction,

            d.division_code,
            d.division_name,
            d.office_location AS division_office_location,

            z.zone_code,
            z.zone_name,

            w.ward_number,
            w.ward_code,
            w.ward_name

        FROM users u

        LEFT JOIN user_profiles p
            ON p.user_id = u.id

        LEFT JOIN divisions d
            ON d.id = p.division_id
           AND d.status = 'active'

        LEFT JOIN zones z
            ON z.id = p.zone_id
           AND z.status = 'active'

        LEFT JOIN wards w
            ON w.id = p.ward_id
           AND w.status = 'active'

        WHERE u.id = ?

        LIMIT 1
        `,
        [userId]
    );

    return rows[0] || null;
}


/*
 * POST /api/auth/login
 *
 * Validates:
 *   - email
 *   - password
 *   - requested role
 *
 * Then creates a fresh authenticated session.
 *
 * IMPORTANT:
 * The login response does not decide jurisdiction from the browser.
 * Current profile/scope is read from MySQL. For a Sanitary Inspector,
 * profileComplete is TRUE only after an authorized supervisor has assigned
 * both division_id and ward_id.
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
        const [userRows] = await db.execute(
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

        const user = userRows[0];

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

        const account = await getUserWithProfile(user.id);

        if (!account || account.status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Account is no longer active."
            });
        }

        const profile = account.profile_user_id === null
            ? null
            : account;

        const profileData = profile
            ? buildProfileResponse(profile)
            : null;

        const profileComplete = isProfileCompleteForRole(
            account.role,
            profileData
        );

        /*
         * Regenerate the session after successful authentication to prevent
         * session fixation.
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

        req.session.userId = Number(account.id);
        req.session.email = account.email;
        req.session.role = account.role;

        return res.json({
            success: true,
            message: "Login successful.",

            user: {
                id: Number(account.id),
                email: account.email,
                role: account.role
            },

            profileComplete,
            profile: profileData,
            scope: buildScopeResponse(
                account.role,
                profile
            )
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
 * Returns the current authenticated user and the CURRENT database-backed
 * profile/scope. This endpoint is the source of truth for page initialization.
 */
async function me(req, res) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated."
        });
    }

    const sessionUserId = Number(req.session.userId);

    if (!Number.isInteger(sessionUserId) || sessionUserId <= 0) {
        return res.status(401).json({
            success: false,
            message: "Session is no longer valid."
        });
    }

    try {
        const user = await getUserWithProfile(
            sessionUserId
        );

        if (!user || user.status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Session is no longer valid."
            });
        }

        const sessionEmail = normalizeEmail(
            req.session.email
        );

        const sessionRole = normalizeRole(
            req.session.role
        );

        const databaseEmail = normalizeEmail(
            user.email
        );

        const databaseRole = normalizeRole(
            user.role
        );

        /*
         * Session identity must continue to match the current database user.
         */
        if (
            (sessionEmail && sessionEmail !== databaseEmail) ||
            (sessionRole && sessionRole !== databaseRole)
        ) {
            return res.status(401).json({
                success: false,
                message: "Session is no longer valid."
            });
        }

        const profile = user.profile_user_id === null
            ? null
            : user;

        const profileData = profile
            ? buildProfileResponse(profile)
            : null;

        return res.json({
            success: true,

            user: {
                id: Number(user.id),
                email: user.email,
                role: user.role
            },

            profileComplete:
                isProfileCompleteForRole(
                    user.role,
                    profileData
                ),

            profile: profileData,

            scope: buildScopeResponse(
                user.role,
                profile
            )
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

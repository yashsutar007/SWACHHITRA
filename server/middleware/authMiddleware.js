const db = require("../config/db");


/**
 * Resolve the currently authenticated user from the session.
 *
 * The user record is read from MySQL on every protected request so that
 * changes to the user's role/status are respected immediately.
 *
 * Profile scope is also loaded when available. A missing profile does NOT
 * invalidate authentication because a new Sanitary Inspector must be able
 * to log in and complete their profile manually.
 */
async function resolveSessionUser(req) {
    if (!req.session || !req.session.userId) {
        return null;
    }

    const sessionUserId = Number(req.session.userId);

    if (!Number.isInteger(sessionUserId) || sessionUserId <= 0) {
        return null;
    }

    const [rows] = await db.execute(
        `
        SELECT
            u.id,
            u.email,
            u.role,
            u.status,
            up.zone_id,
            up.ward_id
        FROM users u
        LEFT JOIN user_profiles up
            ON up.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
        `,
        [sessionUserId]
    );

    const user = rows[0];

    if (!user || user.status !== "active") {
        return null;
    }

    const sessionEmail = String(req.session.email || "")
        .trim()
        .toLowerCase();

    const sessionRole = String(req.session.role || "")
        .trim();

    const databaseEmail = String(user.email || "")
        .trim()
        .toLowerCase();

    const databaseRole = String(user.role || "")
        .trim();

    // Session identity must agree with the current database record.
    if (
        (sessionEmail && sessionEmail !== databaseEmail) ||
        (sessionRole && sessionRole !== databaseRole)
    ) {
        return null;
    }

    return {
        id: sessionUserId,
        email: sessionEmail || databaseEmail,
        role: sessionRole || databaseRole,
        zone_id: user.zone_id ?? null,
        ward_id: user.ward_id ?? null
    };
}


/**
 * Require a valid, active login session.
 */
async function requireAuth(req, res, next) {
    try {
        const currentUser = await resolveSessionUser(req);

        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        req.currentUser = currentUser;
        return next();
    } catch (error) {
        console.error(
            "Authentication middleware error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify authentication."
        });
    }
}


/**
 * Require one of the supplied roles for an API route.
 *
 * Example:
 * requireRole("sanitary_inspector")
 * requireRole("sanitary_inspector", "assistant_commissioner")
 */
function requireRole(...allowedRoles) {
    const roles = [
        ...new Set(
            allowedRoles
                .map(role => String(role || "").trim())
                .filter(Boolean)
        )
    ];

    if (!roles.length) {
        throw new Error(
            "requireRole() needs at least one allowed role."
        );
    }

    return async (req, res, next) => {
        try {
            const currentUser = await resolveSessionUser(req);

            if (!currentUser) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            if (!roles.includes(currentUser.role)) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied."
                });
            }

            req.currentUser = currentUser;
            return next();
        } catch (error) {
            console.error(
                "Role middleware error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify access."
            });
        }
    };
}


/**
 * Require one of the supplied roles for a browser page.
 *
 * API routes return JSON on authorization failure.
 * Page routes redirect unauthenticated users to /login.
 */
function requirePageRole(...allowedRoles) {
    const roles = [
        ...new Set(
            allowedRoles
                .map(role => String(role || "").trim())
                .filter(Boolean)
        )
    ];

    if (!roles.length) {
        throw new Error(
            "requirePageRole() needs at least one allowed role."
        );
    }

    return async (req, res, next) => {
        try {
            const currentUser = await resolveSessionUser(req);

            if (!currentUser) {
                return res.redirect("/login");
            }

            if (!roles.includes(currentUser.role)) {
                return res.status(403).send("Access denied.");
            }

            req.currentUser = currentUser;
            return next();
        } catch (error) {
            console.error(
                "Page authorization error:",
                error
            );

            return res.status(500).send(
                "Unable to verify access."
            );
        }
    };
}


module.exports = {
    requireAuth,
    requireRole,
    requirePageRole
};
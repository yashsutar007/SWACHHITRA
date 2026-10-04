const db = require("../config/db");

/*
 * =========================================================
 * SWACHHITRA
 * ASSISTANT COMMISSIONER CONTROLLER
 * =========================================================
 *
 * Scope model used by this controller:
 *
 * Assistant Commissioner
 *     -> exactly one division
 *     -> can supervise multiple wards in that division
 *     -> can assign/reassign Sanitary Inspectors to wards
 *
 * Sanitary Inspector
 *     -> exactly one division + one ward once assigned
 *     -> operational authority is enforced separately by the
 *        Inspector controller.
 *
 * IMPORTANT:
 * - This controller expects migration 001 to have been applied.
 * - It does NOT replace the existing zones/wards relationship.
 * - zone_id is mirrored from the selected ward during Inspector
 *   scope assignment so the current Inspector module remains
 *   compatible during the migration period.
 * - No geographic polygon is fabricated here.
 */

const ROLE = "assistant_commissioner";
const INSPECTOR_ROLE = "sanitary_inspector";


function positiveInteger(value) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
        ? number
        : null;
}


function clean(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}


function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}


function sendError(res, fallbackMessage, error) {
    console.error(fallbackMessage, error);

    return res.status(error?.statusCode || 500).json({
        success: false,
        message: error?.statusCode
            ? error.message
            : fallbackMessage
    });
}


/*
 * ---------------------------------------------------------
 * Assistant Commissioner scope
 * ---------------------------------------------------------
 *
 * Returns the authenticated Assistant Commissioner's division.
 * A missing division is a configuration error, not a reason to
 * silently grant city-wide access.
 */
async function getAssistantScope(
    req,
    connection = db
) {
    if (req.currentUser?.role !== ROLE) {
        throw createError(
            "Assistant Commissioner access is required.",
            403
        );
    }

    const userId = positiveInteger(req.currentUser?.id);

    if (!userId) {
        throw createError(
            "Authenticated user identity is invalid.",
            401
        );
    }

    const [rows] = await connection.execute(
        `
        SELECT
            u.id AS user_id,
            u.email,
            u.role,
            u.status,

            p.full_name,
            p.employee_id,
            p.division_id,

            d.division_code,
            d.division_name,
            d.office_location AS division_office_location,
            d.status AS division_status

        FROM users u

        LEFT JOIN user_profiles p
            ON p.user_id = u.id

        LEFT JOIN divisions d
            ON d.id = p.division_id
           AND d.status = 'active'

        WHERE u.id = ?
          AND u.role = ?
          AND u.status = 'active'

        LIMIT 1
        `,
        [userId, ROLE]
    );

    const row = rows[0];

    if (!row) {
        throw createError(
            "Assistant Commissioner account was not found or is inactive.",
            401
        );
    }

    const divisionId = positiveInteger(row.division_id);

    if (!divisionId) {
        throw createError(
            "An operational division is not assigned to this Assistant Commissioner.",
            403
        );
    }

    if (row.division_status !== "active") {
        throw createError(
            "The assigned division is inactive.",
            403
        );
    }

    return {
        userId: Number(row.user_id),
        email: row.email,
        fullName: row.full_name,
        employeeId: row.employee_id,

        divisionId,
        divisionCode: row.division_code,
        divisionName: row.division_name,
        officeLocation: row.division_office_location
    };
}


/*
 * ---------------------------------------------------------
 * GET /api/assistant/overview
 * ---------------------------------------------------------
 */
async function getOverview(req, res) {
    try {
        const scope = await getAssistantScope(req);

        const [
            [divisionRows],
            [wardRows],
            [inspectorRows],
            [routeRows],
            [vehicleRows],
            [complaintRows],
            [pendingChangeRows]
        ] = await Promise.all([
            db.execute(
                `
                SELECT
                    COUNT(*) AS total_division_records
                FROM divisions
                WHERE id = ?
                  AND status = 'active'
                `,
                [scope.divisionId]
            ),

            db.execute(
                `
                SELECT COUNT(*) AS total_wards
                FROM wards
                WHERE division_id = ?
                  AND status = 'active'
                `,
                [scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS total_inspectors,
                    SUM(
                        CASE
                            WHEN u.status = 'active'
                             AND p.ward_id IS NOT NULL
                            THEN 1
                            ELSE 0
                        END
                    ) AS assigned_inspectors,
                    SUM(
                        CASE
                            WHEN u.status = 'active'
                             AND p.ward_id IS NULL
                            THEN 1
                            ELSE 0
                        END
                    ) AS unassigned_inspectors

                FROM users u

                JOIN user_profiles p
                    ON p.user_id = u.id

                WHERE u.role = ?
                  AND u.status = 'active'
                  AND p.division_id = ?
                `,
                [INSPECTOR_ROLE, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS total_routes,
                    SUM(
                        CASE
                            WHEN r.status IN ('starting', 'active', 'delayed')
                            THEN 1
                            ELSE 0
                        END
                    ) AS active_routes,
                    SUM(
                        CASE
                            WHEN r.status = 'completed'
                            THEN 1
                            ELSE 0
                        END
                    ) AS completed_routes

                FROM routes r

                JOIN wards w
                    ON w.id = r.ward_id

                WHERE
                    r.division_id = ?
                    OR (
                        r.division_id IS NULL
                        AND w.division_id = ?
                    )
                `,
                [scope.divisionId, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(DISTINCT v.id) AS zone_vehicles

                FROM vehicles v

                JOIN route_assignments ra
                    ON ra.vehicle_id = v.id

                JOIN routes r
                    ON r.id = ra.route_id

                JOIN wards w
                    ON w.id = r.ward_id

                WHERE ra.status IN ('assigned', 'active', 'delayed')
                  AND (
                      r.division_id = ?
                      OR (
                          r.division_id IS NULL
                          AND w.division_id = ?
                      )
                  )
                `,
                [scope.divisionId, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS total_complaints,
                    SUM(
                        CASE
                            WHEN c.status IN ('open', 'in_progress')
                            THEN 1
                            ELSE 0
                        END
                    ) AS unresolved_complaints

                FROM complaints c

                JOIN wards w
                    ON w.id = c.ward_id

                WHERE w.division_id = ?
                `,
                [scope.divisionId]
            ),

            db.execute(
                `
                SELECT COUNT(*) AS pending_change_requests
                FROM route_change_requests rcr

                JOIN routes r
                    ON r.id = rcr.route_id

                JOIN wards w
                    ON w.id = r.ward_id

                WHERE rcr.status = 'pending'
                  AND (
                      r.division_id = ?
                      OR (
                          r.division_id IS NULL
                          AND w.division_id = ?
                      )
                  )
                `,
                [scope.divisionId, scope.divisionId]
            )
        ]);

        return res.json({
            success: true,

            scope: {
                type: "division",
                division_id: scope.divisionId,
                division_code: scope.divisionCode,
                division_name: scope.divisionName,
                office_location: scope.officeLocation
            },

            overview: {
                division_exists:
                    Number(divisionRows[0]?.total_division_records || 0) > 0,

                total_wards:
                    Number(wardRows[0]?.total_wards || 0),

                total_inspectors:
                    Number(inspectorRows[0]?.total_inspectors || 0),

                assigned_inspectors:
                    Number(inspectorRows[0]?.assigned_inspectors || 0),

                unassigned_inspectors:
                    Number(inspectorRows[0]?.unassigned_inspectors || 0),

                total_routes:
                    Number(routeRows[0]?.total_routes || 0),

                active_routes:
                    Number(routeRows[0]?.active_routes || 0),

                completed_routes:
                    Number(routeRows[0]?.completed_routes || 0),

                zone_vehicles:
                    Number(vehicleRows[0]?.zone_vehicles || 0),

                total_complaints:
                    Number(complaintRows[0]?.total_complaints || 0),

                unresolved_complaints:
                    Number(complaintRows[0]?.unresolved_complaints || 0),

                pending_change_requests:
                    Number(
                        pendingChangeRows[0]?.pending_change_requests || 0
                    )
            }
        });

    } catch (error) {
        return sendError(
            res,
            "Unable to load Assistant Commissioner overview.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * GET /api/assistant/wards
 * ---------------------------------------------------------
 *
 * Returns only active wards belonging to the Assistant
 * Commissioner's division.
 */
async function getWards(req, res) {
    try {
        const scope = await getAssistantScope(req);

        const [rows] = await db.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,
                w.status,
                CASE
                    WHEN wb.ward_id IS NULL THEN 0
                    ELSE 1
                END AS has_boundary

            FROM wards w

            LEFT JOIN ward_boundaries wb
                ON wb.ward_id = w.id
               AND wb.is_official = 1

            WHERE w.division_id = ?
              AND w.status = 'active'

            ORDER BY w.ward_number, w.ward_name
            `,
            [scope.divisionId]
        );

        return res.json({
            success: true,
            division: {
                id: scope.divisionId,
                code: scope.divisionCode,
                name: scope.divisionName
            },
            wards: rows.map(row => ({
                id: Number(row.id),
                zone_id: row.zone_id === null
                    ? null
                    : Number(row.zone_id),
                division_id: Number(row.division_id),
                number: Number(row.ward_number),
                code: row.ward_code,
                name: row.ward_name,
                has_official_boundary:
                    Boolean(Number(row.has_boundary))
            }))
        });

    } catch (error) {
        return sendError(
            res,
            "Unable to load wards for the assigned division.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * GET /api/assistant/inspectors
 * ---------------------------------------------------------
 *
 * Lists active Sanitary Inspector accounts that the Assistant
 * Commissioner can supervise.
 *
 * Rules:
 * - Inspectors already assigned to another division are not
 *   exposed for reassignment by this Assistant Commissioner.
 * - Unassigned inspectors are visible so they can be placed
 *   into a ward in this division.
 * - Inspectors already in this division are visible and can
 *   be reassigned within the same division.
 */
async function getInspectors(req, res) {
    try {
        const scope = await getAssistantScope(req);

        const [rows] = await db.execute(
            `
            SELECT
                u.id AS user_id,
                u.email,
                u.status AS user_status,

                p.full_name,
                p.employee_id,
                p.mobile_number,
                p.division_id,
                p.ward_id,

                d.division_code,
                d.division_name,

                w.ward_number,
                w.ward_code,
                w.ward_name,

                CASE
                    WHEN p.user_id IS NULL THEN 0
                    ELSE 1
                END AS has_profile,

                CASE
                    WHEN wb.ward_id IS NULL THEN 0
                    ELSE 1
                END AS ward_has_official_boundary

            FROM users u

            LEFT JOIN user_profiles p
                ON p.user_id = u.id

            LEFT JOIN divisions d
                ON d.id = p.division_id

            LEFT JOIN wards w
                ON w.id = p.ward_id

            LEFT JOIN ward_boundaries wb
                ON wb.ward_id = w.id
               AND wb.is_official = 1

            WHERE u.role = ?
              AND u.status = 'active'
              AND (
                    p.division_id IS NULL
                    OR p.division_id = ?
                  )

            ORDER BY
                CASE
                    WHEN p.ward_id IS NULL THEN 0
                    ELSE 1
                END,
                p.full_name,
                u.email
            `,
            [INSPECTOR_ROLE, scope.divisionId]
        );

        return res.json({
            success: true,

            division: {
                id: scope.divisionId,
                code: scope.divisionCode,
                name: scope.divisionName
            },

            inspectors: rows.map(row => ({
                user_id: Number(row.user_id),
                email: row.email,
                full_name: row.full_name,
                employee_id: row.employee_id,
                mobile_number: row.mobile_number,

                has_profile: Boolean(Number(row.has_profile)),

                scope: {
                    division_id: row.division_id === null
                        ? null
                        : Number(row.division_id),
                    division_code: row.division_code,
                    division_name: row.division_name,
                    ward_id: row.ward_id === null
                        ? null
                        : Number(row.ward_id),
                    ward_number: row.ward_number === null
                        ? null
                        : Number(row.ward_number),
                    ward_code: row.ward_code,
                    ward_name: row.ward_name,
                    ward_has_official_boundary:
                        Boolean(Number(row.ward_has_official_boundary))
                },

                assignment_state:
                    row.ward_id === null
                        ? "unassigned"
                        : "assigned"
            }))
        });

    } catch (error) {
        return sendError(
            res,
            "Unable to load Sanitary Inspectors.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * PUT /api/assistant/inspectors/:id/scope
 * ---------------------------------------------------------
 *
 * Body:
 * {
 *   ward_id: 123,
 *   reason: "Ward reassignment for operational coverage"
 * }
 *
 * The Assistant Commissioner's division is NEVER accepted from
 * the request body. It is derived from the authenticated session.
 * The ward determines its parent zone_id, which is mirrored to
 * user_profiles.zone_id for compatibility with the current
 * Inspector module.
 */
async function assignInspectorScope(req, res) {
    const inspectorUserId = positiveInteger(req.params?.id);
    const wardId = positiveInteger(req.body?.ward_id);
    const reason = clean(req.body?.reason);

    if (!inspectorUserId) {
        return res.status(400).json({
            success: false,
            message: "Invalid Inspector user ID."
        });
    }

    if (!wardId) {
        return res.status(400).json({
            success: false,
            message: "ward_id is required."
        });
    }

    if (reason && reason.length > 500) {
        return res.status(400).json({
            success: false,
            message: "reason cannot exceed 500 characters."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const scope = await getAssistantScope(
            req,
            connection
        );

        if (inspectorUserId === scope.userId) {
            throw createError(
                "An Assistant Commissioner cannot assign a scope to their own account through this endpoint.",
                403
            );
        }

        /*
         * Lock and validate the target Inspector.
         */
        const [inspectorRows] = await connection.execute(
            `
            SELECT
                u.id AS user_id,
                u.email,
                u.role,
                u.status,

                p.user_id AS profile_user_id,
                p.full_name,
                p.employee_id,
                p.division_id AS current_division_id,
                p.ward_id AS current_ward_id,
                p.zone_id AS current_zone_id,

                d.division_name AS current_division_name,
                w.ward_name AS current_ward_name

            FROM users u

            LEFT JOIN user_profiles p
                ON p.user_id = u.id

            LEFT JOIN divisions d
                ON d.id = p.division_id

            LEFT JOIN wards w
                ON w.id = p.ward_id

            WHERE u.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [inspectorUserId]
        );

        const inspector = inspectorRows[0];

        if (!inspector) {
            throw createError(
                "Sanitary Inspector account was not found.",
                404
            );
        }

        if (inspector.role !== INSPECTOR_ROLE) {
            throw createError(
                "The selected account is not a Sanitary Inspector.",
                400
            );
        }

        if (inspector.status !== "active") {
            throw createError(
                "The selected Sanitary Inspector account is inactive.",
                409
            );
        }

        if (!inspector.profile_user_id) {
            throw createError(
                "The Sanitary Inspector must complete their basic profile before a jurisdiction can be assigned.",
                409
            );
        }

        /*
         * A different division owns a currently assigned Inspector.
         * This Assistant Commissioner cannot transfer across division
         * boundaries. That transfer belongs to a higher supervisory role.
         */
        if (
            inspector.current_division_id !== null &&
            Number(inspector.current_division_id) !== scope.divisionId
        ) {
            throw createError(
                "This Inspector is already assigned to another division and cannot be transferred by this Assistant Commissioner.",
                403
            );
        }

        /*
         * Lock and validate the selected ward.
         * The division comes from the ward record, never from the client.
         */
        const [wardRows] = await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,

                d.division_code,
                d.division_name,
                d.status AS division_status,

                z.zone_code,
                z.zone_name,
                z.status AS zone_status

            FROM wards w

            JOIN divisions d
                ON d.id = w.division_id

            JOIN zones z
                ON z.id = w.zone_id

            WHERE w.id = ?
              AND w.status = 'active'
            LIMIT 1
            FOR UPDATE
            `,
            [wardId]
        );

        const ward = wardRows[0];

        if (!ward) {
            throw createError(
                "Selected ward was not found or is inactive.",
                404
            );
        }

        if (Number(ward.division_id) !== scope.divisionId) {
            throw createError(
                "Selected ward is outside the Assistant Commissioner's assigned division.",
                403
            );
        }

        if (ward.division_status !== "active") {
            throw createError(
                "The selected division is inactive.",
                409
            );
        }

        if (ward.zone_status !== "active") {
            throw createError(
                "The legacy zone associated with the selected ward is inactive.",
                409
            );
        }

        /*
         * Store the old scope in the audit record before updating.
         */
        const previousDivisionId = positiveInteger(
            inspector.current_division_id
        );

        const previousWardId = positiveInteger(
            inspector.current_ward_id
        );

        /*
         * Update the authoritative new scope.
         * zone_id is retained as a compatibility field for the existing
         * Inspector controller until its scope logic is migrated fully to
         * divisions + wards.
         */
        await connection.execute(
            `
            UPDATE user_profiles
            SET
                division_id = ?,
                ward_id = ?,
                zone_id = ?,
                scope_assigned_by = ?,
                scope_assigned_at = CURRENT_TIMESTAMP

            WHERE user_id = ?
            `,
            [
                scope.divisionId,
                ward.id,
                ward.zone_id,
                scope.userId,
                inspectorUserId
            ]
        );

        await connection.execute(
            `
            INSERT INTO inspector_scope_history (
                inspector_user_id,
                previous_division_id,
                previous_ward_id,
                new_division_id,
                new_ward_id,
                assigned_by,
                reason
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                inspectorUserId,
                previousDivisionId,
                previousWardId,
                scope.divisionId,
                ward.id,
                scope.userId,
                reason
            ]
        );

        /*
         * Notify the Inspector in the same transaction so a successful
         * scope assignment and the corresponding notification cannot
         * silently diverge.
         */
        await connection.execute(
            `
            INSERT INTO notifications (
                recipient_user_id,
                title,
                message,
                notification_type,
                priority
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                inspectorUserId,
                "Operational jurisdiction assigned",
                `You have been assigned to ${ward.division_name} - ${ward.ward_name}.`,
                "scope_assignment",
                "high"
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Sanitary Inspector jurisdiction assigned successfully.",

            inspector: {
                user_id: inspectorUserId,
                email: inspector.email,
                full_name: inspector.full_name,
                employee_id: inspector.employee_id
            },

            scope: {
                division: {
                    id: scope.divisionId,
                    code: scope.divisionCode,
                    name: scope.divisionName
                },
                ward: {
                    id: Number(ward.id),
                    number: Number(ward.ward_number),
                    code: ward.ward_code,
                    name: ward.ward_name
                },

                compatibility_zone: {
                    id: Number(ward.zone_id),
                    code: ward.zone_code,
                    name: ward.zone_name
                },

                assigned_by: {
                    user_id: scope.userId,
                    full_name: scope.fullName,
                    employee_id: scope.employeeId
                }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Assistant Commissioner transaction rollback failed:",
                    rollbackError
                );
            }
        }

        return sendError(
            res,
            "Unable to assign Sanitary Inspector jurisdiction.",
            error
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}


module.exports = {
    getOverview,
    getWards,
    getInspectors,
    assignInspectorScope
};

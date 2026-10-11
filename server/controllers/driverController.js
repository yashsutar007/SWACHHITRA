"use strict";

const db = require("../config/db");

function asNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function sendDatabaseError(res, fallbackMessage, error) {
    console.error(
        fallbackMessage,
        error?.code || "database_error"
    );

    return res.status(500).json({
        success: false,
        message: fallbackMessage
    });
}

async function getLinkedDriver(userId) {
    const [rows] = await db.execute(
        `
        SELECT
            d.id,
            d.user_id,
            d.employee_id,
            d.full_name,
            d.mobile_number,
            d.email AS driver_email,
            d.license_number,
            d.license_type,
            d.assigned_ward_id,
            d.status AS driver_status,
            u.email AS login_email,
            w.ward_number,
            w.ward_code,
            w.ward_name,
            w.status AS ward_status,
            z.id AS zone_id,
            z.zone_code,
            z.zone_name,
            z.status AS zone_status
        FROM drivers d
        INNER JOIN users u
            ON u.id = d.user_id
           AND u.id = ?
           AND u.role = 'driver'
           AND u.status = 'active'
        LEFT JOIN wards w
            ON w.id = d.assigned_ward_id
        LEFT JOIN zones z
            ON z.id = w.zone_id
        WHERE d.user_id = ?
        LIMIT 1
        `,
        [userId, userId]
    );

    return rows[0] || null;
}

function ensureDriverOperational(driver, res) {
    if (!driver) {
        res.status(409).json({
            success: false,
            code: "DRIVER_RECORD_NOT_LINKED",
            message: "Your login is not linked to a Driver Registry record. Contact your assigned Inspector."
        });
        return false;
    }

    if (driver.driver_status === "inactive") {
        res.status(403).json({
            success: false,
            code: "DRIVER_INACTIVE",
            message: "This Driver account is inactive. Contact your assigned Inspector."
        });
        return false;
    }

    if (
        !driver.assigned_ward_id ||
        !driver.ward_code ||
        driver.ward_status !== "active" ||
        !driver.zone_id ||
        driver.zone_status !== "active"
    ) {
        res.status(409).json({
            success: false,
            code: "DRIVER_SCOPE_INVALID",
            message: "Your assigned Ward or Zone is missing or inactive. Contact your assigned Inspector."
        });
        return false;
    }

    return true;
}

/**
 * GET /api/driver/me
 *
 * Driver identity is resolved only through the authenticated session's user
 * ID and drivers.user_id. The caller cannot submit a driver ID to read another
 * Driver Registry record.
 */
async function getMyDriver(req, res) {
    try {
        const userId = Number(req.currentUser?.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const driver = await getLinkedDriver(userId);

        if (!ensureDriverOperational(driver, res)) {
            return undefined;
        }

        return res.json({
            success: true,
            driver: {
                id: Number(driver.id),
                employeeId: driver.employee_id,
                fullName: driver.full_name,
                mobileNumber: driver.mobile_number,
                email: driver.login_email,
                licenseNumber: driver.license_number,
                licenseType: driver.license_type,
                status: driver.driver_status,
                ward: {
                    id: Number(driver.assigned_ward_id),
                    number: asNumber(driver.ward_number),
                    code: driver.ward_code,
                    name: driver.ward_name
                },
                zone: {
                    id: Number(driver.zone_id),
                    code: driver.zone_code,
                    name: driver.zone_name
                }
            }
        });
    } catch (error) {
        return sendDatabaseError(
            res,
            "Unable to load the Driver account.",
            error
        );
    }
}

/**
 * GET /api/driver/assignments
 *
 * Only current assignments belonging to the Driver record linked to the
 * authenticated user are returned. Stops are fetched only for those routes.
 */
async function getMyAssignments(req, res) {
    try {
        const userId = Number(req.currentUser?.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const driver = await getLinkedDriver(userId);

        if (!ensureDriverOperational(driver, res)) {
            return undefined;
        }

        const [assignmentRows] = await db.execute(
            `
            SELECT
                ra.id AS assignment_id,
                ra.assignment_code,
                ra.status AS assignment_status,
                ra.assigned_at,
                ra.started_at,
                ra.completed_at,
                r.id AS route_id,
                r.route_code,
                r.route_name,
                r.status AS route_status,
                r.approval_status,
                r.start_point,
                r.end_point,
                r.estimated_distance_km,
                r.estimated_duration_minutes,
                r.total_stops,
                r.completed_stops,
                r.delay_minutes,
                r.scheduled_start_time,
                r.scheduled_end_time,
                v.id AS vehicle_id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.status AS vehicle_status
            FROM route_assignments ra
            INNER JOIN routes r
                ON r.id = ra.route_id
            INNER JOIN vehicles v
                ON v.id = ra.vehicle_id
            WHERE ra.driver_id = ?
              AND ra.unassigned_at IS NULL
              AND ra.status IN ('assigned', 'active', 'delayed')
            ORDER BY ra.assigned_at DESC, ra.id DESC
            `,
            [driver.id]
        );

        if (!assignmentRows.length) {
            return res.json({
                success: true,
                assignments: []
            });
        }

        const routeIds = [
            ...new Set(
                assignmentRows.map(row => Number(row.route_id))
            )
        ];
        const placeholders = routeIds.map(() => "?").join(", ");

        const [stopRows] = await db.execute(
            `
            SELECT
                rs.id,
                rs.route_id,
                rs.stop_order,
                rs.stop_name,
                rs.address,
                rs.latitude,
                rs.longitude,
                rs.status,
                rs.collected_at
            FROM route_stops rs
            WHERE rs.route_id IN (${placeholders})
              AND EXISTS (
                  SELECT 1
                  FROM route_assignments owned_ra
                  WHERE owned_ra.route_id = rs.route_id
                    AND owned_ra.driver_id = ?
                    AND owned_ra.unassigned_at IS NULL
                    AND owned_ra.status IN ('assigned', 'active', 'delayed')
              )
            ORDER BY rs.route_id, rs.stop_order
            `,
            [...routeIds, driver.id]
        );

        const stopsByRoute = new Map();
        for (const stop of stopRows) {
            const routeId = Number(stop.route_id);
            if (!stopsByRoute.has(routeId)) {
                stopsByRoute.set(routeId, []);
            }

            stopsByRoute.get(routeId).push({
                id: Number(stop.id),
                order: Number(stop.stop_order),
                name: stop.stop_name,
                address: stop.address,
                latitude: asNumber(stop.latitude),
                longitude: asNumber(stop.longitude),
                status: stop.status,
                collectedAt: stop.collected_at
                    ? new Date(stop.collected_at).toISOString()
                    : null
            });
        }

        return res.json({
            success: true,
            assignments: assignmentRows.map(row => ({
                id: Number(row.assignment_id),
                code: row.assignment_code,
                status: row.assignment_status,
                assignedAt: row.assigned_at
                    ? new Date(row.assigned_at).toISOString()
                    : null,
                startedAt: row.started_at
                    ? new Date(row.started_at).toISOString()
                    : null,
                completedAt: row.completed_at
                    ? new Date(row.completed_at).toISOString()
                    : null,
                route: {
                    id: Number(row.route_id),
                    code: row.route_code,
                    name: row.route_name,
                    status: row.route_status,
                    approvalStatus: row.approval_status,
                    startPoint: row.start_point,
                    endPoint: row.end_point,
                    estimatedDistanceKm: asNumber(row.estimated_distance_km),
                    estimatedDurationMinutes: asNumber(row.estimated_duration_minutes),
                    totalStops: Number(row.total_stops || 0),
                    completedStops: Number(row.completed_stops || 0),
                    delayMinutes: Number(row.delay_minutes || 0),
                    scheduledStartTime: row.scheduled_start_time,
                    scheduledEndTime: row.scheduled_end_time,
                    stops: stopsByRoute.get(Number(row.route_id)) || []
                },
                vehicle: {
                    id: Number(row.vehicle_id),
                    number: row.vehicle_number,
                    registrationNumber: row.registration_number,
                    type: row.vehicle_type,
                    status: row.vehicle_status
                }
            }))
        });
    } catch (error) {
        return sendDatabaseError(
            res,
            "Unable to load Driver assignments.",
            error
        );
    }
}

module.exports = {
    getMyDriver,
    getMyAssignments
};

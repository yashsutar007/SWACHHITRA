"use strict";

const db = require("../config/db");

function asNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** Parse a required numeric field without coercing null, arrays or blanks to 0. */
function parseStrictNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : Number.NaN;
    }

    if (typeof value !== "string") {
        return Number.NaN;
    }

    const text = value.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        return Number.NaN;
    }

    const number = Number(text);
    return Number.isFinite(number) ? number : Number.NaN;
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



function validPositiveId(value) {
    let number;
    if (typeof value === "number") {
        number = value;
    } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        number = Number(value.trim());
    } else {
        return null;
    }
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validDelayMinutes(value) {
    const number = parseStrictNumber(value);
    return Number.isInteger(number) && number >= 1 && number <= 1440 ? number : null;
}

async function loadOwnedAssignment(connection, assignmentId, driverId) {
    const [rows] = await connection.execute(
        `SELECT ra.id, ra.route_id, ra.vehicle_id, ra.driver_id, ra.assigned_by,
                ra.status AS assignment_status, r.ward_id, r.status AS route_status,
                r.approval_status, v.status AS vehicle_status
         FROM route_assignments ra
         INNER JOIN routes r ON r.id = ra.route_id
         INNER JOIN vehicles v ON v.id = ra.vehicle_id
         WHERE ra.id = ? AND ra.driver_id = ? AND ra.unassigned_at IS NULL
         LIMIT 1 FOR UPDATE`,
        [assignmentId, driverId]
    );
    return rows[0] || null;
}

async function startMyAssignment(req, res) {
    const assignmentId = validPositiveId(req.params.assignmentId);
    if (!assignmentId) return res.status(400).json({ success: false, message: "Invalid assignment ID." });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const driver = await getLinkedDriver(Number(req.currentUser?.id));
        if (!driver || driver.driver_status === "inactive" || !driver.assigned_ward_id) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "An active linked Driver Registry record is required." });
        }
        const assignment = await loadOwnedAssignment(connection, assignmentId, Number(driver.id));
        if (!assignment) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Assignment not found for this Driver." });
        }
        if (!["assigned", "delayed", "active"].includes(assignment.assignment_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This assignment cannot be started in its current state." });
        }
        if (["cancelled", "completed"].includes(assignment.route_status) || assignment.approval_status === "rejected") {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This route is cancelled, completed, or rejected." });
        }
        if (["maintenance", "inactive"].includes(assignment.vehicle_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "The assigned vehicle is not operational." });
        }

        await connection.execute(
            `UPDATE route_assignments SET status = 'active', started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
            [assignmentId]
        );
        await connection.execute(
            `UPDATE routes SET status = 'active' WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
            [assignment.route_id]
        );
        await connection.execute(
            `UPDATE vehicles SET status = 'en_route' WHERE id = ? AND status NOT IN ('maintenance', 'inactive')`,
            [assignment.vehicle_id]
        );
        await connection.execute(
            `UPDATE drivers SET status = 'assigned' WHERE id = ? AND status <> 'inactive'`,
            [driver.id]
        );
        await connection.commit();
        return res.json({ success: true, message: "Route started.", assignmentId });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        return sendDatabaseError(res, "Unable to start this route.", error);
    } finally {
        connection.release();
    }
}

async function updateMyStop(req, res) {
    const stopId = validPositiveId(req.params.stopId);
    const status = String(req.body?.status || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim().slice(0, 1000);
    if (!stopId) return res.status(400).json({ success: false, message: "Invalid stop ID." });
    if (!["collected", "skipped"].includes(status)) {
        return res.status(400).json({ success: false, message: "Stop status must be collected or skipped." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const driver = await getLinkedDriver(Number(req.currentUser?.id));
        if (!driver || driver.driver_status === "inactive") {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "An active Driver account is required." });
        }
        const [rows] = await connection.execute(
            `SELECT rs.id, rs.route_id, rs.status AS stop_status, r.ward_id,
                    ra.id AS assignment_id, ra.vehicle_id, ra.status AS assignment_status
             FROM route_stops rs
             INNER JOIN routes r ON r.id = rs.route_id
             INNER JOIN route_assignments ra ON ra.route_id = r.id
             WHERE rs.id = ? AND ra.driver_id = ? AND ra.unassigned_at IS NULL
               AND ra.status IN ('active', 'delayed')
             ORDER BY ra.id DESC LIMIT 1 FOR UPDATE`,
            [stopId, driver.id]
        );
        const stop = rows[0];
        if (!stop) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Stop not found on an active assignment belonging to this Driver." });
        }
        if (!["pending", "in_progress"].includes(stop.stop_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This stop has already been processed or cannot be updated." });
        }

        const timestamp = status === "collected" ? new Date() : null;
        await connection.execute(
            `UPDATE route_stops SET status = ?, collected_at = ? WHERE id = ?`,
            [status, timestamp, stopId]
        );

        const [existing] = await connection.execute(
            `SELECT id FROM collections WHERE route_stop_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [stopId]
        );
        if (existing.length) {
            await connection.execute(
                `UPDATE collections SET status = ?, notes = ?, collected_at = ? WHERE id = ?`,
                [status, notes || null, timestamp, existing[0].id]
            );
        } else {
            await connection.execute(
                `INSERT INTO collections
                    (route_id, route_stop_id, ward_id, vehicle_id, driver_id, collection_date,
                     waste_tons, status, notes, collected_at)
                 VALUES (?, ?, ?, ?, ?, UTC_DATE(), 0.00, ?, ?, ?)`,
                [stop.route_id, stopId, stop.ward_id, stop.vehicle_id, driver.id, status, notes || null, timestamp]
            );
        }

        const [counts] = await connection.execute(
            `SELECT COUNT(*) AS total_stops,
                    SUM(status = 'collected') AS collected_stops,
                    SUM(status IN ('collected', 'skipped')) AS processed_stops
             FROM route_stops WHERE route_id = ?`,
            [stop.route_id]
        );
        await connection.execute(
            `UPDATE routes SET total_stops = ?, completed_stops = ? WHERE id = ?`,
            [Number(counts[0]?.total_stops || 0), Number(counts[0]?.collected_stops || 0), stop.route_id]
        );
        await connection.commit();
        return res.json({
            success: true,
            message: status === "collected" ? "Collection recorded." : "Stop marked as skipped.",
            stopId, status,
            processedStops: Number(counts[0]?.processed_stops || 0),
            totalStops: Number(counts[0]?.total_stops || 0)
        });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        return sendDatabaseError(res, "Unable to update this collection stop.", error);
    } finally {
        connection.release();
    }
}

async function reportMyAssignmentDelay(req, res) {
    const assignmentId = validPositiveId(req.params.assignmentId);
    const delayMinutes = validDelayMinutes(req.body?.delayMinutes);
    const reason = String(req.body?.reason || "").trim().slice(0, 1000);
    if (!assignmentId) return res.status(400).json({ success: false, message: "Invalid assignment ID." });
    if (!delayMinutes) return res.status(400).json({ success: false, message: "Delay must be between 1 and 1440 minutes." });
    if (!reason) return res.status(400).json({ success: false, message: "Enter a reason for the delay." });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const driver = await getLinkedDriver(Number(req.currentUser?.id));
        if (!driver || driver.driver_status === "inactive") {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "An active Driver account is required." });
        }
        const assignment = await loadOwnedAssignment(connection, assignmentId, Number(driver.id));
        if (!assignment || !["assigned", "active", "delayed"].includes(assignment.assignment_status)) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "An open assignment belonging to this Driver was not found." });
        }
        if (["completed", "cancelled"].includes(assignment.route_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "A completed or cancelled route cannot be delayed." });
        }
        await connection.execute(`UPDATE route_assignments SET status = 'delayed' WHERE id = ?`, [assignmentId]);
        await connection.execute(
            `UPDATE routes SET status = 'delayed', delay_minutes = GREATEST(delay_minutes, ?) WHERE id = ?`,
            [delayMinutes, assignment.route_id]
        );
        await connection.execute(
            `UPDATE vehicles SET status = 'delayed' WHERE id = ? AND status NOT IN ('maintenance', 'inactive')`,
            [assignment.vehicle_id]
        );
        await connection.execute(
            `INSERT INTO notifications
                (recipient_user_id, title, message, notification_type, priority, related_route_id)
             VALUES (?, ?, ?, 'driver_delay_report', 'high', ?)`,
            [assignment.assigned_by, "Driver reported a route delay",
             `Driver ${driver.full_name} reported a ${delayMinutes}-minute delay for assignment ${assignmentId}. Reason: ${reason}`,
             assignment.route_id]
        );
        await connection.commit();
        return res.json({ success: true, message: "Delay report sent to the assigning official.", delayMinutes });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        return sendDatabaseError(res, "Unable to report this delay.", error);
    } finally {
        connection.release();
    }
}

async function completeMyAssignment(req, res) {
    const assignmentId = validPositiveId(req.params.assignmentId);
    if (!assignmentId) return res.status(400).json({ success: false, message: "Invalid assignment ID." });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const driver = await getLinkedDriver(Number(req.currentUser?.id));
        if (!driver || driver.driver_status === "inactive") {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "An active Driver account is required." });
        }
        const assignment = await loadOwnedAssignment(connection, assignmentId, Number(driver.id));
        if (!assignment || !["assigned", "active", "delayed"].includes(assignment.assignment_status)) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "An open assignment belonging to this Driver was not found." });
        }
        if (["completed", "cancelled"].includes(assignment.route_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This route is already completed or cancelled." });
        }
        const [pendingRows] = await connection.execute(
            `SELECT COUNT(*) AS total_count,
                    SUM(status IN ('pending', 'in_progress')) AS pending_count
             FROM route_stops WHERE route_id = ?`,
            [assignment.route_id]
        );
        if (Number(pendingRows[0]?.total_count || 0) === 0 || Number(pendingRows[0]?.pending_count || 0) > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                code: "STOPS_REMAINING",
                message: "This route needs at least one stop, and every stop must be collected or skipped before completion."
            });
        }

        await connection.execute(
            `UPDATE route_assignments SET status = 'completed', completed_at = NOW() WHERE id = ?`,
            [assignmentId]
        );
        await connection.execute(`UPDATE routes SET status = 'completed' WHERE id = ?`, [assignment.route_id]);
        const [otherVehicleAssignments] = await connection.execute(
            `SELECT COUNT(*) AS open_count FROM route_assignments
             WHERE vehicle_id = ? AND unassigned_at IS NULL AND id <> ?
               AND status IN ('assigned', 'active', 'delayed')`,
            [assignment.vehicle_id, assignmentId]
        );
        if (Number(otherVehicleAssignments[0]?.open_count || 0) === 0) {
            await connection.execute(
                `UPDATE vehicles SET status = 'available' WHERE id = ? AND status NOT IN ('maintenance', 'inactive')`,
                [assignment.vehicle_id]
            );
        }
        const [otherOpen] = await connection.execute(
            `SELECT COUNT(*) AS open_count FROM route_assignments
             WHERE driver_id = ? AND unassigned_at IS NULL AND id <> ?
               AND status IN ('assigned', 'active', 'delayed')`,
            [driver.id, assignmentId]
        );
        if (Number(otherOpen[0]?.open_count || 0) === 0) {
            await connection.execute(`UPDATE drivers SET status = 'available' WHERE id = ? AND status <> 'inactive'`, [driver.id]);
        }
        await connection.commit();
        return res.json({ success: true, message: "Route completed.", assignmentId });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        return sendDatabaseError(res, "Unable to complete this route.", error);
    } finally {
        connection.release();
    }
}


/**
 * POST /api/driver/location
 * Store a GPS update only for the authenticated Driver's currently active
 * assignment. Vehicle identity is derived from the database, never from the client.
 */
async function updateMyLocation(req, res) {
    const latitude = parseStrictNumber(req.body?.latitude);
    const longitude = parseStrictNumber(req.body?.longitude);
    const accuracy = parseStrictNumber(req.body?.accuracy);
    const headingValue = req.body?.heading;
    const speedValue = req.body?.speed;
    const assignmentId = validPositiveId(req.body?.assignmentId);
    const heading = headingValue === null || headingValue === undefined || headingValue === ""
        ? null
        : parseStrictNumber(headingValue);
    const speed = speedValue === null || speedValue === undefined || speedValue === ""
        ? null
        : parseStrictNumber(speedValue);

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        !assignmentId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000 ||
        (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading > 360)) ||
        (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 100))) {
        return res.status(400).json({ success: false, code: "LOCATION_INVALID", message: "Location data is invalid or GPS accuracy is outside the accepted range." });
    }

    const userId = Number(req.currentUser?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const driver = await getLinkedDriver(userId);
        if (!driver || driver.driver_status === "inactive" || !driver.assigned_ward_id) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "An active linked Driver Registry record is required." });
        }

        const [owned] = await connection.execute(
            `SELECT ra.id, ra.vehicle_id, ra.status AS assignment_status,
                    r.status AS route_status, r.approval_status, v.status AS vehicle_status
             FROM route_assignments ra
             INNER JOIN routes r ON r.id = ra.route_id
             INNER JOIN vehicles v ON v.id = ra.vehicle_id
             WHERE ra.id = ? AND ra.driver_id = ? AND ra.unassigned_at IS NULL
             LIMIT 1 FOR UPDATE`,
            [assignmentId, driver.id]
        );
        const assignment = owned[0];
        if (!assignment) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Active assignment not found for this Driver." });
        }
        if (!(["active", "delayed"].includes(assignment.assignment_status)) ||
            ["cancelled", "completed"].includes(assignment.route_status) ||
            assignment.approval_status === "rejected" ||
            ["maintenance", "inactive"].includes(assignment.vehicle_status)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Location updates are accepted only for an active, valid route assignment." });
        }

        await connection.execute(
            `UPDATE vehicles
             SET current_latitude = ?,
                 current_longitude = ?,
                 current_location_accuracy_meters = ?,
                 current_location_heading_degrees = ?,
                 current_location_speed_mps = ?,
                 last_location_at = NOW()
             WHERE id = ?`,
            [latitude, longitude, accuracy, heading, speed, assignment.vehicle_id]
        );
        await connection.commit();
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            message: "GPS location received.",
            assignmentId,
            location: { latitude, longitude, accuracy, heading, speed, receivedAt: new Date().toISOString() }
        });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        return sendDatabaseError(res, "Unable to save the Driver location.", error);
    } finally {
        connection.release();
    }
}

module.exports = {
    getMyDriver,
    getMyAssignments,
    startMyAssignment,
    updateMyStop,
    reportMyAssignmentDelay,
    completeMyAssignment,
    updateMyLocation
};

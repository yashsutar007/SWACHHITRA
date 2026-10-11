"use strict";

const db = require("../config/db");
const crypto = require("crypto");
const { appendAuditRecord, readRecentAuditRecords } = require("../utils/deputyCommissionerAuditLog");


async function executeOverviewQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        // Log actionable schema/query detail locally without exposing it to clients.
        console.error(`[DC overview] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

function numeric(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function firstRow(rows) {
    return rows && rows[0] ? rows[0] : {};
}

function mapStatusRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        status: String(row.status || "unknown"),
        count: numeric(row.count)
    }));
}

/**
 * Read-only, city-wide snapshot for the Deputy Commissioner.
 * Access is also restricted by server/routes/deputyCommissionerRoutes.js.
 * This function deliberately performs SELECT queries only and introduces
 * no schema requirements beyond the operational tables already used by the
 * application. No client-supplied division/ward identifier is accepted.
 */
async function getCityOverview(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({
            success: false,
            message: "Deputy Commissioner access is required."
        });
    }

    try {
        const [
            divisionResult,
            wardResult,
            inspectorResult,
            driverResult,
            vehicleResult,
            routeResult,
            complaintResult,
            collectionTodayResult,
            routeStatusResult,
            complaintStatusResult,
            collectionTrendResult
        ] = await Promise.all([
            executeOverviewQuery("division summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active
                FROM divisions
            `),
            executeOverviewQuery("ward summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active
                FROM wards
            `),
            executeOverviewQuery("inspector summary", `
                SELECT COUNT(DISTINCT u.id) AS total,
                       COUNT(DISTINCT CASE
                           WHEN p.division_id IS NOT NULL AND p.ward_id IS NOT NULL
                           THEN u.id END) AS assigned
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.role = 'sanitary_inspector'
                  AND u.status = 'active'
            `),
            executeOverviewQuery("driver summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status IN ('available', 'assigned', 'on_break') THEN 1 ELSE 0 END), 0) AS active,
                       COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS available,
                       COALESCE(SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END), 0) AS assigned,
                       COALESCE(SUM(CASE WHEN status = 'on_break' THEN 1 ELSE 0 END), 0) AS onBreak
                FROM drivers
            `),
            executeOverviewQuery("vehicle summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status IN ('available', 'en_route', 'collecting', 'delayed') THEN 1 ELSE 0 END), 0) AS operational,
                       COALESCE(SUM(CASE WHEN status = 'en_route' THEN 1 ELSE 0 END), 0) AS enRoute,
                       COALESCE(SUM(CASE WHEN status = 'collecting' THEN 1 ELSE 0 END), 0) AS collecting,
                       COALESCE(SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END), 0) AS delayed_count,
                       COALESCE(SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance
                FROM vehicles
            `),
            executeOverviewQuery("route summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS scheduled,
                       COALESCE(SUM(CASE WHEN status IN ('starting', 'active') THEN 1 ELSE 0 END), 0) AS active,
                       COALESCE(SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END), 0) AS delayed_count,
                       COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                       COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
                FROM routes
            `),
            executeOverviewQuery("complaint summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) AS open,
                       COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) AS inProgress,
                       COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) AS resolved,
                       COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
                       COALESCE(SUM(CASE WHEN priority = 'critical' AND status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS criticalOpen
                FROM complaints
            `),
            executeOverviewQuery("today collections summary", `
                SELECT COUNT(*) AS records,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN 1 ELSE 0 END), 0) AS collected,
                       COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) AS inProgress,
                       COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN waste_tons ELSE 0 END), 0) AS wasteTons
                FROM collections
                WHERE collection_date = CURRENT_DATE()
            `),
            executeOverviewQuery("route status breakdown", `SELECT status, COUNT(*) AS count FROM routes GROUP BY status`),
            executeOverviewQuery("complaint status breakdown", `SELECT status, COUNT(*) AS count FROM complaints GROUP BY status`),
            executeOverviewQuery("seven-day collection trend", `
                SELECT DATE_FORMAT(collection_date, '%Y-%m-%d') AS day,
                       COUNT(*) AS records,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN waste_tons ELSE 0 END), 0) AS collectedTons
                FROM collections
                WHERE collection_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
                  AND collection_date <= CURRENT_DATE()
                GROUP BY collection_date
                ORDER BY collection_date ASC
            `)
        ]);

        const divisions = firstRow(divisionResult[0]);
        const wards = firstRow(wardResult[0]);
        const inspectors = firstRow(inspectorResult[0]);
        const drivers = firstRow(driverResult[0]);
        const vehicles = firstRow(vehicleResult[0]);
        const routes = firstRow(routeResult[0]);
        const complaints = firstRow(complaintResult[0]);
        const collectionsToday = firstRow(collectionTodayResult[0]);

        const data = {
            organization: "Kolhapur Municipal Corporation",
            generatedAt: new Date().toISOString(),
            divisions: { total: numeric(divisions.total), active: numeric(divisions.active) },
            wards: { total: numeric(wards.total), active: numeric(wards.active) },
            inspectors: { total: numeric(inspectors.total), assigned: numeric(inspectors.assigned) },
            drivers: {
                total: numeric(drivers.total), active: numeric(drivers.active),
                available: numeric(drivers.available), assigned: numeric(drivers.assigned), onBreak: numeric(drivers.onBreak)
            },
            vehicles: {
                total: numeric(vehicles.total), operational: numeric(vehicles.operational),
                enRoute: numeric(vehicles.enRoute), collecting: numeric(vehicles.collecting),
                delayed: numeric(vehicles.delayed_count), maintenance: numeric(vehicles.maintenance)
            },
            routes: {
                total: numeric(routes.total), scheduled: numeric(routes.scheduled), active: numeric(routes.active),
                delayed: numeric(routes.delayed_count), completed: numeric(routes.completed), cancelled: numeric(routes.cancelled)
            },
            complaints: {
                total: numeric(complaints.total), open: numeric(complaints.open), inProgress: numeric(complaints.inProgress),
                resolved: numeric(complaints.resolved), cancelled: numeric(complaints.cancelled), criticalOpen: numeric(complaints.criticalOpen)
            },
            collectionsToday: {
                records: numeric(collectionsToday.records), collected: numeric(collectionsToday.collected),
                inProgress: numeric(collectionsToday.inProgress), skipped: numeric(collectionsToday.skipped),
                wasteTons: numeric(collectionsToday.wasteTons)
            },
            routeStatuses: mapStatusRows(routeStatusResult[0]),
            complaintStatuses: mapStatusRows(complaintStatusResult[0]),
            collectionTrend: collectionTrendResult[0].map((row) => ({
                day: String(row.day), records: numeric(row.records), collectedTons: numeric(row.collectedTons)
            }))
        };

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({ success: true, data });
    } catch (error) {
        console.error("Deputy Commissioner city overview failed. See the [DC overview] Query failed entry above for the failing SQL operation.", error?.code || "database_error");
        return res.status(503).json({
            success: false,
            message: "City overview data is temporarily unavailable. Verify the current operational database schema and retry."
        });
    }
}

/**
 * Part 2: city-wide division comparisons for the Deputy Commissioner.
 * Counts are based on existing Division/Ward operational assignments. These
 * figures do not claim to represent official municipal boundaries.
 */
async function executeSupervisionQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        console.error(`[DC supervision] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

async function getDivisionSupervision(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    try {
        const [rows] = await executeSupervisionQuery("division comparison", `
            SELECT
                d.id,
                d.division_code AS divisionCode,
                d.division_name AS divisionName,
                d.office_location AS officeLocation,
                d.status,
                (SELECT COUNT(*) FROM wards w WHERE w.division_id = d.id) AS wardCount,
                (SELECT COUNT(*) FROM wards w WHERE w.division_id = d.id AND w.status = 'active') AS activeWards,
                (SELECT COUNT(DISTINCT u.id)
                   FROM users u
                   INNER JOIN user_profiles p ON p.user_id = u.id
                  WHERE u.role = 'sanitary_inspector'
                    AND u.status = 'active'
                    AND p.division_id = d.id
                    AND p.ward_id IS NOT NULL) AS assignedInspectors,
                (SELECT COUNT(*) FROM routes r WHERE r.division_id = d.id) AS totalRoutes,
                (SELECT COUNT(*) FROM routes r WHERE r.division_id = d.id AND r.status IN ('starting', 'active')) AS activeRoutes,
                (SELECT COUNT(*) FROM routes r WHERE r.division_id = d.id AND r.status = 'delayed') AS delayedRoutes,
                (SELECT COUNT(*)
                   FROM complaints c
                   INNER JOIN wards w ON w.id = c.ward_id
                  WHERE w.division_id = d.id) AS totalComplaints,
                (SELECT COUNT(*)
                   FROM complaints c
                   INNER JOIN wards w ON w.id = c.ward_id
                  WHERE w.division_id = d.id
                    AND c.status IN ('open', 'in_progress')) AS openComplaints,
                (SELECT COUNT(*)
                   FROM collections col
                   INNER JOIN wards w ON w.id = col.ward_id
                  WHERE w.division_id = d.id
                    AND col.collection_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
                    AND col.collection_date <= CURRENT_DATE()) AS collections7d,
                (SELECT COALESCE(SUM(CASE WHEN col.status = 'collected' THEN col.waste_tons ELSE 0 END), 0)
                   FROM collections col
                   INNER JOIN wards w ON w.id = col.ward_id
                  WHERE w.division_id = d.id
                    AND col.collection_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
                    AND col.collection_date <= CURRENT_DATE()) AS collectedTons7d
            FROM divisions d
            ORDER BY d.id ASC
        `);

        const divisions = (Array.isArray(rows) ? rows : []).map((row) => ({
            id: numeric(row.id),
            divisionCode: String(row.divisionCode || ""),
            divisionName: String(row.divisionName || "Unnamed Division"),
            officeLocation: row.officeLocation == null ? null : String(row.officeLocation),
            status: String(row.status || "unknown"),
            wardCount: numeric(row.wardCount),
            activeWards: numeric(row.activeWards),
            assignedInspectors: numeric(row.assignedInspectors),
            totalRoutes: numeric(row.totalRoutes),
            activeRoutes: numeric(row.activeRoutes),
            delayedRoutes: numeric(row.delayedRoutes),
            totalComplaints: numeric(row.totalComplaints),
            openComplaints: numeric(row.openComplaints),
            collections7d: numeric(row.collections7d),
            collectedTons7d: numeric(row.collectedTons7d)
        }));

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({ success: true, data: { generatedAt: new Date().toISOString(), divisions } });
    } catch (error) {
        console.error("Deputy Commissioner Division comparison failed. See the [DC supervision] Query failed entry above.", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Division supervision data is temporarily unavailable. Check the server log and retry." });
    }
}

async function getDivisionWards(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const divisionId = Number(req.params.divisionId);
    if (!Number.isSafeInteger(divisionId) || divisionId <= 0) {
        return res.status(400).json({ success: false, message: "A valid Division identifier is required." });
    }

    try {
        const [divisionRows] = await executeSupervisionQuery("selected Division lookup", `
            SELECT id, division_code AS divisionCode, division_name AS divisionName,
                   office_location AS officeLocation, status
            FROM divisions
            WHERE id = ?
            LIMIT 1
        `, [divisionId]);

        if (!divisionRows.length) {
            return res.status(404).json({ success: false, message: "The requested Division was not found." });
        }

        const [wardRows] = await executeSupervisionQuery("Ward detail breakdown", `
            SELECT
                w.id,
                w.ward_number AS wardNumber,
                w.ward_code AS wardCode,
                w.ward_name AS wardName,
                w.status,
                z.zone_name AS zoneName,
                (SELECT COUNT(DISTINCT u.id)
                   FROM users u
                   INNER JOIN user_profiles p ON p.user_id = u.id
                  WHERE u.role = 'sanitary_inspector'
                    AND u.status = 'active'
                    AND p.division_id = w.division_id
                    AND p.ward_id = w.id) AS assignedInspectorCount,
                (SELECT GROUP_CONCAT(DISTINCT p.full_name ORDER BY p.full_name SEPARATOR ', ')
                   FROM users u
                   INNER JOIN user_profiles p ON p.user_id = u.id
                  WHERE u.role = 'sanitary_inspector'
                    AND u.status = 'active'
                    AND p.division_id = w.division_id
                    AND p.ward_id = w.id) AS inspectorNames,
                (SELECT COUNT(*) FROM routes r WHERE r.ward_id = w.id) AS totalRoutes,
                (SELECT COUNT(*) FROM routes r WHERE r.ward_id = w.id AND r.status IN ('starting', 'active')) AS activeRoutes,
                (SELECT COUNT(*) FROM routes r WHERE r.ward_id = w.id AND r.status = 'delayed') AS delayedRoutes,
                (SELECT COUNT(*) FROM complaints c WHERE c.ward_id = w.id AND c.status IN ('open', 'in_progress')) AS openComplaints,
                (SELECT COUNT(*)
                   FROM collections col
                  WHERE col.ward_id = w.id
                    AND col.collection_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
                    AND col.collection_date <= CURRENT_DATE()) AS collections7d,
                (SELECT COALESCE(SUM(CASE WHEN col.status = 'collected' THEN col.waste_tons ELSE 0 END), 0)
                   FROM collections col
                  WHERE col.ward_id = w.id
                    AND col.collection_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
                    AND col.collection_date <= CURRENT_DATE()) AS collectedTons7d
            FROM wards w
            LEFT JOIN zones z ON z.id = w.zone_id
            WHERE w.division_id = ?
            ORDER BY CASE WHEN w.status = 'active' THEN 0 ELSE 1 END,
                     w.ward_number ASC, w.id ASC
        `, [divisionId]);

        const wards = (Array.isArray(wardRows) ? wardRows : []).map((row) => ({
            id: numeric(row.id),
            wardNumber: numeric(row.wardNumber),
            wardCode: String(row.wardCode || ""),
            wardName: String(row.wardName || `Ward ${row.wardNumber || row.id}`),
            status: String(row.status || "unknown"),
            zoneName: row.zoneName == null ? null : String(row.zoneName),
            assignedInspectorCount: numeric(row.assignedInspectorCount),
            inspectorNames: row.inspectorNames == null ? "" : String(row.inspectorNames),
            totalRoutes: numeric(row.totalRoutes),
            activeRoutes: numeric(row.activeRoutes),
            delayedRoutes: numeric(row.delayedRoutes),
            openComplaints: numeric(row.openComplaints),
            collections7d: numeric(row.collections7d),
            collectedTons7d: numeric(row.collectedTons7d)
        }));

        const summary = wards.reduce((acc, ward) => {
            acc.wardCount += 1;
            if (ward.status === "active") acc.activeWards += 1;
            acc.assignedInspectors += ward.assignedInspectorCount;
            acc.totalRoutes += ward.totalRoutes;
            acc.activeRoutes += ward.activeRoutes;
            acc.delayedRoutes += ward.delayedRoutes;
            acc.openComplaints += ward.openComplaints;
            acc.collections7d += ward.collections7d;
            acc.collectedTons7d += ward.collectedTons7d;
            return acc;
        }, { wardCount: 0, activeWards: 0, assignedInspectors: 0, totalRoutes: 0, activeRoutes: 0, delayedRoutes: 0, openComplaints: 0, collections7d: 0, collectedTons7d: 0 });

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                division: {
                    id: numeric(divisionRows[0].id),
                    divisionCode: String(divisionRows[0].divisionCode || ""),
                    divisionName: String(divisionRows[0].divisionName || "Unnamed Division"),
                    officeLocation: divisionRows[0].officeLocation == null ? null : String(divisionRows[0].officeLocation),
                    status: String(divisionRows[0].status || "unknown")
                },
                summary,
                wards
            }
        });
    } catch (error) {
        console.error("Deputy Commissioner Ward breakdown failed. See the [DC supervision] Query failed entry above.", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Ward supervision data is temporarily unavailable. Check the server log and retry." });
    }
}



/**
 * Part 3: city-wide complaint oversight. Returns only operational complaint
 * fields and omits citizen contact/account details. Filtered lists are capped
 * at 250 rows; summary counts cover the whole current complaints table.
 */
async function getComplaintOversight(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const allowedStatuses = new Set(["open", "in_progress", "resolved", "cancelled"]);
    const allowedPriorities = new Set(["low", "medium", "high", "critical"]);
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const priority = String(req.query?.priority || "all").trim().toLowerCase();
    const search = String(req.query?.q || "").trim().slice(0, 120);
    const rawDivisionId = String(req.query?.divisionId ?? "").trim();
    const rawWardId = String(req.query?.wardId ?? "").trim();
    const dateFrom = String(req.query?.dateFrom ?? "").trim();
    const dateTo = String(req.query?.dateTo ?? "").trim();

    const parseOptionalId = (raw) => {
        if (!raw) return null;
        if (!/^[1-9]\d*$/.test(raw)) return Number.NaN;
        const value = Number(raw);
        return Number.isSafeInteger(value) ? value : Number.NaN;
    };
    const isValidDateOnly = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };

    const divisionId = parseOptionalId(rawDivisionId);
    const wardId = parseOptionalId(rawWardId);

    if (status !== "all" && !allowedStatuses.has(status)) {
        return res.status(400).json({ success: false, message: "Invalid complaint status filter." });
    }
    if (priority !== "all" && !allowedPriorities.has(priority)) {
        return res.status(400).json({ success: false, message: "Invalid complaint priority filter." });
    }
    if (Number.isNaN(divisionId) || Number.isNaN(wardId)) {
        return res.status(400).json({ success: false, message: "Division and Ward filters must be positive integer identifiers." });
    }
    if ((dateFrom && !isValidDateOnly(dateFrom)) || (dateTo && !isValidDateOnly(dateTo))) {
        return res.status(400).json({ success: false, message: "Reported-date filters must use valid YYYY-MM-DD dates." });
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return res.status(400).json({ success: false, message: "The start date cannot be later than the end date." });
    }

    const filters = [];
    const values = [];
    if (status !== "all") { filters.push("c.status = ?"); values.push(status); }
    if (priority !== "all") { filters.push("c.priority = ?"); values.push(priority); }
    if (divisionId !== null) { filters.push("w.division_id = ?"); values.push(divisionId); }
    if (wardId !== null) { filters.push("c.ward_id = ?"); values.push(wardId); }
    if (dateFrom) { filters.push("c.reported_at >= ?"); values.push(`${dateFrom} 00:00:00`); }
    if (dateTo) { filters.push("c.reported_at < DATE_ADD(?, INTERVAL 1 DAY)"); values.push(dateTo); }
    if (search) {
        const like = `%${search}%`;
        filters.push("(c.complaint_code LIKE ? OR c.complaint_type LIKE ? OR c.description LIKE ? OR COALESCE(c.location_text, '') LIKE ? OR COALESCE(w.ward_code, '') LIKE ? OR COALESCE(w.ward_name, '') LIKE ? OR COALESCE(d.division_name, '') LIKE ?)");
        values.push(like, like, like, like, like, like, like);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [summaryResult, countResult, complaintResult] = await Promise.all([
            executeComplaintQuery("city-wide complaint summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN c.status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS active,
                       COALESCE(SUM(CASE WHEN c.priority = 'critical' AND c.status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS criticalActive,
                       COALESCE(SUM(CASE WHEN c.status IN ('open', 'in_progress') AND TIMESTAMPDIFF(HOUR, c.reported_at, NOW()) >= 48 THEN 1 ELSE 0 END), 0) AS overdue48h,
                       COALESCE(SUM(CASE WHEN c.status IN ('open', 'in_progress') AND (c.ward_id IS NULL OR w.id IS NULL OR w.division_id IS NULL) THEN 1 ELSE 0 END), 0) AS needsWardMapping
                FROM complaints c
                LEFT JOIN wards w ON w.id = c.ward_id
            `),
            executeComplaintQuery("filtered complaint count", `
                SELECT COUNT(*) AS total
                FROM complaints c
                LEFT JOIN wards w ON w.id = c.ward_id
                LEFT JOIN divisions d ON d.id = w.division_id
                ${whereSql}
            `, values),
            executeComplaintQuery("filtered complaint queue", `
                SELECT c.id,
                       c.complaint_code AS complaintCode,
                       c.complaint_type AS complaintType,
                       c.description,
                       c.location_text AS locationText,
                       c.priority,
                       c.status,
                       c.reported_at AS reportedAt,
                       TIMESTAMPDIFF(HOUR, c.reported_at, NOW()) AS ageHours,
                       c.ward_id AS wardId,
                       w.ward_code AS wardCode,
                       w.ward_name AS wardName,
                       w.division_id AS divisionId,
                       d.division_code AS divisionCode,
                       d.division_name AS divisionName,
                       v.vehicle_number AS assignedVehicleNumber,
                       dr.full_name AS assignedDriverName,
                       (SELECT GROUP_CONCAT(DISTINCT p.full_name ORDER BY p.full_name SEPARATOR ', ')
                          FROM users iu
                          INNER JOIN user_profiles p ON p.user_id = iu.id
                         WHERE iu.role = 'sanitary_inspector'
                           AND iu.status = 'active'
                           AND p.ward_id = w.id
                           AND p.division_id = w.division_id) AS activeInspectorNames,
                       CASE WHEN c.status IN ('open', 'in_progress') AND TIMESTAMPDIFF(HOUR, c.reported_at, NOW()) >= 48 THEN 1 ELSE 0 END AS isOverdue
                FROM complaints c
                LEFT JOIN wards w ON w.id = c.ward_id
                LEFT JOIN divisions d ON d.id = w.division_id
                LEFT JOIN vehicles v ON v.id = c.assigned_vehicle_id
                LEFT JOIN drivers dr ON dr.id = c.assigned_driver_id
                ${whereSql}
                ORDER BY CASE WHEN c.status IN ('open', 'in_progress') AND TIMESTAMPDIFF(HOUR, c.reported_at, NOW()) >= 48 THEN 0 ELSE 1 END,
                         CASE c.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                         c.reported_at ASC
                LIMIT 250
            `, values)
        ]);

        const summaryRow = summaryResult[0]?.[0] || {};
        const totalMatched = Number(countResult[0]?.[0]?.total || 0);
        const complaints = (complaintResult[0] || []).map((row) => ({
            id: numeric(row.id),
            complaintCode: String(row.complaintCode || ""),
            complaintType: String(row.complaintType || "Unknown complaint"),
            description: String(row.description || ""),
            locationText: row.locationText == null ? "" : String(row.locationText),
            priority: String(row.priority || "medium"),
            status: String(row.status || "open"),
            reportedAt: row.reportedAt ? new Date(row.reportedAt).toISOString() : null,
            ageHours: numeric(row.ageHours),
            wardId: row.wardId == null ? null : numeric(row.wardId),
            wardCode: row.wardCode == null ? null : String(row.wardCode),
            wardName: row.wardName == null ? null : String(row.wardName),
            divisionId: row.divisionId == null ? null : numeric(row.divisionId),
            divisionCode: row.divisionCode == null ? null : String(row.divisionCode),
            divisionName: row.divisionName == null ? null : String(row.divisionName),
            assignedVehicleNumber: row.assignedVehicleNumber == null ? null : String(row.assignedVehicleNumber),
            assignedDriverName: row.assignedDriverName == null ? null : String(row.assignedDriverName),
            activeInspectorNames: row.activeInspectorNames == null ? "" : String(row.activeInspectorNames),
            isOverdue: Number(row.isOverdue) === 1
        }));

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                summary: {
                    total: numeric(summaryRow.total),
                    active: numeric(summaryRow.active),
                    criticalActive: numeric(summaryRow.criticalActive),
                    overdue48h: numeric(summaryRow.overdue48h),
                    needsWardMapping: numeric(summaryRow.needsWardMapping)
                },
                totalMatched,
                truncated: totalMatched > complaints.length,
                complaints
            }
        });
    } catch (error) {
        console.error("Deputy Commissioner complaint oversight failed. See the [DC complaints] Query failed entry above.", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Complaint oversight data is temporarily unavailable. Check the server log and retry." });
    }
}

async function executeComplaintQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        console.error(`[DC complaints] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

/**
 * Part 3 escalation writes notification rows only; complaint status and schema
 * are unchanged. Recipients are derived from the stored Ward/Division mapping.
 */
async function escalateComplaint(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const complaintId = Number(req.params?.complaintId);
    const note = String(req.body?.note || "").trim();
    if (!Number.isSafeInteger(complaintId) || complaintId <= 0) {
        return res.status(400).json({ success: false, message: "A valid complaint identifier is required." });
    }
    if (note.length < 10 || note.length > 500) {
        return res.status(400).json({ success: false, message: "Enter an escalation note between 10 and 500 characters." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [complaintRows] = await connection.execute(`
            SELECT c.id, c.complaint_code AS complaintCode, c.complaint_type AS complaintType,
                   c.priority, c.status, c.ward_id AS wardId
            FROM complaints c
            WHERE c.id = ?
            LIMIT 1 FOR UPDATE
        `, [complaintId]);

        if (!complaintRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Complaint not found." });
        }
        const complaint = complaintRows[0];
        if (!["open", "in_progress"].includes(String(complaint.status))) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Only open or in-progress complaints can be escalated." });
        }
        if (complaint.wardId == null) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This complaint has no saved Ward mapping. Correct the assignment through the approved workflow before escalating." });
        }
        const [mappingRows] = await connection.execute(`
            SELECT w.ward_code AS wardCode, w.division_id AS divisionId, d.division_name AS divisionName
            FROM wards w
            LEFT JOIN divisions d ON d.id = w.division_id
            WHERE w.id = ?
            LIMIT 1
        `, [complaint.wardId]);
        if (!mappingRows.length || mappingRows[0].divisionId == null || mappingRows[0].wardCode == null) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This complaint has no complete Ward/Division mapping. Correct the assignment through the approved workflow before escalating." });
        }
        Object.assign(complaint, mappingRows[0]);

        const [recipientRows] = await connection.execute(`
            SELECT DISTINCT u.id AS userId, u.role
            FROM users u
            INNER JOIN user_profiles p ON p.user_id = u.id
            WHERE u.status = 'active'
              AND ((u.role = 'sanitary_inspector' AND p.ward_id = ? AND p.division_id = ?)
                OR (u.role = 'assistant_commissioner' AND p.division_id = ?))
            ORDER BY u.role ASC, u.id ASC
        `, [complaint.wardId, complaint.divisionId, complaint.divisionId]);

        const recipients = (recipientRows || []).map((row) => ({ userId: Number(row.userId), role: String(row.role) }));
        if (!recipients.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "No active Inspector or Assistant Commissioner is assigned to this complaint's saved Ward/Division." });
        }

        const ids = recipients.map((recipient) => recipient.userId);
        const placeholders = ids.map(() => "?").join(", ");
        const [existingUnread] = await connection.execute(`
            SELECT recipient_user_id
            FROM notifications
            WHERE related_complaint_id = ?
              AND notification_type = 'dc_escalation'
              AND is_read = 0
              AND recipient_user_id IN (${placeholders})
            LIMIT 1
        `, [complaintId, ...ids]);
        if (existingUnread.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "An unread escalation already exists for this complaint. Wait for the assigned team to acknowledge it before escalating again." });
        }

        const title = `DC escalation: ${String(complaint.complaintCode || `Complaint ${complaintId}`)}`.slice(0, 150);
        const priority = ["critical", "high"].includes(String(complaint.priority)) ? "high" : "medium";
        const divisionName = String(complaint.divisionName || `Division ${complaint.divisionId}`);
        const wardCode = String(complaint.wardCode);
        const message = `Deputy Commissioner escalation for ${String(complaint.complaintCode)} (${String(complaint.complaintType)}), ${wardCode}, ${divisionName}. Note: ${note}`;

        for (const recipient of recipients) {
            await connection.execute(`
                INSERT INTO notifications
                    (recipient_user_id, title, message, notification_type, priority, related_complaint_id)
                VALUES (?, ?, ?, 'dc_escalation', ?, ?)
            `, [recipient.userId, title, message, priority, complaintId]);
        }

        await connection.commit();
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.status(201).json({
            success: true,
            message: `Escalation sent to ${recipients.length} assigned account(s). Complaint status was not changed.`,
            data: { complaintId, complaintCode: String(complaint.complaintCode), recipientCount: recipients.length, recipientRoles: [...new Set(recipients.map((recipient) => recipient.role))] }
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) { /* Preserve original error. */ }
        }
        console.error("Deputy Commissioner escalation failed:", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "The escalation could not be saved. No complaint status was changed." });
    } finally {
        connection?.release();
    }
}


/**
 * Part 4: city-wide read-only Fleet and Operations overview.
 * Operational vehicle/driver scope is derived through current route assignments;
 * vehicles do not have a ward-assignment column. Stored GPS coordinates are not
 * returned or represented as live telemetry.
 */
async function executeFleetQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        console.error(`[DC fleet operations] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

async function getFleetOperations(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const allowedVehicleStatuses = new Set(["available", "en_route", "collecting", "delayed", "maintenance", "inactive"]);
    const allowedRouteStatuses = new Set(["scheduled", "starting", "active", "delayed", "completed", "cancelled"]);
    const vehicleStatus = String(req.query?.vehicleStatus || "all").trim().toLowerCase();
    const routeStatus = String(req.query?.routeStatus || "all").trim().toLowerCase();
    const search = String(req.query?.q || "").trim().slice(0, 100);

    if (vehicleStatus !== "all" && !allowedVehicleStatuses.has(vehicleStatus)) {
        return res.status(400).json({ success: false, message: "Invalid vehicle status filter." });
    }
    if (routeStatus !== "all" && !allowedRouteStatuses.has(routeStatus)) {
        return res.status(400).json({ success: false, message: "Invalid route status filter." });
    }

    const likeValue = `%${search}%`;
    const vehicleConditions = [];
    const vehicleParams = [];
    if (vehicleStatus !== "all") {
        vehicleConditions.push("v.status = ?");
        vehicleParams.push(vehicleStatus);
    }
    if (search) {
        vehicleConditions.push(`(
            v.vehicle_number LIKE ? OR COALESCE(v.registration_number, '') LIKE ?
            OR v.vehicle_type LIKE ? OR COALESCE(v.make, '') LIKE ?
            OR COALESCE(r.route_code, '') LIKE ? OR COALESCE(r.route_name, '') LIKE ?
            OR COALESCE(w.ward_code, '') LIKE ? OR COALESCE(w.ward_name, '') LIKE ?
            OR COALESCE(z.zone_code, '') LIKE ? OR COALESCE(z.zone_name, '') LIKE ?
            OR COALESCE(d.full_name, '') LIKE ?
        )`);
        vehicleParams.push(...Array(11).fill(likeValue));
    }
    const vehicleWhereSql = vehicleConditions.length ? `WHERE ${vehicleConditions.join(" AND ")}` : "";
    const vehicleFromSql = `
        FROM vehicles v
        LEFT JOIN route_assignments ra
          ON ra.id = (
              SELECT ra2.id
              FROM route_assignments ra2
              WHERE ra2.vehicle_id = v.id
                AND ra2.status IN ('assigned', 'active', 'delayed')
                AND ra2.unassigned_at IS NULL
              ORDER BY COALESCE(ra2.started_at, ra2.assigned_at) DESC, ra2.id DESC
              LIMIT 1
          )
        LEFT JOIN routes r ON r.id = ra.route_id
        LEFT JOIN wards w ON w.id = r.ward_id
        LEFT JOIN zones z ON z.id = r.zone_id
        LEFT JOIN drivers d ON d.id = ra.driver_id
    `;

    const routeConditions = [];
    const routeParams = [];
    if (routeStatus !== "all") {
        routeConditions.push("r.status = ?");
        routeParams.push(routeStatus);
    }
    if (search) {
        routeConditions.push(`(
            r.route_code LIKE ? OR r.route_name LIKE ?
            OR COALESCE(w.ward_code, '') LIKE ? OR COALESCE(w.ward_name, '') LIKE ?
            OR COALESCE(z.zone_code, '') LIKE ? OR COALESCE(z.zone_name, '') LIKE ?
            OR COALESCE(v.vehicle_number, '') LIKE ? OR COALESCE(d.full_name, '') LIKE ?
        )`);
        routeParams.push(...Array(8).fill(likeValue));
    }
    const routeWhereSql = routeConditions.length ? `WHERE ${routeConditions.join(" AND ")}` : "";
    const routeFromSql = `
        FROM routes r
        LEFT JOIN wards w ON w.id = r.ward_id
        LEFT JOIN zones z ON z.id = r.zone_id
        LEFT JOIN route_assignments ra
          ON ra.id = (
              SELECT ra2.id
              FROM route_assignments ra2
              WHERE ra2.route_id = r.id
                AND ra2.status IN ('assigned', 'active', 'delayed')
                AND ra2.unassigned_at IS NULL
              ORDER BY COALESCE(ra2.started_at, ra2.assigned_at) DESC, ra2.id DESC
              LIMIT 1
          )
        LEFT JOIN vehicles v ON v.id = ra.vehicle_id
        LEFT JOIN drivers d ON d.id = ra.driver_id
    `;

    try {
        const [
            vehicleSummaryResult,
            driverSummaryResult,
            routeSummaryResult,
            assignmentSummaryResult,
            vehicleCountResult,
            routeCountResult,
            vehicleRowsResult,
            routeRowsResult
        ] = await Promise.all([
            executeFleetQuery("vehicle status summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status IN ('available', 'en_route', 'collecting', 'delayed') THEN 1 ELSE 0 END), 0) AS operational,
                       COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS available,
                       COALESCE(SUM(CASE WHEN status = 'en_route' THEN 1 ELSE 0 END), 0) AS enRoute,
                       COALESCE(SUM(CASE WHEN status = 'collecting' THEN 1 ELSE 0 END), 0) AS collecting,
                       COALESCE(SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END), 0) AS delayed_count,
                       COALESCE(SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance,
                       COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactive
                FROM vehicles
            `),
            executeFleetQuery("driver status summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS available,
                       COALESCE(SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END), 0) AS assigned,
                       COALESCE(SUM(CASE WHEN status = 'on_break' THEN 1 ELSE 0 END), 0) AS onBreak,
                       COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactive
                FROM drivers
            `),
            executeFleetQuery("route status summary", `
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS scheduled,
                       COALESCE(SUM(CASE WHEN status = 'starting' THEN 1 ELSE 0 END), 0) AS starting_count,
                       COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                       COALESCE(SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END), 0) AS delayed_count,
                       COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                       COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
                FROM routes
            `),
            executeFleetQuery("current assignment summary", `
                SELECT COUNT(*) AS currentAssignments,
                       COUNT(DISTINCT vehicle_id) AS vehiclesWithCurrentAssignments,
                       COUNT(DISTINCT driver_id) AS driversWithCurrentAssignments
                FROM route_assignments
                WHERE status IN ('assigned', 'active', 'delayed')
                  AND unassigned_at IS NULL
            `),
            executeFleetQuery("filtered vehicle count", `SELECT COUNT(DISTINCT v.id) AS totalMatched ${vehicleFromSql} ${vehicleWhereSql}`, vehicleParams),
            executeFleetQuery("filtered route count", `SELECT COUNT(DISTINCT r.id) AS totalMatched ${routeFromSql} ${routeWhereSql}`, routeParams),
            executeFleetQuery("filtered vehicle list", `
                SELECT v.id, v.vehicle_number AS vehicleNumber,
                       v.registration_number AS registrationNumber,
                       v.vehicle_type AS vehicleType, v.make,
                       v.capacity_tons AS capacityTons,
                       v.current_load_tons AS currentLoadTons,
                       v.current_load_percent AS currentLoadPercent,
                       v.eta_minutes AS etaMinutes, v.status AS vehicleStatus,
                       ra.assignment_code AS assignmentCode, ra.status AS assignmentStatus,
                       r.id AS routeId, r.route_code AS routeCode, r.route_name AS routeName,
                       r.status AS routeStatus, r.delay_minutes AS delayMinutes,
                       w.ward_code AS wardCode, w.ward_name AS wardName,
                       z.zone_code AS zoneCode, z.zone_name AS zoneName,
                       d.employee_id AS driverEmployeeId, d.full_name AS driverName
                ${vehicleFromSql}
                ${vehicleWhereSql}
                ORDER BY CASE v.status
                    WHEN 'delayed' THEN 0 WHEN 'en_route' THEN 1 WHEN 'collecting' THEN 2
                    WHEN 'available' THEN 3 WHEN 'maintenance' THEN 4 ELSE 5 END,
                    v.vehicle_number ASC
                LIMIT 250
            `, vehicleParams),
            executeFleetQuery("filtered route list", `
                SELECT r.id, r.route_code AS routeCode, r.route_name AS routeName,
                       r.status AS routeStatus, r.estimated_distance_km AS estimatedDistanceKm,
                       r.estimated_duration_minutes AS estimatedDurationMinutes,
                       r.total_stops AS totalStops, r.completed_stops AS completedStops,
                       r.delay_minutes AS delayMinutes,
                       r.scheduled_start_time AS scheduledStartTime,
                       r.scheduled_end_time AS scheduledEndTime,
                       w.ward_code AS wardCode, w.ward_name AS wardName,
                       z.zone_code AS zoneCode, z.zone_name AS zoneName,
                       ra.assignment_code AS assignmentCode, ra.status AS assignmentStatus,
                       v.vehicle_number AS vehicleNumber,
                       d.employee_id AS driverEmployeeId, d.full_name AS driverName
                ${routeFromSql}
                ${routeWhereSql}
                ORDER BY CASE r.status
                    WHEN 'delayed' THEN 0 WHEN 'active' THEN 1 WHEN 'starting' THEN 2
                    WHEN 'scheduled' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END,
                    r.updated_at DESC, r.id DESC
                LIMIT 250
            `, routeParams)
        ]);

        const vehicleSummary = firstRow(vehicleSummaryResult[0]);
        const driverSummary = firstRow(driverSummaryResult[0]);
        const routeSummary = firstRow(routeSummaryResult[0]);
        const assignmentSummary = firstRow(assignmentSummaryResult[0]);
        const totalMatchedVehicles = numeric(firstRow(vehicleCountResult[0]).totalMatched);
        const totalMatchedRoutes = numeric(firstRow(routeCountResult[0]).totalMatched);

        const vehicles = (vehicleRowsResult[0] || []).map((row) => ({
            id: numeric(row.id),
            vehicleNumber: String(row.vehicleNumber || ""),
            registrationNumber: row.registrationNumber == null ? null : String(row.registrationNumber),
            vehicleType: String(row.vehicleType || "Unknown type"),
            make: row.make == null ? null : String(row.make),
            capacityTons: numeric(row.capacityTons),
            currentLoadTons: numeric(row.currentLoadTons),
            currentLoadPercent: numeric(row.currentLoadPercent),
            etaMinutes: row.etaMinutes == null ? null : numeric(row.etaMinutes),
            vehicleStatus: String(row.vehicleStatus || "unknown"),
            assignmentCode: row.assignmentCode == null ? null : String(row.assignmentCode),
            assignmentStatus: row.assignmentStatus == null ? null : String(row.assignmentStatus),
            routeId: row.routeId == null ? null : numeric(row.routeId),
            routeCode: row.routeCode == null ? null : String(row.routeCode),
            routeName: row.routeName == null ? null : String(row.routeName),
            routeStatus: row.routeStatus == null ? null : String(row.routeStatus),
            delayMinutes: row.delayMinutes == null ? null : numeric(row.delayMinutes),
            wardCode: row.wardCode == null ? null : String(row.wardCode),
            wardName: row.wardName == null ? null : String(row.wardName),
            zoneCode: row.zoneCode == null ? null : String(row.zoneCode),
            zoneName: row.zoneName == null ? null : String(row.zoneName),
            driverEmployeeId: row.driverEmployeeId == null ? null : String(row.driverEmployeeId),
            driverName: row.driverName == null ? null : String(row.driverName)
        }));

        const routes = (routeRowsResult[0] || []).map((row) => ({
            id: numeric(row.id),
            routeCode: String(row.routeCode || ""),
            routeName: String(row.routeName || "Unnamed route"),
            routeStatus: String(row.routeStatus || "unknown"),
            estimatedDistanceKm: row.estimatedDistanceKm == null ? null : numeric(row.estimatedDistanceKm),
            estimatedDurationMinutes: row.estimatedDurationMinutes == null ? null : numeric(row.estimatedDurationMinutes),
            totalStops: numeric(row.totalStops),
            completedStops: numeric(row.completedStops),
            delayMinutes: numeric(row.delayMinutes),
            scheduledStartTime: row.scheduledStartTime == null ? null : String(row.scheduledStartTime),
            scheduledEndTime: row.scheduledEndTime == null ? null : String(row.scheduledEndTime),
            wardCode: row.wardCode == null ? null : String(row.wardCode),
            wardName: row.wardName == null ? null : String(row.wardName),
            zoneCode: row.zoneCode == null ? null : String(row.zoneCode),
            zoneName: row.zoneName == null ? null : String(row.zoneName),
            assignmentCode: row.assignmentCode == null ? null : String(row.assignmentCode),
            assignmentStatus: row.assignmentStatus == null ? null : String(row.assignmentStatus),
            vehicleNumber: row.vehicleNumber == null ? null : String(row.vehicleNumber),
            driverEmployeeId: row.driverEmployeeId == null ? null : String(row.driverEmployeeId),
            driverName: row.driverName == null ? null : String(row.driverName)
        }));

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                summary: {
                    vehicles: {
                        total: numeric(vehicleSummary.total), operational: numeric(vehicleSummary.operational),
                        available: numeric(vehicleSummary.available), enRoute: numeric(vehicleSummary.enRoute),
                        collecting: numeric(vehicleSummary.collecting), delayed: numeric(vehicleSummary.delayed_count),
                        maintenance: numeric(vehicleSummary.maintenance), inactive: numeric(vehicleSummary.inactive)
                    },
                    drivers: {
                        total: numeric(driverSummary.total), available: numeric(driverSummary.available),
                        assigned: numeric(driverSummary.assigned), onBreak: numeric(driverSummary.onBreak),
                        inactive: numeric(driverSummary.inactive)
                    },
                    routes: {
                        total: numeric(routeSummary.total), scheduled: numeric(routeSummary.scheduled),
                        starting: numeric(routeSummary.starting_count), active: numeric(routeSummary.active),
                        delayed: numeric(routeSummary.delayed_count), completed: numeric(routeSummary.completed),
                        cancelled: numeric(routeSummary.cancelled)
                    },
                    assignments: {
                        current: numeric(assignmentSummary.currentAssignments),
                        vehicles: numeric(assignmentSummary.vehiclesWithCurrentAssignments),
                        drivers: numeric(assignmentSummary.driversWithCurrentAssignments)
                    }
                },
                vehicleTotalMatched: totalMatchedVehicles,
                routeTotalMatched: totalMatchedRoutes,
                vehiclesTruncated: totalMatchedVehicles > vehicles.length,
                routesTruncated: totalMatchedRoutes > routes.length,
                vehicles,
                routes
            }
        });
    } catch (error) {
        console.error("Deputy Commissioner fleet operations failed. See the [DC fleet operations] Query failed entry above.", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Fleet and operations data is temporarily unavailable. Check the server log and retry." });
    }
}


/**
 * Part 5: read-only reporting and analytics for the Deputy Commissioner.
 * All metrics use recorded database events, not live telemetry. Collections are
 * grouped by collection_date; complaints by reported_at; routes by scheduled
 * start time (or created_at when no schedule was saved). Division comparisons
 * use the saved Ward-to-Division relationship.
 */
async function executeReportQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        console.error(`[DC reports] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

function isValidReportDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftReportDate(value, offsetDays) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

async function getReportsAnalytics(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const rawDateFrom = String(req.query?.dateFrom ?? "").trim();
    const rawDateTo = String(req.query?.dateTo ?? "").trim();
    const today = new Date().toISOString().slice(0, 10);
    const dateTo = rawDateTo || today;
    if (!isValidReportDateOnly(dateTo)) {
        return res.status(400).json({ success: false, message: "Report dates must be valid dates in YYYY-MM-DD format." });
    }
    const dateFrom = rawDateFrom || shiftReportDate(dateTo, -29);
    if (!isValidReportDateOnly(dateFrom)) {
        return res.status(400).json({ success: false, message: "Report dates must be valid dates in YYYY-MM-DD format." });
    }
    if (dateFrom > dateTo) {
        return res.status(400).json({ success: false, message: "The start date cannot be later than the end date." });
    }
    const startMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
    const endMs = Date.parse(`${dateTo}T00:00:00.000Z`);
    const days = Math.floor((endMs - startMs) / 86400000) + 1;
    if (days > 366) {
        return res.status(400).json({ success: false, message: "Report date ranges cannot exceed 366 calendar days." });
    }

    const fromDateTime = `${dateFrom} 00:00:00`;
    try {
        const [collectionStatusResult, collectionTrendResult, complaintStatusResult, routeStatusResult, divisionResult] = await Promise.all([
            executeReportQuery("collection status summary", `
                SELECT status, COUNT(*) AS recordCount,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN waste_tons ELSE 0 END), 0) AS collectedTons
                FROM collections
                WHERE collection_date BETWEEN ? AND ?
                GROUP BY status
                ORDER BY status ASC
            `, [dateFrom, dateTo]),
            executeReportQuery("daily collection trend", `
                SELECT DATE_FORMAT(collection_date, '%Y-%m-%d') AS day,
                       COUNT(*) AS records,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN 1 ELSE 0 END), 0) AS collectedRecords,
                       COALESCE(SUM(CASE WHEN status = 'collected' THEN waste_tons ELSE 0 END), 0) AS collectedTons
                FROM collections
                WHERE collection_date BETWEEN ? AND ?
                GROUP BY collection_date
                ORDER BY collection_date ASC
            `, [dateFrom, dateTo]),
            executeReportQuery("reported complaint status summary", `
                SELECT status, COUNT(*) AS recordCount,
                       COALESCE(SUM(CASE WHEN priority = 'critical' AND status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS criticalActive
                FROM complaints
                WHERE reported_at >= ? AND reported_at < DATE_ADD(?, INTERVAL 1 DAY)
                GROUP BY status
                ORDER BY status ASC
            `, [fromDateTime, dateTo]),
            executeReportQuery("scheduled route status summary", `
                SELECT status, COUNT(*) AS recordCount
                FROM routes
                WHERE COALESCE(scheduled_start_time, created_at) >= ?
                  AND COALESCE(scheduled_start_time, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
                GROUP BY status
                ORDER BY status ASC
            `, [fromDateTime, dateTo]),
            executeReportQuery("Division comparison", `
                SELECT d.id AS divisionId,
                       d.division_code AS divisionCode,
                       d.division_name AS divisionName,
                       COALESCE(col.collectionRecords, 0) AS collectionRecords,
                       COALESCE(col.collectedRecords, 0) AS collectedRecords,
                       COALESCE(col.wasteTons, 0) AS wasteTons,
                       COALESCE(comp.complaintsReported, 0) AS complaintsReported,
                       COALESCE(comp.activeComplaints, 0) AS activeComplaints,
                       COALESCE(comp.resolvedComplaints, 0) AS resolvedComplaints,
                       COALESCE(comp.criticalActiveComplaints, 0) AS criticalActiveComplaints,
                       COALESCE(rt.routesInPeriod, 0) AS routesInPeriod,
                       COALESCE(rt.completedRoutes, 0) AS completedRoutes,
                       COALESCE(rt.delayedRoutes, 0) AS delayedRoutes
                FROM divisions d
                LEFT JOIN (
                    SELECT w.division_id,
                           COUNT(*) AS collectionRecords,
                           COALESCE(SUM(CASE WHEN col.status = 'collected' THEN 1 ELSE 0 END), 0) AS collectedRecords,
                           COALESCE(SUM(CASE WHEN col.status = 'collected' THEN col.waste_tons ELSE 0 END), 0) AS wasteTons
                    FROM collections col
                    INNER JOIN wards w ON w.id = col.ward_id
                    WHERE col.collection_date BETWEEN ? AND ?
                    GROUP BY w.division_id
                ) col ON col.division_id = d.id
                LEFT JOIN (
                    SELECT w.division_id,
                           COUNT(*) AS complaintsReported,
                           COALESCE(SUM(CASE WHEN c.status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS activeComplaints,
                           COALESCE(SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END), 0) AS resolvedComplaints,
                           COALESCE(SUM(CASE WHEN c.priority = 'critical' AND c.status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) AS criticalActiveComplaints
                    FROM complaints c
                    INNER JOIN wards w ON w.id = c.ward_id
                    WHERE c.reported_at >= ? AND c.reported_at < DATE_ADD(?, INTERVAL 1 DAY)
                    GROUP BY w.division_id
                ) comp ON comp.division_id = d.id
                LEFT JOIN (
                    SELECT w.division_id,
                           COUNT(*) AS routesInPeriod,
                           COALESCE(SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedRoutes,
                           COALESCE(SUM(CASE WHEN r.status = 'delayed' THEN 1 ELSE 0 END), 0) AS delayedRoutes
                    FROM routes r
                    INNER JOIN wards w ON w.id = r.ward_id
                    WHERE COALESCE(r.scheduled_start_time, r.created_at) >= ?
                      AND COALESCE(r.scheduled_start_time, r.created_at) < DATE_ADD(?, INTERVAL 1 DAY)
                    GROUP BY w.division_id
                ) rt ON rt.division_id = d.id
                ORDER BY d.division_name ASC, d.id ASC
            `, [dateFrom, dateTo, fromDateTime, dateTo, fromDateTime, dateTo])
        ]);

        const collectionStatusesRaw = collectionStatusResult[0] || [];
        const complaintStatusesRaw = complaintStatusResult[0] || [];
        const routeStatusesRaw = routeStatusResult[0] || [];
        const sumCount = (rows) => rows.reduce((sum, row) => sum + numeric(row.recordCount), 0);
        const findStatusCount = (rows, status) => numeric((rows.find((row) => row.status === status) || {}).recordCount);
        const collectionSummary = {
            records: sumCount(collectionStatusesRaw),
            collected: findStatusCount(collectionStatusesRaw, "collected"),
            inProgress: findStatusCount(collectionStatusesRaw, "in_progress"),
            skipped: findStatusCount(collectionStatusesRaw, "skipped"),
            wasteTons: collectionStatusesRaw.reduce((sum, row) => sum + numeric(row.collectedTons), 0)
        };
        const complaintSummary = {
            reported: sumCount(complaintStatusesRaw),
            open: findStatusCount(complaintStatusesRaw, "open"),
            inProgress: findStatusCount(complaintStatusesRaw, "in_progress"),
            resolved: findStatusCount(complaintStatusesRaw, "resolved"),
            cancelled: findStatusCount(complaintStatusesRaw, "cancelled"),
            criticalActive: complaintStatusesRaw.reduce((sum, row) => sum + numeric(row.criticalActive), 0)
        };
        const routeSummary = {
            total: sumCount(routeStatusesRaw),
            scheduled: findStatusCount(routeStatusesRaw, "scheduled"),
            starting: findStatusCount(routeStatusesRaw, "starting"),
            active: findStatusCount(routeStatusesRaw, "active"),
            delayed: findStatusCount(routeStatusesRaw, "delayed"),
            completed: findStatusCount(routeStatusesRaw, "completed"),
            cancelled: findStatusCount(routeStatusesRaw, "cancelled")
        };
        const divisions = (divisionResult[0] || []).map((row) => ({
            divisionId: numeric(row.divisionId),
            divisionCode: String(row.divisionCode || ""),
            divisionName: String(row.divisionName || "Unnamed Division"),
            collectionRecords: numeric(row.collectionRecords),
            collectedRecords: numeric(row.collectedRecords),
            wasteTons: numeric(row.wasteTons),
            complaintsReported: numeric(row.complaintsReported),
            activeComplaints: numeric(row.activeComplaints),
            resolvedComplaints: numeric(row.resolvedComplaints),
            criticalActiveComplaints: numeric(row.criticalActiveComplaints),
            routesInPeriod: numeric(row.routesInPeriod),
            completedRoutes: numeric(row.completedRoutes),
            delayedRoutes: numeric(row.delayedRoutes)
        }));

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                period: { dateFrom, dateTo, days },
                summary: { collections: collectionSummary, complaints: complaintSummary, routes: routeSummary },
                collectionTrend: (collectionTrendResult[0] || []).map((row) => ({
                    day: String(row.day), records: numeric(row.records),
                    collectedRecords: numeric(row.collectedRecords), collectedTons: numeric(row.collectedTons)
                })),
                collectionStatuses: collectionStatusesRaw.map((row) => ({ status: String(row.status), count: numeric(row.recordCount), collectedTons: numeric(row.collectedTons) })),
                complaintStatuses: complaintStatusesRaw.map((row) => ({ status: String(row.status), count: numeric(row.recordCount), criticalActive: numeric(row.criticalActive) })),
                routeStatuses: routeStatusesRaw.map((row) => ({ status: String(row.status), count: numeric(row.recordCount) })),
                divisions
            }
        });
    } catch (error) {
        console.error("Deputy Commissioner reports failed. See the [DC reports] Query failed entry above for the failing SQL operation.", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Reports and analytics data is temporarily unavailable. Check the server log and retry." });
    }
}


/**
 * Part 6: DC security centre and controlled staff account status changes.
 * Only Assistant Commissioner and Sanitary Inspector accounts are manageable.
 * Citizen accounts and all Deputy Commissioner accounts are intentionally excluded.
 */
async function executeSecurityQuery(label, sql, values = []) {
    try {
        return await db.execute(sql, values);
    } catch (error) {
        console.error(`[DC security] Query failed: ${label}`, {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown database error"
        });
        throw error;
    }
}

const DC_MANAGED_STAFF_ROLES = new Set(["assistant_commissioner", "sanitary_inspector"]);
const DC_SECURITY_STATUS_FILTERS = new Set(["all", "active", "inactive"]);
const DC_SECURITY_ROLE_FILTERS = new Set(["all", "assistant_commissioner", "sanitary_inspector"]);

async function getSecurityCenter(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const status = String(req.query?.status || "all").trim().toLowerCase();
    const role = String(req.query?.role || "all").trim().toLowerCase();
    const search = String(req.query?.q || "").trim().slice(0, 100);
    if (!DC_SECURITY_STATUS_FILTERS.has(status)) {
        return res.status(400).json({ success: false, message: "Invalid account status filter." });
    }
    if (!DC_SECURITY_ROLE_FILTERS.has(role)) {
        return res.status(400).json({ success: false, message: "Invalid staff role filter." });
    }

    const conditions = ["u.role IN ('assistant_commissioner', 'sanitary_inspector')"];
    const params = [];
    if (status !== "all") {
        conditions.push("u.status = ?");
        params.push(status);
    }
    if (role !== "all") {
        conditions.push("u.role = ?");
        params.push(role);
    }
    if (search) {
        const like = `%${search}%`;
        conditions.push("(CAST(u.id AS CHAR) LIKE ? OR u.email LIKE ? OR COALESCE(p.full_name, '') LIKE ?)");
        params.push(like, like, like);
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;

    try {
        const [summaryResult, accountCountResult, accountRowsResult, auditEvents] = await Promise.all([
            executeSecurityQuery("staff security summary", `
                SELECT
                    COUNT(*) AS totalManagedAccounts,
                    COALESCE(SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END), 0) AS activeManagedAccounts,
                    COALESCE(SUM(CASE WHEN u.status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactiveManagedAccounts,
                    COALESCE(SUM(CASE WHEN u.role = 'assistant_commissioner' AND u.status = 'active' THEN 1 ELSE 0 END), 0) AS activeAssistantCommissioners,
                    COALESCE(SUM(CASE WHEN u.role = 'sanitary_inspector' AND u.status = 'active' THEN 1 ELSE 0 END), 0) AS activeInspectors,
                    COALESCE(SUM(CASE
                        WHEN u.role = 'assistant_commissioner' AND p.division_id IS NULL THEN 1
                        WHEN u.role = 'sanitary_inspector' AND (p.division_id IS NULL OR p.ward_id IS NULL) THEN 1
                        ELSE 0 END), 0) AS incompleteScopeAccounts
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.role IN ('assistant_commissioner', 'sanitary_inspector')
            `),
            executeSecurityQuery("filtered staff count", `
                SELECT COUNT(*) AS total
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                ${whereSql}
            `, params),
            executeSecurityQuery("staff account list", `
                SELECT
                    u.id AS userId,
                    u.email AS email,
                    u.role AS role,
                    u.status AS status,
                    p.full_name AS fullName,
                    p.division_id AS divisionId,
                    d.division_name AS divisionName,
                    p.ward_id AS wardId,
                    w.ward_code AS wardCode,
                    u.created_at AS createdAt,
                    u.updated_at AS updatedAt
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                LEFT JOIN divisions d ON d.id = p.division_id
                LEFT JOIN wards w ON w.id = p.ward_id
                ${whereSql}
                ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END, u.role ASC, u.id ASC
                LIMIT 250
            `, params),
            readRecentAuditRecords(20)
        ]);

        const summaryRow = (summaryResult[0] && summaryResult[0][0]) || {};
        const total = Number((accountCountResult[0] && accountCountResult[0][0] && accountCountResult[0][0].total) || 0);
        const accounts = (accountRowsResult[0] || []).map((row) => ({
            userId: Number(row.userId),
            email: String(row.email || ""),
            role: String(row.role || ""),
            status: String(row.status || "unknown"),
            fullName: String(row.fullName || ""),
            divisionId: row.divisionId == null ? null : Number(row.divisionId),
            divisionName: row.divisionName == null ? "" : String(row.divisionName),
            wardId: row.wardId == null ? null : Number(row.wardId),
            wardCode: row.wardCode == null ? "" : String(row.wardCode),
            createdAt: row.createdAt || null,
            updatedAt: row.updatedAt || null
        }));

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Pragma", "no-cache");
        return res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                summary: {
                    totalManagedAccounts: numeric(summaryRow.totalManagedAccounts),
                    activeManagedAccounts: numeric(summaryRow.activeManagedAccounts),
                    inactiveManagedAccounts: numeric(summaryRow.inactiveManagedAccounts),
                    activeAssistantCommissioners: numeric(summaryRow.activeAssistantCommissioners),
                    activeInspectors: numeric(summaryRow.activeInspectors),
                    incompleteScopeAccounts: numeric(summaryRow.incompleteScopeAccounts)
                },
                accounts,
                total,
                truncated: total > accounts.length,
                auditEvents: Array.isArray(auditEvents) ? auditEvents : []
            }
        });
    } catch (error) {
        console.error("Deputy Commissioner security centre failed. See the [DC security] Query failed entry above.", error?.code || "security_data_error");
        return res.status(503).json({ success: false, message: "Security and account data is temporarily unavailable. Check the server log and retry." });
    }
}

async function updateStaffAccountStatus(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }

    const targetUserId = Number(req.params?.userId);
    const newStatus = String(req.body?.status || "").trim().toLowerCase();
    const reason = String(req.body?.reason || "").trim();
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: "A valid staff account identifier is required." });
    }
    if (targetUserId === Number(req.currentUser.id)) {
        return res.status(409).json({ success: false, message: "You cannot change your own account status from this dashboard." });
    }
    if (!new Set(["active", "inactive"]).has(newStatus)) {
        return res.status(400).json({ success: false, message: "Account status must be active or inactive." });
    }
    if (reason.length < 10 || reason.length > 300) {
        return res.status(400).json({ success: false, message: "Enter an administrative reason between 10 and 300 characters." });
    }

    let connection;
    let auditPrepared = false;
    let target = null;
    let actionId = "";
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Lock the AC set in a consistent order. This serializes the last-active-AC
        // check so two concurrent requests cannot deactivate the final AC together.
        await connection.execute(`
            SELECT id
            FROM users
            WHERE role = 'assistant_commissioner'
            ORDER BY id ASC
            FOR UPDATE
        `);

        const [targetRows] = await connection.execute(`
            SELECT id AS userId, role, status
            FROM users
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
        `, [targetUserId]);
        target = targetRows && targetRows[0] ? targetRows[0] : null;
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Staff account not found." });
        }
        if (!DC_MANAGED_STAFF_ROLES.has(String(target.role))) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "Only Assistant Commissioner and Sanitary Inspector accounts can be managed here. Citizen and Deputy Commissioner accounts are excluded." });
        }
        const previousStatus = String(target.status || "");
        if (!new Set(["active", "inactive"]).has(previousStatus)) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "This account uses a status value that this control does not manage. Review it through the established administrative workflow." });
        }
        if (previousStatus === newStatus) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: `The staff account is already ${newStatus}.` });
        }

        if (target.role === "assistant_commissioner" && newStatus === "inactive") {
            const [activeRows] = await connection.execute(`
                SELECT COUNT(*) AS activeCount
                FROM users
                WHERE role = 'assistant_commissioner' AND status = 'active'
            `);
            if (numeric(activeRows?.[0]?.activeCount) <= 1) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: "The final active Assistant Commissioner cannot be deactivated. Assign another active Assistant Commissioner first." });
            }
        }

        actionId = crypto.randomBytes(12).toString("hex");
        const auditBase = {
            actionId,
            actorUserId: Number(req.currentUser.id),
            targetUserId,
            targetRole: String(target.role),
            previousStatus,
            newStatus,
            reason,
            requestedAt: new Date().toISOString()
        };
        // Fail closed before changing the database if the audit log cannot be written.
        await appendAuditRecord({ ...auditBase, outcome: "requested", occurredAt: auditBase.requestedAt });
        auditPrepared = true;

        const [updateResult] = await connection.execute(`
            UPDATE users
            SET status = ?
            WHERE id = ? AND status = ? AND role = ?
        `, [newStatus, targetUserId, previousStatus, target.role]);
        if (Number(updateResult?.affectedRows || 0) !== 1) {
            throw new Error("STAFF_STATUS_CONCURRENT_CHANGE");
        }

        // Invalidate every saved session for the target account. The auth middleware
        // also checks users.status on every protected request; session deletion keeps
        // a later reactivation from reviving an old browser session.
        const [sessionDeleteResult] = await connection.execute(`
            DELETE FROM sessions
            WHERE CASE
                WHEN JSON_VALID(data) THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId'))
                ELSE NULL
            END = ?
        `, [String(targetUserId)]);
        const sessionsInvalidated = Number(sessionDeleteResult?.affectedRows || 0);
        await connection.commit();
        connection.release();
        connection = null;

        let auditRecorded = true;
        try {
            await appendAuditRecord({
                ...auditBase,
                outcome: "completed",
                sessionsInvalidated,
                occurredAt: new Date().toISOString()
            });
        } catch (auditError) {
            auditRecorded = false;
            console.error("[DC security] Status change committed but completion audit record failed.", {
                actionId,
                code: auditError?.code || "audit_write_error"
            });
        }

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({
            success: true,
            message: `Staff account ${targetUserId} is now ${newStatus}. ${sessionsInvalidated} saved session(s) invalidated.`,
            auditRecorded,
            auditWarning: auditRecorded ? null : "The status change was committed, but the audit completion record could not be written. Contact the system administrator and preserve the server logs.",
            data: { userId: targetUserId, role: String(target.role), previousStatus: String(target.status), status: newStatus, sessionsInvalidated }
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) { /* preserve the original error */ }
        }
        if (auditPrepared && target && actionId) {
            try {
                await appendAuditRecord({
                    actionId,
                    outcome: "failed",
                    actorUserId: Number(req.currentUser.id),
                    targetUserId,
                    targetRole: String(target.role || "unknown"),
                    previousStatus: String(target.status || "unknown"),
                    newStatus,
                    reason,
                    errorCode: String(error?.code || error?.message || "database_error").slice(0, 80),
                    occurredAt: new Date().toISOString()
                });
            } catch (auditError) {
                console.error("[DC security] Failed to append status-change failure audit record.", auditError?.code || "audit_write_error");
            }
        }
        console.error("Deputy Commissioner staff status change failed.", {
            code: error?.code || null,
            errno: error?.errno || null,
            sqlMessage: error?.sqlMessage || error?.message || "Unknown error"
        });
        return res.status(503).json({ success: false, message: "The staff account status could not be changed. Review the server log and retry only after verifying the current account status." });
    } finally {
        connection?.release();
    }
}

module.exports = { getCityOverview, getDivisionSupervision, getDivisionWards, getComplaintOversight, escalateComplaint, getFleetOperations, getReportsAnalytics, getSecurityCenter, updateStaffAccountStatus };

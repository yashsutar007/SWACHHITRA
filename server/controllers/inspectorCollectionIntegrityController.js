"use strict";

const db = require("../config/db");

const VIEW_ROLES = new Set([
    "deputy_commissioner",
    "assistant_commissioner",
    "sanitary_inspector"
]);

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function scopeError(message, statusCode = 403) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function resolveScope(req) {
    const role = String(req.currentUser?.role || "");
    const userId = positiveInteger(req.currentUser?.id);

    if (!VIEW_ROLES.has(role) || !userId) {
        throw scopeError("This account cannot view collection integrity.");
    }

    if (role === "deputy_commissioner") {
        return {
            role,
            type: "city",
            label: "Entire city",
            sql: "",
            params: []
        };
    }

    const [profiles] = await db.execute(
        `
        SELECT
            p.division_id,
            p.ward_id,
            d.status AS division_status,
            w.status AS ward_status,
            w.division_id AS ward_division_id
        FROM user_profiles p
        LEFT JOIN divisions d
            ON d.id = p.division_id
        LEFT JOIN wards w
            ON w.id = p.ward_id
        WHERE p.user_id = ?
        LIMIT 1
        `,
        [userId]
    );

    const profile = profiles[0];
    if (!profile) {
        throw scopeError("An operational scope is not configured for this account.");
    }

    if (role === "assistant_commissioner") {
        const divisionId = positiveInteger(profile.division_id);
        if (!divisionId || profile.division_status !== "active") {
            throw scopeError("Assistant Commissioner division assignment is missing or inactive.");
        }

        return {
            role,
            type: "division",
            divisionId,
            label: `Division ${divisionId}`,
            // Include a mismatched record when either its assigned Ward or its Route
            // falls inside this Division, so cross-Ward inconsistencies are detectable.
            sql: "AND (collection_ward.division_id = ? OR route_ward.division_id = ?)",
            params: [divisionId, divisionId]
        };
    }

    const wardId = positiveInteger(profile.ward_id);
    const divisionId = positiveInteger(profile.division_id);
    if (
        !wardId ||
        !divisionId ||
        profile.ward_status !== "active" ||
        positiveInteger(profile.ward_division_id) !== divisionId
    ) {
        throw scopeError("Inspector Division/Ward assignment is missing, inactive, or inconsistent.");
    }

    return {
        role,
        type: "ward",
        wardId,
        divisionId,
        label: `Ward ${wardId}`,
        sql: "AND (c.ward_id = ? OR r.ward_id = ?)",
        params: [wardId, wardId]
    };
}

const JOINS = `
    FROM collections c
    LEFT JOIN routes r
        ON r.id = c.route_id
    LEFT JOIN wards collection_ward
        ON collection_ward.id = c.ward_id
    LEFT JOIN wards route_ward
        ON route_ward.id = r.ward_id
    LEFT JOIN route_stops rs
        ON rs.id = c.route_stop_id
`;

const INVALID_CONDITION = `
    (
        r.id IS NULL
        OR collection_ward.id IS NULL
        OR route_ward.id IS NULL
        OR c.ward_id <> r.ward_id
        OR (
            c.route_stop_id IS NOT NULL
            AND (rs.id IS NULL OR rs.route_id <> c.route_id)
        )
    )
`;

function issueCodeForRow(row) {
    if (!row.route_exists) return "missing_route";
    if (!row.collection_ward_exists || !row.route_ward_exists) return "missing_ward";
    if (Number(row.collection_ward_id) !== Number(row.route_ward_id)) return "collection_route_ward_mismatch";
    if (
        row.route_stop_id !== null &&
        row.route_stop_id !== undefined &&
        (Number(row.route_stop_exists) !== 1 || Number(row.route_stop_route_id) !== Number(row.route_id))
    ) {
        return "route_stop_does_not_belong_to_route";
    }
    return "relationship_mismatch";
}

async function getCollectionIntegrity(req, res) {
    try {
        const scope = await resolveScope(req);
        const scopedWhere = `WHERE 1 = 1 ${scope.sql}`;

        const [totalRows] = await db.execute(
            `SELECT COUNT(*) AS records_checked ${JOINS} ${scopedWhere}`,
            scope.params
        );
        const recordsChecked = Number(totalRows[0]?.records_checked || 0);

        const [invalidCountRows] = await db.execute(
            `SELECT COUNT(*) AS invalid_records ${JOINS} ${scopedWhere} AND ${INVALID_CONDITION}`,
            scope.params
        );
        const invalidRecords = Number(invalidCountRows[0]?.invalid_records || 0);

        const [rows] = await db.execute(
            `
            SELECT
                c.id AS collection_id,
                c.route_id,
                c.route_stop_id,
                c.ward_id AS collection_ward_id,
                r.ward_id AS route_ward_id,
                r.id IS NOT NULL AS route_exists,
                collection_ward.id IS NOT NULL AS collection_ward_exists,
                route_ward.id IS NOT NULL AS route_ward_exists,
                rs.id IS NOT NULL AS route_stop_exists,
                rs.route_id AS route_stop_route_id
            ${JOINS}
            ${scopedWhere}
              AND ${INVALID_CONDITION}
            ORDER BY c.id DESC
            LIMIT 200
            `,
            scope.params
        );

        const details = rows.map(row => ({
            collectionId: Number(row.collection_id),
            routeId: Number(row.route_id),
            routeStopId: row.route_stop_id === null ? null : Number(row.route_stop_id),
            collectionWardId: row.collection_ward_id === null ? null : Number(row.collection_ward_id),
            routeWardId: row.route_ward_id === null ? null : Number(row.route_ward_id),
            issueCode: issueCodeForRow(row)
        }));

        return res.json({
            success: true,
            scope: {
                type: scope.type,
                label: scope.label
            },
            summary: {
                recordsChecked,
                validRecords: Math.max(0, recordsChecked - invalidRecords),
                invalidRecords,
                detailsTruncated: invalidRecords > details.length
            },
            invalidRecords: details
        });
    } catch (error) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        console.error(
            "Inspector collection-integrity check failed:",
            error?.code || "database_error"
        );
        return res.status(500).json({
            success: false,
            message: "Unable to check collection integrity."
        });
    }
}

module.exports = {
    getCollectionIntegrity
};

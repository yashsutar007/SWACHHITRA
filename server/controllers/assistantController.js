const db = require("../config/db");

const {
    extractPolygonCoordinates,
    normalizePolygonPoints,
    polygonContainedInPolygon,
    toGeoJsonPolygon,
    getOfficialWardBoundary,
    getWardPlanningBoundary,
    getDivisionPlanningBoundary
} = require("../utils/geography");

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
 * - Assistant-selected Inspector operational polygons are stored separately
 *   from the ward master/boundary tables. The division still comes only from
 *   the authenticated Assistant Commissioner's profile.
 */

const ROLE = "assistant_commissioner";
const INSPECTOR_ROLE = "sanitary_inspector";
const ASSISTANT_WARD_BOUNDARY_SOURCE_NAME =
    "SWACHHITRA Assistant Commissioner-defined operational ward boundary";

/*
 * Application safety envelope for editable operational geometry.
 * This is intentionally broader than the initial map viewport and is NOT
 * an official KMC municipal boundary. It only prevents accidental storage
 * of points in obviously unrelated regions.
 */
const KOLHAPUR_OPERATIONAL_LIMITS = {
    minLat: 16.50,
    maxLat: 16.90,
    minLng: 74.00,
    maxLng: 74.50
};

/*
 * RESEARCHED KMC DIVISION OFFICE MAP REFERENCE POINTS
 *
 * KMC identifies four divisional offices at:
 *   Division 1 -> Gandhi Maidan
 *   Division 2 -> Chhatrapati Shivaji Market
 *   Division 3 -> Rajarampuri
 *   Division 4 -> Tararani Market / Kawala Naka
 *
 * These coordinates are researched map reference points for the office
 * locations. They are NOT survey-grade coordinates and are NOT
 * administrative division boundary polygons.
 */
const DIVISION_OFFICE_LOCATIONS = {
    "DIV-1": {
        label: "Gandhi Maidan",
        address: "Divisional Office No. 1, Gandhi Maidan, Shivaji Peth, Kolhapur",
        latitude: 16.6917500,
        longitude: 74.2193750
    },
    "DIV-2": {
        label: "Chhatrapati Shivaji Market",
        address: "Divisional Office No. 2, Chhatrapati Shivaji Market, Kolhapur",
        latitude: 16.6975625,
        longitude: 74.2238125
    },
    "DIV-3": {
        label: "Rajarampuri",
        address: "Divisional Office No. 3, Jagdale Hall, Rajarampuri, Kolhapur",
        latitude: 16.6981875,
        longitude: 74.2425625
    },
    "DIV-4": {
        label: "Tararani Market / Kawala Naka",
        address: "Divisional Office No. 4, Tararani Market, Kawala Naka, Kolhapur",
        latitude: 16.7064375,
        longitude: 74.2484375
    }
};


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
 * Division operational working area
 * ---------------------------------------------------------
 *
 * This is an application-managed working envelope owned by the
 * Assistant Commissioner. It is deliberately separate from any
 * official KMC administrative boundary.
 */
async function getDivisionOperationalArea(divisionId, connection = db) {
    const [rows] = await connection.execute(
        `
        SELECT
            id,
            boundary_geojson,
            source,
            assigned_by,
            assigned_at,
            updated_at
        FROM division_operational_areas
        WHERE division_id = ?
        LIMIT 1
        `,
        [divisionId]
    );

    const polygon = extractPolygonCoordinates(
        rows[0]?.boundary_geojson
    );

    return polygon.length >= 3
        ? {
            id: Number(rows[0].id),
            source: rows[0].source || "assistant_defined",
            polygon,
            assigned_by: rows[0].assigned_by === null
                ? null
                : Number(rows[0].assigned_by),
            assigned_at: rows[0].assigned_at || null,
            updated_at: rows[0].updated_at || null
        }
        : null;
}


function pointInsideKolhapurOperationalLimits(point) {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);

    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= KOLHAPUR_OPERATIONAL_LIMITS.minLat &&
        lat <= KOLHAPUR_OPERATIONAL_LIMITS.maxLat &&
        lng >= KOLHAPUR_OPERATIONAL_LIMITS.minLng &&
        lng <= KOLHAPUR_OPERATIONAL_LIMITS.maxLng
    );
}


function validateOperationalPolygon(polygon, label = "Operational area") {
    if (!Array.isArray(polygon) || polygon.length < 3) {
        throw createError(
            `${label} must contain at least three distinct boundary points.`,
            400
        );
    }

    for (const point of polygon) {
        if (!pointInsideKolhapurOperationalLimits(point)) {
            throw createError(
                `${label} contains a coordinate outside the configured Kolhapur application safety range.`,
                400
            );
        }
    }

    return polygon;
}


/*
 * ---------------------------------------------------------
 * PUT /api/assistant/division-area
 * ---------------------------------------------------------
 *
 * Saves the Assistant Commissioner's application-managed
 * divisional operational working area. The authenticated
 * Assistant Commissioner determines the division.
 */
async function saveDivisionOperationalArea(req, res) {
    const operationalArea = normalizePolygonPoints(
        req.body?.operational_area?.polygon
    );

    if (!operationalArea) {
        return res.status(400).json({
            success: false,
            message: "A valid divisional operational area polygon with at least 3 distinct points is required."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const scope = await getAssistantScope(req, connection);

        validateOperationalPolygon(
            operationalArea,
            "Divisional operational area"
        );

        /*
         * Never shrink the divisional working area so far that an existing
         * active ward boundary becomes invalid. This permits enlargement
         * and vertex edits while preserving current ward/Inspector scope.
         */
        const [wardRows] = await connection.execute(
            `
            SELECT
                id,
                ward_code,
                ward_name
            FROM wards
            WHERE division_id = ?
              AND status = 'active'
            ORDER BY id
            `,
            [scope.divisionId]
        );

        for (const ward of wardRows) {
            const wardBoundary = await getWardPlanningBoundary(
                Number(ward.id),
                ward.ward_code,
                connection
            );

            if (!wardBoundary) {
                continue;
            }

            if (
                !polygonContainedInPolygon(
                    wardBoundary.polygon,
                    operationalArea
                )
            ) {
                throw createError(
                    `The new divisional operational area must contain the existing boundary for ${ward.ward_name || ward.ward_code}. Increase or reshape the Division area so it continues to contain all active ward areas.`,
                    400
                );
            }
        }

        /*
         * Preserve every currently assigned Inspector operational polygon.
         * Editing the Division working area must never strand an existing
         * Inspector scope, including the historical Ward 10 presentation
         * assignment.
         */
        const [inspectorAreaRows] = await connection.execute(
            `
            SELECT
                inspector_user_id,
                boundary_geojson
            FROM inspector_operational_areas
            WHERE division_id = ?
            `,
            [scope.divisionId]
        );

        for (const inspectorArea of inspectorAreaRows) {
            const inspectorPolygon = extractPolygonCoordinates(
                inspectorArea.boundary_geojson
            );

            if (inspectorPolygon.length < 3) {
                continue;
            }

            if (
                !polygonContainedInPolygon(
                    inspectorPolygon,
                    operationalArea
                )
            ) {
                throw createError(
                    `The new divisional operational area must contain the existing operational area for Inspector user ${Number(inspectorArea.inspector_user_id)}. Increase or reshape the Division area so existing Inspector assignments remain valid.`,
                    400
                );
            }
        }

        const operationalAreaGeoJson =
            toGeoJsonPolygon(operationalArea);

        if (!operationalAreaGeoJson) {
            throw createError(
                "The divisional operational area could not be converted to valid GeoJSON.",
                400
            );
        }

        await connection.execute(
            `
            INSERT INTO division_operational_areas (
                division_id,
                boundary_geojson,
                source,
                assigned_by,
                assigned_at,
                updated_at
            )
            VALUES (?, ?, 'assistant_defined', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                boundary_geojson = VALUES(boundary_geojson),
                source = 'assistant_defined',
                assigned_by = VALUES(assigned_by),
                assigned_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                scope.divisionId,
                operationalAreaGeoJson,
                scope.userId
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Divisional operational area saved successfully.",
            division: {
                id: scope.divisionId,
                code: scope.divisionCode,
                name: scope.divisionName
            },
            operational_area: {
                source: "assistant_defined",
                polygon: operationalArea
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Assistant Commissioner division-area rollback failed:",
                    rollbackError
                );
            }
        }

        return sendError(
            res,
            "Unable to save the divisional operational area.",
            error
        );
    } finally {
        if (connection) {
            connection.release();
        }
    }
}


/*
 * ---------------------------------------------------------
 * POST /api/assistant/wards
 * ---------------------------------------------------------
 *
 * Creates an application-managed operational ward in the
 * authenticated Assistant Commissioner's division.
 * The Division is never accepted from the browser.
 */
async function createOperationalWard(req, res) {
    const wardNumber = positiveInteger(req.body?.ward_number);
    const wardCode = clean(req.body?.ward_code);
    const wardName = clean(req.body?.ward_name);
    const boundary = normalizePolygonPoints(
        req.body?.boundary?.polygon
    );

    if (!wardNumber || wardNumber > 9999) {
        return res.status(400).json({
            success: false,
            message: "ward_number must be a positive integer between 1 and 9999."
        });
    }

    if (!wardCode || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(wardCode)) {
        return res.status(400).json({
            success: false,
            message: "ward_code must be 2-30 characters using letters, numbers, hyphens or underscores."
        });
    }

    if (!wardName || wardName.length < 2 || wardName.length > 120) {
        return res.status(400).json({
            success: false,
            message: "ward_name must contain between 2 and 120 characters."
        });
    }

    if (!boundary) {
        return res.status(400).json({
            success: false,
            message: "A valid operational ward boundary with at least 3 distinct points is required."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const scope = await getAssistantScope(req, connection);

        validateOperationalPolygon(
            boundary,
            "Operational ward boundary"
        );

        const divisionArea = await getDivisionOperationalArea(
            scope.divisionId,
            connection
        );

        if (
            divisionArea &&
            !polygonContainedInPolygon(
                boundary,
                divisionArea.polygon
            )
        ) {
            throw createError(
                "The new ward boundary must remain completely inside the saved divisional operational working area.",
                400
            );
        }

        const [duplicateCodeRows] = await connection.execute(
            `
            SELECT id
            FROM wards
            WHERE UPPER(ward_code) = UPPER(?)
            LIMIT 1
            FOR UPDATE
            `,
            [wardCode]
        );

        if (duplicateCodeRows.length) {
            throw createError(
                "That ward code is already in use.",
                409
            );
        }

        const [duplicateNameRows] = await connection.execute(
            `
            SELECT id
            FROM wards
            WHERE division_id = ?
              AND LOWER(ward_name) = LOWER(?)
            LIMIT 1
            FOR UPDATE
            `,
            [scope.divisionId, wardName]
        );

        if (duplicateNameRows.length) {
            throw createError(
                "A ward with that name already exists in your division.",
                409
            );
        }

        const [duplicateNumberRows] = await connection.execute(
            `
            SELECT id
            FROM wards
            WHERE division_id = ?
              AND ward_number = ?
            LIMIT 1
            FOR UPDATE
            `,
            [scope.divisionId, wardNumber]
        );

        if (duplicateNumberRows.length) {
            throw createError(
                "That operational ward number is already in use in your division.",
                409
            );
        }

        /*
         * Backward-compatible zone resolution.
         *
         * Legacy route/Inspector tables require wards.zone_id even though
         * divisions are not directly related to zones in the current schema.
         * Reuse an active Zone already used by a Ward in this Division. If
         * this Division has no Ward yet (for example, a newly configured
         * Division 2), create one explicitly named application-managed
         * compatibility Zone so the first operational Ward can be created.
         * This is NOT an official geographic zone and does not claim official
         * KMC geography. Its only purpose is to satisfy the legacy foreign key.
         */
        const [compatibilityRows] = await connection.execute(
            `
            SELECT
                w.zone_id,
                z.zone_code,
                z.zone_name,
                z.status AS zone_status
            FROM wards w
            INNER JOIN zones z ON z.id = w.zone_id
            WHERE w.division_id = ?
            ORDER BY
                CASE WHEN z.status = 'active' THEN 0 ELSE 1 END,
                CASE WHEN w.status = 'active' THEN 0 ELSE 1 END,
                w.id
            LIMIT 1
            FOR UPDATE
            `,
            [scope.divisionId]
        );

        let compatibilityZone = compatibilityRows.find(
            row => row.zone_status === "active" && positiveInteger(row.zone_id)
        ) || null;

        if (!compatibilityZone) {
            const divisionToken = String(
                scope.divisionCode || `DIV-${scope.divisionId}`
            )
                .toUpperCase()
                .replace(/[^A-Z0-9_-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-+|-+$/g, "") || `DIV-${scope.divisionId}`;

            const zoneSuffix = "-OPS";
            const compatibilityZoneCode =
                `${divisionToken.slice(0, 30 - zoneSuffix.length)}${zoneSuffix}`;
            const compatibilityZoneName =
                `${scope.divisionName || `Division ${scope.divisionId}`} Operational Zone (app-managed)`
                    .slice(0, 100);

            const [zoneRows] = await connection.execute(
                `
                SELECT id, zone_code, zone_name, status
                FROM zones
                WHERE zone_code = ?
                LIMIT 1
                FOR UPDATE
                `,
                [compatibilityZoneCode]
            );

            if (zoneRows.length) {
                if (zoneRows[0].status !== "active") {
                    throw createError(
                        `The app-managed compatibility Zone ${compatibilityZoneCode} exists but is inactive. Ask an administrator to review it before creating a Ward.`,
                        409
                    );
                }
                compatibilityZone = {
                    zone_id: Number(zoneRows[0].id),
                    zone_code: zoneRows[0].zone_code,
                    zone_name: zoneRows[0].zone_name,
                    zone_status: zoneRows[0].status
                };
            } else {
                try {
                    const [zoneInsert] = await connection.execute(
                        `
                        INSERT INTO zones (zone_code, zone_name, status)
                        VALUES (?, ?, 'active')
                        `,
                        [compatibilityZoneCode, compatibilityZoneName]
                    );

                    compatibilityZone = {
                        zone_id: Number(zoneInsert.insertId),
                        zone_code: compatibilityZoneCode,
                        zone_name: compatibilityZoneName,
                        zone_status: "active"
                    };
                } catch (zoneInsertError) {
                    // If two first-Ward requests race, reuse the deterministic
                    // code created by the request that won the unique-key race.
                    if (zoneInsertError?.code !== "ER_DUP_ENTRY") {
                        throw zoneInsertError;
                    }

                    const [racedZoneRows] = await connection.execute(
                        `
                        SELECT id, zone_code, zone_name, status
                        FROM zones
                        WHERE zone_code = ?
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [compatibilityZoneCode]
                    );

                    if (!racedZoneRows.length || racedZoneRows[0].status !== "active") {
                        throw zoneInsertError;
                    }

                    compatibilityZone = {
                        zone_id: Number(racedZoneRows[0].id),
                        zone_code: racedZoneRows[0].zone_code,
                        zone_name: racedZoneRows[0].zone_name,
                        zone_status: racedZoneRows[0].status
                    };
                }
            }
        }

        const compatibilityZoneId = positiveInteger(
            compatibilityZone?.zone_id
        );

        if (!compatibilityZoneId) {
            throw createError(
                "A valid active compatibility Zone could not be resolved for this Division.",
                409
            );
        }

        const [insertResult] = await connection.execute(
            `
            INSERT INTO wards (
                zone_id,
                division_id,
                ward_number,
                ward_code,
                ward_name,
                status
            )
            VALUES (?, ?, ?, ?, ?, 'active')
            `,
            [
                compatibilityZoneId,
                scope.divisionId,
                wardNumber,
                wardCode,
                wardName
            ]
        );

        const wardId = Number(insertResult.insertId);

        const boundaryGeoJson =
            toGeoJsonPolygon(boundary);

        if (!boundaryGeoJson) {
            throw createError(
                "The operational ward boundary could not be converted to valid GeoJSON.",
                400
            );
        }

        /*
         * Non-official geometry is stored separately from verified official
         * geometry. geography.js will expose it as assistant_defined so the
         * UI never calls it an official KMC boundary.
         */
        const [existingBoundaryRows] = await connection.execute(
            `
            SELECT
                ward_id,
                is_official
            FROM ward_boundaries
            WHERE ward_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [wardId]
        );

        if (existingBoundaryRows.length) {
            if (Number(existingBoundaryRows[0].is_official) === 1) {
                throw createError(
                    "An official boundary already exists for this ward and cannot be replaced by Assistant Commissioner-defined geometry.",
                    409
                );
            }

            await connection.execute(
                `
                UPDATE ward_boundaries
                SET
                    boundary_geojson = ?,
                    source_name = ?,
                    source_url = NULL,
                    source_document_date = NULL,
                    source_version = NULL,
                    is_official = 0,
                    verified_by = NULL,
                    verified_at = NULL,
                    checksum_sha256 = NULL
                WHERE ward_id = ?
                  AND is_official = 0
                `,
                [
                    boundaryGeoJson,
                    ASSISTANT_WARD_BOUNDARY_SOURCE_NAME,
                    wardId
                ]
            );
        } else {
            await connection.execute(
                `
                INSERT INTO ward_boundaries (
                    ward_id,
                    boundary_geojson,
                    source_name,
                    source_url,
                    source_document_date,
                    source_version,
                    is_official,
                    verified_by,
                    verified_at,
                    checksum_sha256
                )
                VALUES (?, ?, ?, NULL, NULL, NULL, 0, NULL, NULL, NULL)
                `,
                [
                    wardId,
                    boundaryGeoJson,
                    ASSISTANT_WARD_BOUNDARY_SOURCE_NAME
                ]
            );
        }

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Operational ward created successfully.",
            ward: {
                id: wardId,
                division_id: scope.divisionId,
                number: wardNumber,
                code: wardCode,
                name: wardName,
                status: "active",
                zone_id: compatibilityZoneId,
                zone_code: compatibilityZone?.zone_code || null,
                zone_name: compatibilityZone?.zone_name || null,
                zone_scope: "app_managed_compatibility",
                boundary: {
                    source: "assistant_defined",
                    polygon: boundary
                }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Operational ward creation rollback failed:",
                    rollbackError
                );
            }
        }

        return sendError(
            res,
            "Unable to create the operational ward.",
            error
        );
    } finally {
        if (connection) {
            connection.release();
        }
    }
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
                    COUNT(DISTINCT v.id) AS division_vehicles

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

        const operationalArea =
            await getDivisionOperationalArea(
                scope.divisionId,
                db
            );

        return res.json({
            success: true,

            scope: {
                type: "division",
                division_id: scope.divisionId,
                division_code: scope.divisionCode,
                division_name: scope.divisionName,
                office_location: scope.officeLocation,
                planning_boundary:
                    getDivisionPlanningBoundary(
                        scope.divisionId,
                        scope.divisionCode
                    ),

                operational_area: operationalArea
                    ? {
                        source: operationalArea.source,
                        polygon: operationalArea.polygon,
                        updated_at: operationalArea.updated_at
                    }
                    : null
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

                division_vehicles:
                    Number(vehicleRows[0]?.division_vehicles || 0),

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
                w.status
            FROM wards w
            WHERE w.division_id = ?
              AND w.status = 'active'
            ORDER BY w.ward_number, w.ward_name
            `,
            [scope.divisionId]
        );

        const wards = await Promise.all(
            rows.map(async row => {
                const planningBoundary =
                    await getWardPlanningBoundary(
                        Number(row.id),
                        row.ward_code,
                        db
                    );

                return {
                    id: Number(row.id),
                    zone_id: row.zone_id === null
                        ? null
                        : Number(row.zone_id),
                    division_id: Number(row.division_id),
                    number: Number(row.ward_number),
                    code: row.ward_code,
                    name: row.ward_name,
                    has_official_boundary:
                        planningBoundary?.source === "official",
                    planning_boundary:
                        planningBoundary
                            ? {
                                source: planningBoundary.source,
                                polygon: planningBoundary.polygon
                            }
                            : null
                };
            })
        );

        const office =
            DIVISION_OFFICE_LOCATIONS[
                String(scope.divisionCode || "").toUpperCase()
            ] || null;

        const operationalArea =
            await getDivisionOperationalArea(
                scope.divisionId,
                db
            );

        return res.json({
            success: true,
            division: {
                id: scope.divisionId,
                code: scope.divisionCode,
                name: scope.divisionName,
                office_location: scope.officeLocation,
                office_point: office
                    ? {
                        label: office.label,
                        address: office.address,
                        latitude: office.latitude,
                        longitude: office.longitude
                    }
                    : null,
                planning_boundary:
                    getDivisionPlanningBoundary(
                        scope.divisionId,
                        scope.divisionCode
                    ),
                operational_area: operationalArea
                    ? {
                        source: operationalArea.source,
                        polygon: operationalArea.polygon,
                        updated_at: operationalArea.updated_at
                    }
                    : null
            },
            wards
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
 * PUT /api/assistant/wards/:id/boundary
 * ---------------------------------------------------------
 *
 * Updates an application-managed operational ward boundary.
 * Official ward geometry is immutable through this endpoint.
 * Development/demo geometry can be promoted to AC-defined geometry.
 */
async function updateOperationalWardBoundary(req, res) {
    const wardId = positiveInteger(req.params?.id);
    const boundary = normalizePolygonPoints(
        req.body?.boundary?.polygon
    );

    if (!wardId) {
        return res.status(400).json({
            success: false,
            message: "Invalid ward ID."
        });
    }

    if (!boundary) {
        return res.status(400).json({
            success: false,
            message: "A valid ward boundary polygon with at least 3 distinct points is required."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const scope = await getAssistantScope(req, connection);

        validateOperationalPolygon(
            boundary,
            "Operational ward boundary"
        );

        const [wardRows] = await connection.execute(
            `
            SELECT
                w.id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,
                w.status
            FROM wards w
            WHERE w.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [wardId]
        );

        const ward = wardRows[0];

        if (!ward) {
            throw createError(
                "Ward was not found.",
                404
            );
        }

        if (Number(ward.division_id) !== scope.divisionId) {
            throw createError(
                "This ward is outside the Assistant Commissioner's assigned division.",
                403
            );
        }

        if (ward.status !== "active") {
            throw createError(
                "Only active operational wards can have their application-managed boundary edited.",
                409
            );
        }

        const currentBoundary =
            await getWardPlanningBoundary(
                Number(ward.id),
                ward.ward_code,
                connection
            );

        if (currentBoundary?.source === "official") {
            throw createError(
                "Official ward boundary geometry is read-only and cannot be edited by the Assistant Commissioner.",
                409
            );
        }

        const divisionArea = await getDivisionOperationalArea(
            scope.divisionId,
            connection
        );

        if (
            divisionArea &&
            !polygonContainedInPolygon(
                boundary,
                divisionArea.polygon
            )
        ) {
            throw createError(
                "The edited ward boundary must remain completely inside the saved divisional operational working area.",
                400
            );
        }

        /* Preserve existing Inspector operational areas attached to this ward. */
        const [inspectorAreaRows] = await connection.execute(
            `
            SELECT
                inspector_user_id,
                boundary_geojson
            FROM inspector_operational_areas
            WHERE division_id = ?
              AND ward_id = ?
            `,
            [scope.divisionId, wardId]
        );

        for (const inspectorArea of inspectorAreaRows) {
            const inspectorPolygon = extractPolygonCoordinates(
                inspectorArea.boundary_geojson
            );

            if (inspectorPolygon.length < 3) {
                continue;
            }

            if (
                !polygonContainedInPolygon(
                    inspectorPolygon,
                    boundary
                )
            ) {
                throw createError(
                    `The edited ward boundary must continue to contain the existing Inspector operational area for Inspector user ${Number(inspectorArea.inspector_user_id)}.`,
                    400
                );
            }
        }

        const boundaryGeoJson =
            toGeoJsonPolygon(boundary);

        if (!boundaryGeoJson) {
            throw createError(
                "The ward boundary could not be converted to valid GeoJSON.",
                400
            );
        }

        const [boundaryRows] = await connection.execute(
            `
            SELECT
                ward_id,
                is_official
            FROM ward_boundaries
            WHERE ward_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [wardId]
        );

        if (boundaryRows.length) {
            if (Number(boundaryRows[0].is_official) === 1) {
                throw createError(
                    "Official ward boundary geometry is read-only and cannot be edited by the Assistant Commissioner.",
                    409
                );
            }

            await connection.execute(
                `
                UPDATE ward_boundaries
                SET
                    boundary_geojson = ?,
                    source_name = ?,
                    source_url = NULL,
                    source_document_date = NULL,
                    source_version = NULL,
                    is_official = 0,
                    verified_by = NULL,
                    verified_at = NULL,
                    checksum_sha256 = NULL
                WHERE ward_id = ?
                  AND is_official = 0
                `,
                [
                    boundaryGeoJson,
                    ASSISTANT_WARD_BOUNDARY_SOURCE_NAME,
                    wardId
                ]
            );
        } else {
            await connection.execute(
                `
                INSERT INTO ward_boundaries (
                    ward_id,
                    boundary_geojson,
                    source_name,
                    source_url,
                    source_document_date,
                    source_version,
                    is_official,
                    verified_by,
                    verified_at,
                    checksum_sha256
                )
                VALUES (?, ?, ?, NULL, NULL, NULL, 0, NULL, NULL, NULL)
                `,
                [
                    wardId,
                    boundaryGeoJson,
                    ASSISTANT_WARD_BOUNDARY_SOURCE_NAME
                ]
            );
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "Operational ward boundary saved successfully.",
            ward: {
                id: Number(ward.id),
                division_id: Number(ward.division_id),
                number: Number(ward.ward_number),
                code: ward.ward_code,
                name: ward.ward_name,
                boundary: {
                    source: "assistant_defined",
                    polygon: boundary
                }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Operational ward boundary rollback failed:",
                    rollbackError
                );
            }
        }

        return sendError(
            res,
            "Unable to save the operational ward boundary.",
            error
        );
    } finally {
        if (connection) {
            connection.release();
        }
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
                END AS ward_has_official_boundary,

                ioa.boundary_geojson AS operational_area_geojson,
                ioa.source AS operational_area_source,
                ioa.assigned_at AS operational_area_assigned_at

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

            LEFT JOIN inspector_operational_areas ioa
                ON ioa.inspector_user_id = u.id
               AND ioa.division_id = p.division_id
               AND ioa.ward_id = p.ward_id

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

                operational_area:
                    (() => {
                        const polygon =
                            extractPolygonCoordinates(
                                row.operational_area_geojson
                            );

                        return polygon.length >= 3
                            ? {
                                source: row.operational_area_source || "assistant_selected",
                                polygon,
                                assigned_at:
                                    row.operational_area_assigned_at || null
                            }
                            : null;
                    })(),

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
         * Inspector operational areas are constrained by the selected Ward,
         * not by a guessed or broad divisional envelope. Official ward
         * geometry takes precedence. The current presentation Ward 10 may
         * use its explicitly configured development boundary.
         */
        const wardPlanningBoundary =
            await getWardPlanningBoundary(
                Number(ward.id),
                ward.ward_code,
                connection
            );

        if (!wardPlanningBoundary) {
            throw createError(
                `No ward boundary is configured for Ward ${Number(ward.ward_number)}. Configure the ward boundary before assigning an Inspector operational area.`,
                409
            );
        }

        /*
         * The Inspector's authoritative AC scope is the selected Ward.
         * Do not delete or rewrite the legacy Inspector operational-area
         * record here. It may still be used by the existing Inspector
         * module, and changing a Ward boundary must not erase that data.
         *
         * Ward boundary editing is handled explicitly by
         * updateOperationalWardBoundary. Changing the Ward polygon keeps
         * the same ward.id, so routes already attached to this Ward remain
         * attached to the same Ward and are not reassigned.
         */
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
                `You have been assigned to ${ward.division_name} - ${ward.ward_name}. Your Inspector operational area is currently not configured separately; the Ward is the current jurisdiction boundary.`,
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
                },
                operational_area: null
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



/*
 * ---------------------------------------------------------
 * GET /api/assistant/map
 * ---------------------------------------------------------
 *
 * Read-only operational map for the authenticated Assistant
 * Commissioner's division.
 *
 * Returns the fixed division office point, any available
 * verified official ward boundaries, all non-cancelled routes
 * in the division, route stops, and current vehicle/driver
 * assignment data.
 *
 * The division is derived from the authenticated Assistant
 * Commissioner's profile. It is never accepted from the browser.
 */


function parseJsonSnapshot(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return {
            raw: String(value)
        };
    }
}

async function releaseVehicleIfUnusedForApproval(connection, vehicleId) {
    if (!vehicleId) {
        return;
    }

    const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS active_count
        FROM route_assignments
        WHERE vehicle_id = ?
          AND status IN ('assigned', 'active', 'delayed')
        `,
        [vehicleId]
    );

    if (Number(rows[0]?.active_count || 0) === 0) {
        await connection.execute(
            `
            UPDATE vehicles
            SET status = 'available'
            WHERE id = ?
            `,
            [vehicleId]
        );
    }
}

async function releaseDriverIfUnusedForApproval(connection, driverId) {
    if (!driverId) {
        return;
    }

    const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS active_count
        FROM route_assignments
        WHERE driver_id = ?
          AND status IN ('assigned', 'active', 'delayed')
        `,
        [driverId]
    );

    if (Number(rows[0]?.active_count || 0) === 0) {
        await connection.execute(
            `
            UPDATE drivers
            SET status = 'available'
            WHERE id = ?
            `,
            [driverId]
        );
    }
}

async function cancelRouteAssignmentsForApproval(connection, routeId) {
    const [assignments] = await connection.execute(
        `
        SELECT id, vehicle_id, driver_id
        FROM route_assignments
        WHERE route_id = ?
          AND status IN ('assigned', 'active', 'delayed')
        FOR UPDATE
        `,
        [routeId]
    );

    await connection.execute(
        `
        UPDATE route_assignments
        SET
            status = 'cancelled',
            unassigned_at = NOW()
        WHERE route_id = ?
          AND status IN ('assigned', 'active', 'delayed')
        `,
        [routeId]
    );

    for (const assignment of assignments) {
        await releaseVehicleIfUnusedForApproval(
            connection,
            Number(assignment.vehicle_id)
        );
        await releaseDriverIfUnusedForApproval(
            connection,
            Number(assignment.driver_id)
        );
    }
}

async function applyApprovedRouteReassignment(
    connection,
    routeId,
    routeStatus,
    vehicleId,
    driverId,
    approvedBy
) {
    if (!vehicleId || !driverId) {
        throw createError(
            "Approved route reassignment requires both a vehicle and a driver.",
            409
        );
    }

    if (["completed", "cancelled"].includes(String(routeStatus))) {
        throw createError(
            "Completed or cancelled routes cannot receive a new approved crew assignment.",
            409
        );
    }

    const [vehicleRows] = await connection.execute(
        `
        SELECT id, status
        FROM vehicles
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [vehicleId]
    );

    if (!vehicleRows.length) {
        throw createError("The approved vehicle no longer exists.", 409);
    }

    const [vehicleUseRows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE vehicle_id = ?
          AND route_id <> ?
          AND status IN ('assigned', 'active', 'delayed')
        LIMIT 1
        FOR UPDATE
        `,
        [vehicleId, routeId]
    );

    if (vehicleUseRows.length) {
        throw createError(
            "The approved vehicle is already assigned to another active route.",
            409
        );
    }

    const [driverRows] = await connection.execute(
        `
        SELECT id, status
        FROM drivers
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [driverId]
    );

    if (!driverRows.length) {
        throw createError("The approved driver no longer exists.", 409);
    }

    const [driverUseRows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE driver_id = ?
          AND route_id <> ?
          AND status IN ('assigned', 'active', 'delayed')
        LIMIT 1
        FOR UPDATE
        `,
        [driverId, routeId]
    );

    if (driverUseRows.length) {
        throw createError(
            "The approved driver is already assigned to another active route.",
            409
        );
    }

    const [currentRows] = await connection.execute(
        `
        SELECT id, vehicle_id, driver_id
        FROM route_assignments
        WHERE route_id = ?
          AND status IN ('assigned', 'active', 'delayed')
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [routeId]
    );

    const current = currentRows[0] || null;

    if (
        current &&
        Number(current.vehicle_id) === Number(vehicleId) &&
        Number(current.driver_id) === Number(driverId)
    ) {
        return;
    }

    if (current) {
        await connection.execute(
            `
            UPDATE route_assignments
            SET
                status = 'cancelled',
                unassigned_at = NOW()
            WHERE id = ?
            `,
            [Number(current.id)]
        );

        await releaseVehicleIfUnusedForApproval(
            connection,
            Number(current.vehicle_id)
        );
        await releaseDriverIfUnusedForApproval(
            connection,
            Number(current.driver_id)
        );
    }

    const assignmentStatus =
        routeStatus === "delayed"
            ? "delayed"
            : routeStatus === "active" || routeStatus === "starting"
                ? "active"
                : "assigned";

    await connection.execute(
        `
        INSERT INTO route_assignments (
            assignment_code,
            route_id,
            vehicle_id,
            driver_id,
            assigned_by,
            status,
            assigned_at,
            started_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
        `,
        [
            `ASG-${routeId}-${Date.now()}`,
            routeId,
            vehicleId,
            driverId,
            approvedBy,
            assignmentStatus,
            assignmentStatus === "active" ? new Date() : null
        ]
    );

    const vehicleStatus =
        routeStatus === "delayed"
            ? "delayed"
            : routeStatus === "active" || routeStatus === "starting"
                ? "en_route"
                : "available";

    await connection.execute(
        `
        UPDATE vehicles
        SET status = ?
        WHERE id = ?
        `,
        [vehicleStatus, vehicleId]
    );

    await connection.execute(
        `
        UPDATE drivers
        SET status = 'assigned'
        WHERE id = ?
        `,
        [driverId]
    );
}

/*
 * ---------------------------------------------------------
 * GET /api/assistant/supervision
 * ---------------------------------------------------------
 *
 * Read-only operational supervision snapshot for the
 * authenticated Assistant Commissioner's Division.
 *
 * No write operations are exposed here. Every operational record
 * is scoped through the authenticated Division and its wards.
 */
async function getSupervision(req, res) {
    try {
        const scope = await getAssistantScope(req);

        const [routeRows] = await db.execute(
            `
            SELECT
                r.id,
                r.route_code,
                r.route_name,
                r.status,
                r.total_stops,
                r.completed_stops,
                r.delay_minutes,
                r.scheduled_start_time,
                r.scheduled_end_time,

                w.id AS ward_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,

                ra.id AS assignment_id,
                ra.status AS assignment_status,

                v.id AS vehicle_id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.status AS vehicle_status,
                v.current_latitude,
                v.current_longitude,
                v.last_location_at,

                d.id AS driver_id,
                d.employee_id AS driver_employee_id,
                d.full_name AS driver_name

            FROM routes r
            JOIN wards w
                ON w.id = r.ward_id
               AND w.division_id = ?
               AND w.status = 'active'

            LEFT JOIN route_assignments ra
                ON ra.id = (
                    SELECT MAX(ra2.id)
                    FROM route_assignments ra2
                    WHERE ra2.route_id = r.id
                      AND ra2.status IN ('assigned', 'active', 'delayed')
                )

            LEFT JOIN vehicles v
                ON v.id = ra.vehicle_id

            LEFT JOIN drivers d
                ON d.id = ra.driver_id

            WHERE r.status <> 'cancelled'
              AND (
                    r.division_id = ?
                    OR r.division_id IS NULL
                  )

            ORDER BY r.id DESC
            `,
            [scope.divisionId, scope.divisionId]
        );

        const routeIds = routeRows.map(row => Number(row.id));
        const routePlaceholders = routeIds.map(() => '?').join(',');

        let stopRows = [];
        if (routeIds.length) {
            const [rows] = await db.execute(
                `
                SELECT route_id, COUNT(*) AS total_stops
                FROM route_stops
                WHERE route_id IN (${routePlaceholders})
                GROUP BY route_id
                `,
                routeIds
            );
            stopRows = rows;
        }

        const stopCountByRoute = new Map(
            stopRows.map(row => [
                Number(row.route_id),
                Number(row.total_stops || 0)
            ])
        );

        const [vehicleRows] = await db.execute(
            `
            SELECT
                v.id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.status,
                v.last_location_at,
                v.current_latitude,
                v.current_longitude,
                r.route_code,
                d.full_name AS driver_name,
                r.id AS route_id
            FROM vehicles v
            JOIN route_assignments ra
                ON ra.vehicle_id = v.id
               AND ra.status IN ('assigned', 'active', 'delayed')
            JOIN routes r
                ON r.id = ra.route_id
            JOIN wards w
                ON w.id = r.ward_id
               AND w.division_id = ?
               AND w.status = 'active'
            LEFT JOIN drivers d
                ON d.id = ra.driver_id
            WHERE r.status <> 'cancelled'
              AND ra.id = (
                    SELECT MAX(ra2.id)
                    FROM route_assignments ra2
                    JOIN routes r2
                        ON r2.id = ra2.route_id
                    JOIN wards w2
                        ON w2.id = r2.ward_id
                       AND w2.division_id = ?
                       AND w2.status = 'active'
                    WHERE ra2.vehicle_id = v.id
                      AND ra2.status IN ('assigned', 'active', 'delayed')
                      AND r2.status <> 'cancelled'
              )
            ORDER BY v.vehicle_number
            `,
            [scope.divisionId, scope.divisionId]
        );

        const [driverRows] = await db.execute(
            `
            SELECT
                d.id,
                d.employee_id,
                d.full_name,
                d.mobile_number,
                d.status,
                w.ward_name,
                v.vehicle_number,
                r.route_code
            FROM drivers d
            LEFT JOIN wards w
                ON w.id = d.assigned_ward_id
               AND w.division_id = ?
               AND w.status = 'active'
            LEFT JOIN route_assignments ra
                ON ra.driver_id = d.id
               AND ra.status IN ('assigned', 'active', 'delayed')
               AND ra.id = (
                    SELECT MAX(ra2.id)
                    FROM route_assignments ra2
                    JOIN routes r2
                        ON r2.id = ra2.route_id
                    JOIN wards w2
                        ON w2.id = r2.ward_id
                       AND w2.division_id = ?
                       AND w2.status = 'active'
                    WHERE ra2.driver_id = d.id
                      AND ra2.status IN ('assigned', 'active', 'delayed')
                      AND r2.status <> 'cancelled'
               )
            LEFT JOIN vehicles v
                ON v.id = ra.vehicle_id
            LEFT JOIN routes r
                ON r.id = ra.route_id
            WHERE w.id IS NOT NULL
               OR ra.driver_id IS NOT NULL
            ORDER BY d.full_name, d.employee_id
            `,
            [scope.divisionId, scope.divisionId]
        );

        const [collectionRows] = await db.execute(
            `
            SELECT
                c.id,
                c.collection_date,
                c.waste_tons,
                c.status,
                c.collected_at,
                w.ward_name,
                r.route_code
            FROM collections c
            JOIN wards w
                ON w.id = c.ward_id
               AND w.division_id = ?
               AND w.status = 'active'
            LEFT JOIN routes r
                ON r.id = c.route_id
            ORDER BY c.id DESC
            LIMIT 100
            `,
            [scope.divisionId]
        );

        const [complaintRows] = await db.execute(
            `
            SELECT
                c.id,
                c.complaint_code,
                c.complaint_type,
                c.priority,
                c.status,
                c.reported_at,
                w.ward_name
            FROM complaints c
            LEFT JOIN wards w
                ON w.id = c.ward_id
            WHERE w.division_id = ?
              AND w.status = 'active'
            ORDER BY c.id DESC
            LIMIT 100
            `,
            [scope.divisionId]
        );

        const [notificationRows] = await db.execute(
            `
            SELECT
                id,
                title,
                message,
                notification_type,
                priority,
                is_read,
                related_route_id,
                related_complaint_id,
                created_at
            FROM notifications
            WHERE recipient_user_id = ?
            ORDER BY id DESC
            LIMIT 100
            `,
            [scope.userId]
        );

        const [changeRequestRows] = await db.execute(
            `
            SELECT
                rcr.id,
                rcr.route_id,
                rcr.request_type,
                rcr.status,
                rcr.requested_at,
                rcr.before_state,
                rcr.after_state,
                rcr.reviewed_by,
                rcr.reviewed_at,
                rcr.review_notes,
                r.route_code,
                r.route_name,
                u.email AS requester_email,
                COALESCE(p.full_name, u.email) AS requester_name
            FROM route_change_requests rcr
            JOIN routes r
                ON r.id = rcr.route_id
            JOIN wards w
                ON w.id = r.ward_id
               AND w.division_id = ?
               AND w.status = 'active'
            JOIN users u
                ON u.id = rcr.requested_by
            LEFT JOIN user_profiles p
                ON p.user_id = u.id
            WHERE rcr.status IN ('pending', 'approved', 'rejected', 'withdrawn')
            ORDER BY rcr.id DESC
            LIMIT 100
            `,
            [scope.divisionId]
        );

        const openComplaints = complaintRows.filter(
            row => !['resolved', 'cancelled'].includes(String(row.status || '').toLowerCase())
        ).length;

        const pendingChangeRequests = changeRequestRows.filter(
            row => String(row.status || '').toLowerCase() === 'pending'
        ).length;

        const uniqueVehicles = new Map();
        for (const row of vehicleRows) {
            uniqueVehicles.set(Number(row.id), row);
        }

        const uniqueDrivers = new Map();
        for (const row of driverRows) {
            uniqueDrivers.set(Number(row.id), row);
        }

        const routes = routeRows.map(row => ({
            id: Number(row.id),
            code: row.route_code,
            name: row.route_name,
            status: row.status,
            ward: {
                id: Number(row.ward_id),
                number: Number(row.ward_number),
                code: row.ward_code,
                name: row.ward_name
            },
            total_stops: Math.max(
                Number(row.total_stops || 0),
                stopCountByRoute.get(Number(row.id)) || 0
            ),
            completed_stops: Number(row.completed_stops || 0),
            delay_minutes: Number(row.delay_minutes || 0),
            vehicle: row.vehicle_id
                ? {
                    id: Number(row.vehicle_id),
                    vehicle_number: row.vehicle_number,
                    registration_number: row.registration_number
                }
                : null,
            driver: row.driver_id
                ? {
                    id: Number(row.driver_id),
                    employee_id: row.driver_employee_id,
                    name: row.driver_name
                }
                : null
        }));

        return res.json({
            success: true,
            generated_at: new Date().toISOString(),
            scope: {
                division_id: scope.divisionId,
                division_code: scope.divisionCode,
                division_name: scope.divisionName
            },
            summary: {
                routes_total: routes.length,
                routes_active: routes.filter(row => ['active', 'starting'].includes(String(row.status))).length,
                routes_delayed: routes.filter(row => String(row.status) === 'delayed').length,
                routes_completed: routes.filter(row => String(row.status) === 'completed').length,
                route_completion_rate: routes.length
                    ? Number((
                        routes.reduce(
                            (total, row) => total + (Number(row.completed_stops || 0)),
                            0
                        ) / Math.max(1, routes.reduce(
                            (total, row) => total + (Number(row.total_stops || 0)),
                            0
                        )) * 100
                    ).toFixed(1))
                    : 0,
                total_delay_minutes: routes.reduce(
                    (total, row) => total + Number(row.delay_minutes || 0),
                    0
                ),
                vehicles_visible: uniqueVehicles.size,
                drivers_visible: uniqueDrivers.size,
                collections_total: collectionRows.length,
                open_complaints: openComplaints,
                pending_change_requests: pendingChangeRequests
            },
            routes,
            vehicles: Array.from(uniqueVehicles.values()).map(row => ({
                id: Number(row.id),
                vehicle_number: row.vehicle_number,
                registration_number: row.registration_number,
                vehicle_type: row.vehicle_type,
                status: row.status,
                route_code: row.route_code,
                driver_name: row.driver_name,
                last_location_at: row.last_location_at
            })),
            drivers: Array.from(uniqueDrivers.values()).map(row => ({
                id: Number(row.id),
                employee_id: row.employee_id,
                full_name: row.full_name,
                mobile_number: row.mobile_number,
                status: row.status,
                ward_name: row.ward_name,
                vehicle_number: row.vehicle_number,
                route_code: row.route_code
            })),
            collections: collectionRows.map(row => ({
                id: Number(row.id),
                collection_date: row.collection_date,
                waste_tons: Number(row.waste_tons || 0),
                status: row.status,
                collected_at: row.collected_at,
                ward_name: row.ward_name,
                route_code: row.route_code
            })),
            complaints: complaintRows.map(row => ({
                id: Number(row.id),
                complaint_code: row.complaint_code,
                complaint_type: row.complaint_type,
                priority: row.priority,
                status: row.status,
                reported_at: row.reported_at,
                ward_name: row.ward_name
            })),
            notifications: notificationRows.map(row => ({
                id: Number(row.id),
                title: row.title,
                message: row.message,
                notification_type: row.notification_type,
                priority: row.priority,
                is_read: Number(row.is_read),
                created_at: row.created_at
            })),
            route_change_requests: changeRequestRows.map(row => ({
                id: Number(row.id),
                route_id: Number(row.route_id),
                request_type: row.request_type,
                status: row.status,
                requested_at: row.requested_at,
                before_state: row.before_state,
                after_state: row.after_state,
                reviewed_by: row.reviewed_by === null ? null : Number(row.reviewed_by),
                reviewed_at: row.reviewed_at,
                review_notes: row.review_notes,
                route_code: row.route_code,
                route_name: row.route_name,
                requester_email: row.requester_email,
                requester_name: row.requester_name
            }))
        });
    } catch (error) {
        return sendError(
            res,
            "Unable to load Assistant Commissioner operational supervision.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * PUT /api/assistant/route-change-requests/:id/review
 * ---------------------------------------------------------
 *
 * Part 7 governance endpoint.
 * The authenticated Assistant Commissioner can approve/reject
 * requests only when the referenced route belongs to the AC's
 * current Division.
 */
async function reviewRouteChangeRequest(req, res) {
    const requestId = positiveInteger(req.params?.id);
    const decision = clean(req.body?.decision);
    const reviewNotes = clean(req.body?.review_notes);

    if (!requestId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route change request ID."
        });
    }

    if (!['approved', 'rejected'].includes(String(decision || '').toLowerCase())) {
        return res.status(400).json({
            success: false,
            message: "Decision must be approved or rejected."
        });
    }

    if (reviewNotes && reviewNotes.length > 1000) {
        return res.status(400).json({
            success: false,
            message: "Review notes cannot exceed 1000 characters."
        });
    }

    let connection;

    try {
        const scope = await getAssistantScope(req);

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [requestRows] = await connection.execute(
            `
            SELECT
                rcr.id,
                rcr.route_id,
                rcr.request_type,
                rcr.status,
                rcr.requested_by,
                rcr.before_state,
                rcr.after_state,
                r.route_code,
                r.route_name,
                r.status AS route_status,
                r.ward_id,
                r.division_id,
                w.division_id AS ward_division_id
            FROM route_change_requests rcr
            JOIN routes r
                ON r.id = rcr.route_id
            JOIN wards w
                ON w.id = r.ward_id
               AND w.division_id = ?
               AND w.status = 'active'
            WHERE rcr.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [scope.divisionId, requestId]
        );

        const request = requestRows[0];

        if (!request) {
            throw createError(
                "Route change request was not found in your Division.",
                404
            );
        }

        if (request.status !== "pending") {
            throw createError(
                `This route change request has already been ${request.status}.`,
                409
            );
        }

        const requestType = String(request.request_type || "").toLowerCase();
        const afterState = parseJsonSnapshot(request.after_state) || {};

        if (decision.toLowerCase() === "approved") {
            if (requestType === "route_cancellation") {
                await cancelRouteAssignmentsForApproval(
                    connection,
                    Number(request.route_id)
                );

                await connection.execute(
                    `
                    UPDATE routes
                    SET
                        status = 'cancelled',
                        approval_status = 'approved',
                        approved_by = ?,
                        approved_at = NOW(),
                        approval_notes = ?
                    WHERE id = ?
                    `,
                    [scope.userId, reviewNotes, Number(request.route_id)]
                );
            } else if (requestType === "route_reassignment") {
                const vehicleId = positiveInteger(
                    afterState.vehicle_id
                );
                const driverId = positiveInteger(
                    afterState.driver_id
                );

                await applyApprovedRouteReassignment(
                    connection,
                    Number(request.route_id),
                    request.route_status,
                    vehicleId,
                    driverId,
                    scope.userId
                );

                await connection.execute(
                    `
                    UPDATE routes
                    SET
                        approval_status = 'approved',
                        approved_by = ?,
                        approved_at = NOW(),
                        approval_notes = ?
                    WHERE id = ?
                    `,
                    [scope.userId, reviewNotes, Number(request.route_id)]
                );
            } else if (requestType === "route_update") {
                const updates = [];
                const values = [];
                const allowedFields = [
                    "route_name",
                    "status",
                    "start_point",
                    "end_point",
                    "estimated_distance_km",
                    "estimated_duration_minutes",
                    "delay_minutes",
                    "scheduled_start_time",
                    "scheduled_end_time"
                ];

                for (const field of allowedFields) {
                    if (!Object.prototype.hasOwnProperty.call(afterState, field)) {
                        continue;
                    }

                    let value = afterState[field];

                    if ([
                        "estimated_distance_km",
                        "estimated_duration_minutes",
                        "delay_minutes"
                    ].includes(field)) {
                        value = Number(value);
                        if (!Number.isFinite(value) || value < 0) {
                            throw createError(
                                `Proposed ${field} is invalid.`,
                                409
                            );
                        }
                        if (
                            field !== "estimated_distance_km" &&
                            !Number.isInteger(value)
                        ) {
                            throw createError(
                                `Proposed ${field} must be an integer.`,
                                409
                            );
                        }
                    } else if ([
                        "route_name",
                        "start_point",
                        "end_point",
                        "scheduled_start_time",
                        "scheduled_end_time"
                    ].includes(field)) {
                        value = clean(value);
                    }

                    if (field === "route_name" && (!value || value.length > 150)) {
                        throw createError(
                            "Proposed route name is invalid.",
                            409
                        );
                    }

                    if (
                        ["start_point", "end_point"].includes(field) &&
                        value &&
                        value.length > 200
                    ) {
                        throw createError(
                            `Proposed ${field} is too long.`,
                            409
                        );
                    }

                    if (field === "status") {
                        const allowedStatus = [
                            "scheduled",
                            "starting",
                            "active",
                            "delayed",
                            "completed",
                            "cancelled"
                        ];

                        if (!allowedStatus.includes(String(value))) {
                            throw createError(
                                "Proposed route status is invalid.",
                                409
                            );
                        }

                        if (String(value) === "completed") {
                            const [stopStats] = await connection.execute(
                                `
                                SELECT
                                    COUNT(*) AS total_stops,
                                    COALESCE(SUM(status = 'collected'), 0) AS completed_stops
                                FROM route_stops
                                WHERE route_id = ?
                                `,
                                [Number(request.route_id)]
                            );

                            const totalStops = Number(stopStats[0]?.total_stops || 0);
                            const completedStops = Number(stopStats[0]?.completed_stops || 0);

                            if (totalStops > 0 && completedStops < totalStops) {
                                throw createError(
                                    "The route cannot be marked completed until all route stops are collected.",
                                    409
                                );
                            }
                        }
                    }

                    updates.push(`${field} = ?`);
                    values.push(value);
                }

                if (!updates.length) {
                    throw createError(
                        "The approved route update contains no supported route fields.",
                        409
                    );
                }

                await connection.execute(
                    `
                    UPDATE routes
                    SET
                        ${updates.join(", ")},
                        approval_status = 'approved',
                        approved_by = ?,
                        approved_at = NOW(),
                        approval_notes = ?
                    WHERE id = ?
                    `,
                    [...values, scope.userId, reviewNotes, Number(request.route_id)]
                );

                if (String(afterState.status || "") === "cancelled") {
                    await cancelRouteAssignmentsForApproval(
                        connection,
                        Number(request.route_id)
                    );
                }
            } else if (requestType === "route_creation") {
                await connection.execute(
                    `
                    UPDATE routes
                    SET
                        approval_status = 'approved',
                        approved_by = ?,
                        approved_at = NOW(),
                        approval_notes = ?
                    WHERE id = ?
                    `,
                    [scope.userId, reviewNotes, Number(request.route_id)]
                );
            } else {
                throw createError(
                    "This route change request type is not supported by Part 7.",
                    409
                );
            }
        } else {
            await connection.execute(
                `
                UPDATE routes
                SET
                    approval_status = 'rejected',
                    approval_notes = ?,
                    approved_by = NULL,
                    approved_at = NULL
                WHERE id = ?
                `,
                [reviewNotes, Number(request.route_id)]
            );
        }

        await connection.execute(
            `
            UPDATE route_change_requests
            SET
                status = ?,
                reviewed_by = ?,
                reviewed_at = NOW(),
                review_notes = ?
            WHERE id = ?
            `,
            [
                decision.toLowerCase(),
                scope.userId,
                reviewNotes,
                requestId
            ]
        );

        await connection.execute(
            `
            INSERT INTO notifications (
                recipient_user_id,
                title,
                message,
                notification_type,
                priority,
                related_route_id
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                Number(request.requested_by),
                decision.toLowerCase() === "approved"
                    ? "Route change approved"
                    : "Route change rejected",
                `Your ${request.request_type.replace(/_/g, " ")} request for route ${request.route_code} was ${decision.toLowerCase()}.${reviewNotes ? ` Review notes: ${reviewNotes}` : ""}`,
                "route_governance",
                decision.toLowerCase() === "approved" ? "high" : "medium",
                Number(request.route_id)
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message:
                decision.toLowerCase() === "approved"
                    ? "Route change request approved successfully."
                    : "Route change request rejected successfully."
        });
    } catch (error) {
        await connection?.rollback();
        return sendError(
            res,
            "Unable to review the route change request.",
            error
        );
    } finally {
        connection?.release();
    }
}

async function getMapData(req, res) {
    try {
        const scope = await getAssistantScope(req);

        const office =
            DIVISION_OFFICE_LOCATIONS[
                String(scope.divisionCode || "").toUpperCase()
            ] || null;

        const operationalArea =
            await getDivisionOperationalArea(
                scope.divisionId,
                db
            );

        const [wardRows] = await db.execute(
            `
            SELECT
                w.id,
                w.ward_number,
                w.ward_code,
                w.ward_name
            FROM wards w
            WHERE w.division_id = ?
              AND w.status = 'active'
            ORDER BY w.ward_number, w.ward_name
            `,
            [scope.divisionId]
        );

        const [routeRows] = await db.execute(
            `
            SELECT
                r.id,
                r.route_code,
                r.route_name,
                r.division_id,
                r.ward_id,
                r.status,
                r.start_point,
                r.end_point,
                r.estimated_distance_km,
                r.estimated_duration_minutes,
                r.total_stops,
                r.completed_stops,
                r.delay_minutes,

                w.ward_number,
                w.ward_code,
                w.ward_name,

                ra.id AS assignment_id,
                ra.status AS assignment_status,

                v.id AS vehicle_id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.status AS vehicle_status,
                v.current_latitude,
                v.current_longitude,
                v.last_location_at,

                d.id AS driver_id,
                d.employee_id AS driver_employee_id,
                d.full_name AS driver_name

            FROM routes r

            JOIN wards w
                ON w.id = r.ward_id

            LEFT JOIN route_assignments ra
                ON ra.id = (
                    SELECT MAX(ra2.id)
                    FROM route_assignments ra2
                    WHERE ra2.route_id = r.id
                      AND ra2.status IN ('assigned', 'active', 'delayed')
                )

            LEFT JOIN vehicles v
                ON v.id = ra.vehicle_id

            LEFT JOIN drivers d
                ON d.id = ra.driver_id

            WHERE r.status <> 'cancelled'
              AND (
                    r.division_id = ?
                    OR (
                        r.division_id IS NULL
                        AND w.division_id = ?
                    )
              )

            ORDER BY r.id DESC
            `,
            [scope.divisionId, scope.divisionId]
        );

        const routeIds =
            routeRows.map(row => Number(row.id));

        let stopRows = [];

        if (routeIds.length) {
            const placeholders =
                routeIds.map(() => "?").join(", ");

            const [rows] = await db.execute(
                `
                SELECT
                    id,
                    route_id,
                    stop_order,
                    stop_name,
                    address,
                    latitude,
                    longitude,
                    status,
                    collected_at
                FROM route_stops
                WHERE route_id IN (${placeholders})
                ORDER BY route_id, stop_order
                `,
                routeIds
            );

            stopRows = rows;
        }

        const stopsByRoute = new Map();

        for (const row of stopRows) {
            const routeId = Number(row.route_id);

            if (!stopsByRoute.has(routeId)) {
                stopsByRoute.set(routeId, []);
            }

            stopsByRoute.get(routeId).push({
                id: Number(row.id),
                order: Number(row.stop_order),
                name: row.stop_name,
                address: row.address,
                latitude:
                    row.latitude === null
                        ? null
                        : Number(row.latitude),
                longitude:
                    row.longitude === null
                        ? null
                        : Number(row.longitude),
                status: row.status,
                collected_at: row.collected_at
            });
        }

        return res.json({
            success: true,

            scope: {
                division_id: scope.divisionId,
                division_code: scope.divisionCode,
                division_name: scope.divisionName,
                office_location: scope.officeLocation,

                office_point: office
                    ? {
                        label: office.label,
                        address: office.address,
                        latitude: office.latitude,
                        longitude: office.longitude
                    }
                    : null,

                planning_boundary:
                    getDivisionPlanningBoundary(
                        scope.divisionId,
                        scope.divisionCode
                    )
            },

            wards: await Promise.all(
                wardRows.map(async row => {
                    const planningBoundary =
                        await getWardPlanningBoundary(
                            Number(row.id),
                            row.ward_code,
                            db
                        );

                    return {
                        id: Number(row.id),
                        number: Number(row.ward_number),
                        code: row.ward_code,
                        name: row.ward_name,
                        boundary:
                            planningBoundary
                                ? {
                                    source: planningBoundary.source,
                                    polygon: planningBoundary.polygon
                                }
                                : null
                    };
                })
            ),

            routes: routeRows.map(row => ({
                id: Number(row.id),
                code: row.route_code,
                name: row.route_name,
                status: row.status,
                ward: {
                    id: Number(row.ward_id),
                    number: Number(row.ward_number),
                    code: row.ward_code,
                    name: row.ward_name
                },
                start_point: row.start_point,
                end_point: row.end_point,
                estimated_distance_km:
                    row.estimated_distance_km === null
                        ? null
                        : Number(row.estimated_distance_km),
                estimated_duration_minutes:
                    row.estimated_duration_minutes === null
                        ? null
                        : Number(row.estimated_duration_minutes),
                total_stops:
                    Number(row.total_stops || 0),
                completed_stops:
                    Number(row.completed_stops || 0),
                delay_minutes:
                    Number(row.delay_minutes || 0),

                assignment: row.assignment_id
                    ? {
                        id: Number(row.assignment_id),
                        status: row.assignment_status || null
                    }
                    : null,

                vehicle:
                    row.vehicle_id &&
                    Number.isFinite(Number(row.current_latitude)) &&
                    Number.isFinite(Number(row.current_longitude))
                        ? {
                            id: Number(row.vehicle_id),
                            vehicle_number: row.vehicle_number,
                            registration_number:
                                row.registration_number,
                            vehicle_type: row.vehicle_type,
                            status: row.vehicle_status,
                            latitude: Number(row.current_latitude),
                            longitude: Number(row.current_longitude),
                            last_location_at:
                                row.last_location_at
                        }
                        : null,

                driver: row.driver_id
                    ? {
                        id: Number(row.driver_id),
                        employee_id: row.driver_employee_id,
                        name: row.driver_name
                    }
                    : null,

                stops:
                    stopsByRoute.get(Number(row.id)) || []
            }))
        });

    } catch (error) {
        return sendError(
            res,
            "Unable to load the divisional operational map.",
            error
        );
    }
}



/*
 * ---------------------------------------------------------
 * GET /api/assistant/reports
 * ---------------------------------------------------------
 *
 * Part 8: Divisional Reports and Analytics.
 *
 * The endpoint derives the Assistant Commissioner's Division
 * from the authenticated session. The browser may provide only
 * the reporting period.
 *
 * The report deliberately distinguishes between:
 *   - period-based activity (collections + complaints), and
 *   - current operational state (routes + stops + deployed fleet
 *     + inspector coverage).
 *
 * No estimated or simulated values are generated.
 */
async function getReportsAnalytics(req, res) {
    function formatDateOnly(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function isDateOnly(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    }

    function parseDateOnly(value) {
        if (!isDateOnly(value)) {
            return null;
        }

        const [year, month, day] = String(value).split("-").map(Number);
        const date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        return date;
    }

    const now = new Date();
    const defaultToDate = formatDateOnly(now);
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    const defaultFromDate = formatDateOnly(defaultFrom);

    const fromDateValue = clean(req.query?.from_date) || defaultFromDate;
    const toDateValue = clean(req.query?.to_date) || defaultToDate;

    const fromDate = parseDateOnly(fromDateValue);
    const toDate = parseDateOnly(toDateValue);

    if (!fromDate || !toDate) {
        return res.status(400).json({
            success: false,
            message: "Reporting dates must use valid YYYY-MM-DD values."
        });
    }

    if (fromDate > toDate) {
        return res.status(400).json({
            success: false,
            message: "The report start date cannot be after the end date."
        });
    }

    const dayCount = Math.floor(
        (toDate.getTime() - fromDate.getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1;

    if (dayCount > 366) {
        return res.status(400).json({
            success: false,
            message: "The reporting period cannot exceed 366 days."
        });
    }

    try {
        const scope = await getAssistantScope(req);

        const [
            [routeRows],
            [stopRows],
            [collectionRows],
            [complaintRows],
            [vehicleRows],
            [inspectorRows],
            [collectionTrendRows],
            [complaintTrendRows],
            [wardRows]
        ] = await Promise.all([
            db.execute(
                `
                SELECT
                    COUNT(*) AS routes_total,
                    SUM(CASE WHEN r.status = 'scheduled' THEN 1 ELSE 0 END) AS routes_scheduled,
                    SUM(CASE WHEN r.status IN ('starting', 'active') THEN 1 ELSE 0 END) AS routes_active,
                    SUM(CASE WHEN r.status = 'delayed' THEN 1 ELSE 0 END) AS routes_delayed,
                    SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS routes_completed,
                    SUM(CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END) AS routes_cancelled,
                    COALESCE(SUM(r.delay_minutes), 0) AS total_delay_minutes
                FROM routes r
                JOIN wards w
                    ON w.id = r.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE
                    r.division_id = ?
                    OR (
                        r.division_id IS NULL
                        AND w.division_id = ?
                    )
                `,
                [scope.divisionId, scope.divisionId, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS stops_total,
                    SUM(CASE WHEN rs.status = 'pending' THEN 1 ELSE 0 END) AS stops_pending,
                    SUM(CASE WHEN rs.status = 'in_progress' THEN 1 ELSE 0 END) AS stops_in_progress,
                    SUM(CASE WHEN rs.status = 'collected' THEN 1 ELSE 0 END) AS stops_collected,
                    SUM(CASE WHEN rs.status = 'skipped' THEN 1 ELSE 0 END) AS stops_skipped
                FROM route_stops rs
                JOIN routes r
                    ON r.id = rs.route_id
                JOIN wards w
                    ON w.id = r.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE
                    r.division_id = ?
                    OR (
                        r.division_id IS NULL
                        AND w.division_id = ?
                    )
                `,
                [scope.divisionId, scope.divisionId, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS collections_total,
                    SUM(CASE WHEN c.status = 'collected' THEN 1 ELSE 0 END) AS collected_records,
                    SUM(CASE WHEN c.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_records,
                    SUM(CASE WHEN c.status = 'skipped' THEN 1 ELSE 0 END) AS skipped_records,
                    COALESCE(SUM(c.waste_tons), 0) AS waste_tons_total,
                    COALESCE(SUM(CASE WHEN c.status = 'collected' THEN c.waste_tons ELSE 0 END), 0) AS waste_tons_collected
                FROM collections c
                JOIN wards w
                    ON w.id = c.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE c.collection_date BETWEEN ? AND ?
                `,
                [scope.divisionId, fromDateValue, toDateValue]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS complaints_total,
                    SUM(CASE WHEN c.status = 'open' THEN 1 ELSE 0 END) AS open_complaints,
                    SUM(CASE WHEN c.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_complaints,
                    SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_complaints,
                    SUM(CASE WHEN c.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_complaints,
                    SUM(CASE WHEN c.priority = 'critical' THEN 1 ELSE 0 END) AS critical_complaints,
                    SUM(CASE WHEN c.priority = 'high' THEN 1 ELSE 0 END) AS high_complaints
                FROM complaints c
                JOIN wards w
                    ON w.id = c.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE
                    c.reported_at >= CONCAT(?, ' 00:00:00')
                    AND c.reported_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
                `,
                [scope.divisionId, fromDateValue, toDateValue]
            ),

            db.execute(
                `
                SELECT
                    COUNT(DISTINCT v.id) AS deployed_vehicles,
                    COALESCE(AVG(v.current_load_percent), 0) AS average_current_load_percent,
                    SUM(CASE WHEN v.status = 'en_route' THEN 1 ELSE 0 END) AS vehicles_en_route,
                    SUM(CASE WHEN v.status = 'collecting' THEN 1 ELSE 0 END) AS vehicles_collecting,
                    SUM(CASE WHEN v.status = 'delayed' THEN 1 ELSE 0 END) AS vehicles_delayed
                FROM route_assignments ra
                JOIN routes r
                    ON r.id = ra.route_id
                JOIN wards w
                    ON w.id = r.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                JOIN vehicles v
                    ON v.id = ra.vehicle_id
                WHERE ra.status IN ('assigned', 'active', 'delayed')
                  AND r.status <> 'cancelled'
                  AND (
                        r.division_id = ?
                        OR r.division_id IS NULL
                  )
                  AND ra.id = (
                        SELECT MAX(ra2.id)
                        FROM route_assignments ra2
                        JOIN routes r2
                            ON r2.id = ra2.route_id
                        JOIN wards w2
                            ON w2.id = r2.ward_id
                           AND w2.division_id = ?
                           AND w2.status = 'active'
                        WHERE ra2.vehicle_id = v.id
                          AND ra2.status IN ('assigned', 'active', 'delayed')
                          AND r2.status <> 'cancelled'
                          AND (
                                r2.division_id = ?
                                OR r2.division_id IS NULL
                          )
                  )
                `,
                [
                    scope.divisionId,
                    scope.divisionId,
                    scope.divisionId,
                    scope.divisionId
                ]
            ),

            db.execute(
                `
                SELECT
                    COUNT(*) AS inspectors_total,
                    SUM(CASE WHEN p.ward_id IS NOT NULL THEN 1 ELSE 0 END) AS inspectors_assigned,
                    SUM(CASE WHEN p.ward_id IS NULL THEN 1 ELSE 0 END) AS inspectors_unassigned,
                    COUNT(DISTINCT CASE
                        WHEN p.ward_id IS NOT NULL
                         AND w.id IS NOT NULL
                        THEN p.ward_id
                        ELSE NULL
                    END) AS covered_wards
                FROM users u
                JOIN user_profiles p
                    ON p.user_id = u.id
                LEFT JOIN wards w
                    ON w.id = p.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE u.role = ?
                  AND u.status = 'active'
                  AND p.division_id = ?
                `,
                [scope.divisionId, INSPECTOR_ROLE, scope.divisionId]
            ),

            db.execute(
                `
                SELECT
                    c.collection_date,
                    COUNT(*) AS collection_records,
                    SUM(CASE WHEN c.status = 'collected' THEN 1 ELSE 0 END) AS collected_records,
                    COALESCE(SUM(c.waste_tons), 0) AS waste_tons
                FROM collections c
                JOIN wards w
                    ON w.id = c.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE c.collection_date BETWEEN ? AND ?
                GROUP BY c.collection_date
                ORDER BY c.collection_date ASC
                `,
                [scope.divisionId, fromDateValue, toDateValue]
            ),

            db.execute(
                `
                SELECT
                    DATE(c.reported_at) AS report_date,
                    COUNT(*) AS complaint_records,
                    SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_complaints
                FROM complaints c
                JOIN wards w
                    ON w.id = c.ward_id
                   AND w.division_id = ?
                   AND w.status = 'active'
                WHERE
                    c.reported_at >= CONCAT(?, ' 00:00:00')
                    AND c.reported_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
                GROUP BY DATE(c.reported_at)
                ORDER BY report_date ASC
                `,
                [scope.divisionId, fromDateValue, toDateValue]
            ),

            db.execute(
                `
                SELECT
                    w.id,
                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    (
                        SELECT COUNT(*)
                        FROM routes r
                        WHERE r.ward_id = w.id
                          AND r.status <> 'cancelled'
                          AND (
                                r.division_id = ?
                                OR r.division_id IS NULL
                          )
                    ) AS routes_total,

                    (
                        SELECT COUNT(*)
                        FROM routes r
                        WHERE r.ward_id = w.id
                          AND r.status = 'completed'
                          AND (
                                r.division_id = ?
                                OR r.division_id IS NULL
                          )
                    ) AS routes_completed,

                    (
                        SELECT COUNT(*)
                        FROM routes r
                        WHERE r.ward_id = w.id
                          AND r.status = 'delayed'
                          AND (
                                r.division_id = ?
                                OR r.division_id IS NULL
                          )
                    ) AS routes_delayed,

                    (
                        SELECT COUNT(*)
                        FROM route_stops rs
                        JOIN routes r
                            ON r.id = rs.route_id
                        WHERE r.ward_id = w.id
                          AND (
                                r.division_id = ?
                                OR r.division_id IS NULL
                          )
                    ) AS stops_total,

                    (
                        SELECT COUNT(*)
                        FROM route_stops rs
                        JOIN routes r
                            ON r.id = rs.route_id
                        WHERE r.ward_id = w.id
                          AND rs.status = 'collected'
                          AND (
                                r.division_id = ?
                                OR r.division_id IS NULL
                          )
                    ) AS stops_collected,

                    (
                        SELECT COUNT(*)
                        FROM collections c
                        WHERE c.ward_id = w.id
                          AND c.collection_date BETWEEN ? AND ?
                    ) AS collection_records,

                    (
                        SELECT COALESCE(SUM(c.waste_tons), 0)
                        FROM collections c
                        WHERE c.ward_id = w.id
                          AND c.collection_date BETWEEN ? AND ?
                    ) AS waste_tons,

                    (
                        SELECT COUNT(*)
                        FROM complaints c
                        WHERE c.ward_id = w.id
                          AND c.reported_at >= CONCAT(?, ' 00:00:00')
                          AND c.reported_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
                    ) AS complaint_records,

                    (
                        SELECT COUNT(*)
                        FROM complaints c
                        WHERE c.ward_id = w.id
                          AND c.status = 'resolved'
                          AND c.reported_at >= CONCAT(?, ' 00:00:00')
                          AND c.reported_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
                    ) AS complaints_resolved,

                    (
                        SELECT COUNT(*)
                        FROM user_profiles p
                        JOIN users u
                            ON u.id = p.user_id
                        WHERE p.ward_id = w.id
                          AND p.division_id = ?
                          AND u.role = ?
                          AND u.status = 'active'
                    ) AS inspectors_assigned

                FROM wards w
                WHERE w.division_id = ?
                  AND w.status = 'active'
                ORDER BY w.ward_number, w.id
                `,
                [
                    scope.divisionId,
                    scope.divisionId,
                    scope.divisionId,
                    scope.divisionId,
                    scope.divisionId,
                    fromDateValue,
                    toDateValue,
                    fromDateValue,
                    toDateValue,
                    fromDateValue,
                    toDateValue,
                    fromDateValue,
                    toDateValue,
                    scope.divisionId,
                    INSPECTOR_ROLE,
                    scope.divisionId
                ]
            )
        ]);

        const routeSummary = routeRows[0] || {};
        const stopSummary = stopRows[0] || {};
        const collectionSummary = collectionRows[0] || {};
        const complaintSummary = complaintRows[0] || {};
        const vehicleSummary = vehicleRows[0] || {};
        const inspectorSummary = inspectorRows[0] || {};

        const routesTotal = Number(routeSummary.routes_total || 0);
        const stopsTotal = Number(stopSummary.stops_total || 0);
        const stopsCollected = Number(stopSummary.stops_collected || 0);
        const collectionsTotal = Number(collectionSummary.collections_total || 0);
        const collectedRecords = Number(collectionSummary.collected_records || 0);
        const complaintsTotal = Number(complaintSummary.complaints_total || 0);
        const resolvedComplaints = Number(complaintSummary.resolved_complaints || 0);
        const inspectorsTotal = Number(inspectorSummary.inspectors_total || 0);
        const inspectorsAssigned = Number(inspectorSummary.inspectors_assigned || 0);
        const coveredWards = Number(inspectorSummary.covered_wards || 0);
        const activeWardCount = wardRows.length;

        const routeCompletionRate = stopsTotal > 0
            ? Number((stopsCollected / stopsTotal * 100).toFixed(1))
            : 0;

        const collectionCompletionRate = collectionsTotal > 0
            ? Number((collectedRecords / collectionsTotal * 100).toFixed(1))
            : 0;

        const complaintResolutionRate = complaintsTotal > 0
            ? Number((resolvedComplaints / complaintsTotal * 100).toFixed(1))
            : 0;

        const inspectorCoverageRate = activeWardCount > 0
            ? Number((coveredWards / activeWardCount * 100).toFixed(1))
            : 0;

        return res.json({
            success: true,
            generated_at: new Date().toISOString(),
            scope: {
                division_id: scope.divisionId,
                division_code: scope.divisionCode,
                division_name: scope.divisionName
            },
            period: {
                from_date: fromDateValue,
                to_date: toDateValue,
                day_count: dayCount
            },
            summary: {
                collections_total: collectionsTotal,
                collected_records: collectedRecords,
                in_progress_records: Number(collectionSummary.in_progress_records || 0),
                skipped_records: Number(collectionSummary.skipped_records || 0),
                waste_tons_total: Number(Number(collectionSummary.waste_tons_total || 0).toFixed(2)),
                waste_tons_collected: Number(Number(collectionSummary.waste_tons_collected || 0).toFixed(2)),
                collection_completion_rate: collectionCompletionRate,

                routes_total: routesTotal,
                routes_scheduled: Number(routeSummary.routes_scheduled || 0),
                routes_active: Number(routeSummary.routes_active || 0),
                routes_delayed: Number(routeSummary.routes_delayed || 0),
                routes_completed: Number(routeSummary.routes_completed || 0),
                routes_cancelled: Number(routeSummary.routes_cancelled || 0),
                total_delay_minutes: Number(routeSummary.total_delay_minutes || 0),

                stops_total: stopsTotal,
                stops_pending: Number(stopSummary.stops_pending || 0),
                stops_in_progress: Number(stopSummary.stops_in_progress || 0),
                stops_collected: stopsCollected,
                stops_skipped: Number(stopSummary.stops_skipped || 0),
                route_completion_rate: routeCompletionRate,

                complaints_total: complaintsTotal,
                open_complaints: Number(complaintSummary.open_complaints || 0),
                in_progress_complaints: Number(complaintSummary.in_progress_complaints || 0),
                resolved_complaints: resolvedComplaints,
                cancelled_complaints: Number(complaintSummary.cancelled_complaints || 0),
                critical_complaints: Number(complaintSummary.critical_complaints || 0),
                high_complaints: Number(complaintSummary.high_complaints || 0),
                complaint_resolution_rate: complaintResolutionRate,

                vehicles_deployed: Number(vehicleSummary.deployed_vehicles || 0),
                average_current_load_percent: Number(Number(vehicleSummary.average_current_load_percent || 0).toFixed(1)),
                vehicles_en_route: Number(vehicleSummary.vehicles_en_route || 0),
                vehicles_collecting: Number(vehicleSummary.vehicles_collecting || 0),
                vehicles_delayed: Number(vehicleSummary.vehicles_delayed || 0),

                inspectors_total: inspectorsTotal,
                inspectors_assigned: inspectorsAssigned,
                inspectors_unassigned: Number(inspectorSummary.inspectors_unassigned || 0),
                active_wards: activeWardCount,
                covered_wards: coveredWards,
                inspector_coverage_rate: inspectorCoverageRate
            },
            collection_trend: collectionTrendRows.map(row => ({
                date: row.collection_date,
                records: Number(row.collection_records || 0),
                collected_records: Number(row.collected_records || 0),
                waste_tons: Number(Number(row.waste_tons || 0).toFixed(2))
            })),
            complaint_trend: complaintTrendRows.map(row => ({
                date: row.report_date,
                records: Number(row.complaint_records || 0),
                resolved: Number(row.resolved_complaints || 0)
            })),
            ward_performance: wardRows.map(row => {
                const wardStopsTotal = Number(row.stops_total || 0);
                const wardStopsCollected = Number(row.stops_collected || 0);
                const wardCollections = Number(row.collection_records || 0);
                const wardComplaints = Number(row.complaint_records || 0);
                const wardComplaintsResolved = Number(row.complaints_resolved || 0);

                return {
                    id: Number(row.id),
                    ward_number: Number(row.ward_number),
                    ward_code: row.ward_code,
                    ward_name: row.ward_name,
                    routes_total: Number(row.routes_total || 0),
                    routes_completed: Number(row.routes_completed || 0),
                    routes_delayed: Number(row.routes_delayed || 0),
                    stops_total: wardStopsTotal,
                    stops_collected: wardStopsCollected,
                    route_completion_rate: wardStopsTotal > 0
                        ? Number((wardStopsCollected / wardStopsTotal * 100).toFixed(1))
                        : 0,
                    collection_records: wardCollections,
                    waste_tons: Number(Number(row.waste_tons || 0).toFixed(2)),
                    complaint_records: wardComplaints,
                    complaints_resolved: wardComplaintsResolved,
                    complaint_resolution_rate: wardComplaints > 0
                        ? Number((wardComplaintsResolved / wardComplaints * 100).toFixed(1))
                        : 0,
                    inspectors_assigned: Number(row.inspectors_assigned || 0)
                };
            })
        });
    } catch (error) {
        return sendError(
            res,
            "Unable to load divisional reports and analytics.",
            error
        );
    }
}


module.exports = {
    getOverview,
    getWards,
    createOperationalWard,
    updateOperationalWardBoundary,
    getInspectors,
    assignInspectorScope,
    getMapData,
    getSupervision,
    reviewRouteChangeRequest,
    saveDivisionOperationalArea,
    getReportsAnalytics
};

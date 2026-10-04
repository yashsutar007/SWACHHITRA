const db = require("../config/db");


const ADMIN_ROLES = [
    "deputy_commissioner",
    "assistant_commissioner",
    "sanitary_inspector"
];


const ACTIVE_ASSIGNMENT_STATUSES = [
    "assigned",
    "active",
    "delayed"
];


const VALID_ROUTE_STATUSES = [
    "scheduled",
    "starting",
    "active",
    "delayed",
    "completed",
    "cancelled"
];


const VALID_COMPLAINT_STATUSES = [
    "open",
    "in_progress",
    "resolved",
    "cancelled"
];

const ROUTE_STATUS_TRANSITIONS = {
    scheduled: ["scheduled", "starting", "cancelled"],
    starting: ["starting", "active", "delayed", "cancelled"],
    active: ["active", "delayed", "completed", "cancelled"],
    delayed: ["delayed", "active", "completed", "cancelled"],
    completed: ["completed"],
    cancelled: ["cancelled"]
};

const ACTIVE_VEHICLE_STATUSES = [
    "en_route",
    "collecting",
    "delayed"
];


/*
 * ---------------------------------------------------------
 * DEVELOPMENT OPERATIONAL GEOFENCE
 * ---------------------------------------------------------
 *
 * Temporary SWACHHITRA development planning boundary for the
 * current Ward 10 operational area around Gandhi Maidan / Shivaji Peth.
 *
 * IMPORTANT:
 * This polygon is NOT claimed to be the official KMC Ward 10 boundary.
 * It is a development geofence used until an authoritative KMC GeoJSON
 * boundary is imported into ward_boundaries.
 *
 * When an official verified boundary exists in ward_boundaries with
 * is_official = 1, that geometry takes precedence over this polygon.
 */
const DEVELOPMENT_OPERATIONAL_BOUNDARIES = {
    "WARD-10": [
        [16.6960000, 74.2190000],
        [16.6970000, 74.2235000],
        [16.6945000, 74.2272000],
        [16.6895000, 74.2270000],
        [16.6868000, 74.2235000],
        [16.6876000, 74.2195000],
        [16.6900000, 74.2180000]
    ]
};


function pointInsidePolygon(point, polygon) {
    if (
        !Array.isArray(point) ||
        point.length < 2 ||
        !Array.isArray(polygon) ||
        polygon.length < 3
    ) {
        return false;
    }

    const lat = Number(point[0]);
    const lng = Number(point[1]);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {
        return false;
    }

    let inside = false;

    for (
        let i = 0,
            j = polygon.length - 1;
        i < polygon.length;
        j = i
    ) {
        const yi = Number(polygon[i][0]);
        const xi = Number(polygon[i][1]);
        const yj = Number(polygon[j][0]);
        const xj = Number(polygon[j][1]);

        if (
            !Number.isFinite(yi) ||
            !Number.isFinite(xi) ||
            !Number.isFinite(yj) ||
            !Number.isFinite(xj)
        ) {
            continue;
        }

        const intersects =
            ((yi > lat) !== (yj > lat)) &&
            (
                lng <
                (
                    ((xj - xi) * (lat - yi)) /
                    (yj - yi)
                ) + xi
            );

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}


function extractPolygonCoordinates(geoJson) {
    if (!geoJson) {
        return [];
    }

    let parsed = geoJson;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (
        !parsed ||
        typeof parsed !== "object"
    ) {
        return [];
    }

    if (parsed.type === "Feature") {
        return extractPolygonCoordinates(
            parsed.geometry
        );
    }

    if (parsed.type === "FeatureCollection") {
        for (const feature of parsed.features || []) {
            const coordinates =
                extractPolygonCoordinates(feature);

            if (coordinates.length >= 3) {
                return coordinates;
            }
        }

        return [];
    }

    if (parsed.type === "Polygon") {
        return (parsed.coordinates?.[0] || [])
            .map(point => [
                Number(point[1]),
                Number(point[0])
            ])
            .filter(point =>
                Number.isFinite(point[0]) &&
                Number.isFinite(point[1])
            );
    }

    if (parsed.type === "MultiPolygon") {
        return (parsed.coordinates?.[0]?.[0] || [])
            .map(point => [
                Number(point[1]),
                Number(point[0])
            ])
            .filter(point =>
                Number.isFinite(point[0]) &&
                Number.isFinite(point[1])
            );
    }

    return [];
}


async function getOperationalBoundaryForWard(
    wardId,
    wardCode,
    connection = db
) {
    const [rows] =
        await connection.execute(
            `
            SELECT
                boundary_geojson
            FROM ward_boundaries
            WHERE ward_id = ?
              AND is_official = 1
            LIMIT 1
            `,
            [wardId]
        );

    const authoritativePolygon =
        extractPolygonCoordinates(
            rows[0]?.boundary_geojson
        );

    if (authoritativePolygon.length >= 3) {
        return {
            source: "official",
            polygon: authoritativePolygon
        };
    }

    const developmentPolygon =
        DEVELOPMENT_OPERATIONAL_BOUNDARIES[
            String(wardCode || "").toUpperCase()
        ];

    if (
        Array.isArray(developmentPolygon) &&
        developmentPolygon.length >= 3
    ) {
        return {
            source: "development",
            polygon: developmentPolygon
        };
    }

    return null;
}


async function validateRouteStopLocation({
    connection,
    wardId,
    latitude,
    longitude
}) {
    const [wardRows] =
        await connection.execute(
            `
            SELECT
                id,
                ward_code,
                ward_number,
                ward_name,
                division_id
            FROM wards
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
            FOR SHARE
            `,
            [wardId]
        );

    if (!wardRows.length) {
        throw createScopeError(
            "The route ward is not available."
        );
    }

    const ward = wardRows[0];

    const boundary =
        await getOperationalBoundaryForWard(
            Number(ward.id),
            ward.ward_code,
            connection
        );

    if (!boundary) {
        const error = new Error(
            `No verified route-planning boundary is available for Ward ${Number(ward.ward_number)}.`
        );
        error.statusCode = 409;
        throw error;
    }

    if (!pointInsidePolygon(
        [latitude, longitude],
        boundary.polygon
    )) {
        throw createScopeError(
            `The collection point must be inside the assigned operational area for Ward ${Number(ward.ward_number)}.`
        );
    }

    return {
        ward,
        source: boundary.source,
        polygon: boundary.polygon
    };
}

function assignmentStatusForRouteStatus(routeStatus) {
    if (routeStatus === "active") {
        return "active";
    }

    if (routeStatus === "delayed") {
        return "delayed";
    }

    return "assigned";
}

function vehicleStatusForRouteStatus(routeStatus) {
    switch (routeStatus) {
        case "active":
            return "collecting";
        case "delayed":
            return "delayed";
        case "starting":
        case "scheduled":
            return "en_route";
        default:
            return "available";
    }
}

function routeStatusAllowsAssignment(routeStatus) {
    return [
        "scheduled",
        "starting",
        "active",
        "delayed"
    ].includes(routeStatus);
}


function sendServerError(res, message, error) {
    console.error(message, error);

    if (error?.statusCode) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message || message
        });
    }

    return res.status(500).json({
        success: false,
        message
    });
}


function createScopeError(message) {
    const error = new Error(message);
    error.statusCode = 403;
    return error;
}


function createConflictError(message) {
    const error = new Error(message);
    error.statusCode = 409;
    return error;
}


function toNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}


function positiveInteger(value) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
        ? number
        : null;
}


function clean(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}


function isoOrNull(value) {
    if (!value) {
        return null;
    }

    const date =
        value instanceof Date
            ? value
            : new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
}


/*
 * ---------------------------------------------------------
 * AUTHENTICATED ADMINISTRATIVE SCOPE
 * ---------------------------------------------------------
 *
 * Deputy Commissioner:
 *     Entire city.
 *
 * Assistant Commissioner:
 *     Assigned zone.
 *
 * Sanitary Inspector:
 *     Assigned ward.
 *
 * A profile is required for zone/ward-scoped roles.
 */
async function getScopeContext(
    req,
    connection = db
) {
    const role = req.currentUser?.role;

    if (!ADMIN_ROLES.includes(role)) {
        throw createScopeError(
            "This account does not have administrative dashboard access."
        );
    }

    if (role === "deputy_commissioner") {
        return {
            role,
            scopeType: "city",
            divisionId: null,
            divisionCode: null,
            divisionName: "Entire City",
            zoneId: null,
            zoneCode: null,
            zoneName: "Entire City",
            wardId: null,
            wardNumber: null,
            wardCode: null,
            wardName: null
        };
    }

    const [rows] = await connection.execute(
        `
        SELECT
            p.zone_id,
            z.zone_code,
            z.zone_name,

            p.division_id,
            d.division_code,
            d.division_name,

            p.ward_id,
            w.ward_number,
            w.ward_code,
            w.ward_name

        FROM user_profiles p

        LEFT JOIN zones z
            ON z.id = p.zone_id
           AND z.status = 'active'

        LEFT JOIN divisions d
            ON d.id = p.division_id
           AND d.status = 'active'

        LEFT JOIN wards w
            ON w.id = p.ward_id
           AND w.division_id = p.division_id
           AND w.status = 'active'

        WHERE p.user_id = ?
        LIMIT 1
        `,
        [req.currentUser.id]
    );

    const profile = rows[0];

    if (!profile) {
        throw createScopeError(
            "An operational scope is not configured for this account. Complete your profile first."
        );
    }

    if (role === "assistant_commissioner") {
        const divisionId = positiveInteger(profile.division_id);

        if (!divisionId) {
            throw createScopeError(
                "Assistant Commissioner division assignment is missing."
            );
        }

        if (
            !profile.division_code ||
            !profile.division_name
        ) {
            throw createScopeError(
                "Assistant Commissioner division assignment is invalid or inactive."
            );
        }

        return {
            role,
            scopeType: "division",

            divisionId,
            divisionCode: profile.division_code,
            divisionName: profile.division_name,

            zoneId: positiveInteger(profile.zone_id),
            zoneCode: profile.zone_code,
            zoneName: profile.zone_name,

            wardId: null,
            wardNumber: null,
            wardCode: null,
            wardName: null
        };
    }

    if (role === "sanitary_inspector") {
        const divisionId = positiveInteger(profile.division_id);
        const wardId = positiveInteger(profile.ward_id);
        const zoneId = positiveInteger(profile.zone_id);

        if (!divisionId || !wardId) {
            throw createScopeError(
                "Sanitary Inspector Division/Ward assignment is missing. An Assistant Commissioner must assign the operational jurisdiction first."
            );
        }

        if (
            !profile.division_code ||
            !profile.division_name ||
            !profile.ward_code ||
            !profile.ward_name
        ) {
            throw createScopeError(
                "Sanitary Inspector Division/Ward assignment is invalid or inactive."
            );
        }

        if (!zoneId || !profile.zone_code || !profile.zone_name) {
            throw createScopeError(
                "The Inspector's compatibility zone mapping is missing or invalid."
            );
        }

        return {
            role,
            scopeType: "ward",

            divisionId,
            divisionCode: profile.division_code,
            divisionName: profile.division_name,

            zoneId,
            zoneCode: profile.zone_code,
            zoneName: profile.zone_name,

            wardId,
            wardNumber:
                profile.ward_number === null
                    ? null
                    : Number(profile.ward_number),
            wardCode: profile.ward_code,
            wardName: profile.ward_name
        };
    }

    throw createScopeError(
        "This account does not have administrative dashboard access."
    );
}


/*
 * Route scope filter.
 *
 * Existing routes may still have division_id = NULL until the migration
 * backfill is performed. For those legacy rows, the route's ward is used to
 * resolve its division without weakening scope enforcement.
 */
function routeScope(
    scope,
    alias = "r"
) {
    if (scope.scopeType === "division") {
        return {
            sql: `
                AND (
                    ${alias}.division_id = ?
                    OR (
                        ${alias}.division_id IS NULL
                        AND EXISTS (
                            SELECT 1
                            FROM wards scoped_w
                            WHERE scoped_w.id = ${alias}.ward_id
                              AND scoped_w.division_id = ?
                        )
                    )
                )
            `,
            params: [
                scope.divisionId,
                scope.divisionId
            ]
        };
    }

    if (scope.scopeType === "ward") {
        return {
            sql: `AND ${alias}.ward_id = ?`,
            params: [scope.wardId]
        };
    }

    return { sql: "", params: [] };
}


/*
 * Ward scope filter.
 */
function wardScope(
    scope,
    alias = "w"
) {
    if (scope.scopeType === "division") {
        return {
            sql: `AND ${alias}.division_id = ?`,
            params: [scope.divisionId]
        };
    }

    if (scope.scopeType === "ward") {
        return {
            sql: `AND ${alias}.id = ?`,
            params: [scope.wardId]
        };
    }

    return { sql: "", params: [] };
}


/*
 * Driver scope.
 *
 * Drivers are operationally associated with wards. An unassigned driver
 * remains visible as an available common resource to an authorized
 * operational Inspector.
 */
function driverScope(
    scope,
    alias = "d"
) {
    if (scope.scopeType === "division") {
        return {
            sql: `
                AND (
                    ${alias}.assigned_ward_id IS NULL
                    OR ${alias}.assigned_ward_id IN (
                        SELECT id
                        FROM wards
                        WHERE division_id = ?
                    )
                )
            `,
            params: [scope.divisionId]
        };
    }

    if (scope.scopeType === "ward") {
        return {
            sql: `
                AND (
                    ${alias}.assigned_ward_id IS NULL
                    OR ${alias}.assigned_ward_id = ?
                )
            `,
            params: [scope.wardId]
        };
    }

    return { sql: "", params: [] };
}


/*
 * Vehicle management scope.
 *
 * A vehicle has no direct ward assignment. Assigned vehicles inherit scope
 * through route_assignments -> routes -> ward/division. Unassigned vehicles
 * remain in the common fleet pool.
 */
function vehicleManagementScope(
    scope,
    {
        routeAlias = "r",
        assignmentAlias = "ra"
    } = {}
) {
    if (scope.scopeType === "division") {
        return {
            sql: `
                AND (
                    ${assignmentAlias}.id IS NULL
                    OR ${routeAlias}.division_id = ?
                    OR (
                        ${routeAlias}.division_id IS NULL
                        AND EXISTS (
                            SELECT 1
                            FROM wards scoped_w
                            WHERE scoped_w.id = ${routeAlias}.ward_id
                              AND scoped_w.division_id = ?
                        )
                    )
                )
            `,
            params: [scope.divisionId, scope.divisionId]
        };
    }

    if (scope.scopeType === "ward") {
        return {
            sql: `
                AND (
                    ${assignmentAlias}.id IS NULL
                    OR ${routeAlias}.ward_id = ?
                )
            `,
            params: [scope.wardId]
        };
    }

    return { sql: "", params: [] };
}


function vehicleScope(
    scope,
    {
        routeAlias = "r",
        assignmentAlias = "ra"
    } = {}
) {
    if (scope.scopeType === "division") {
        return {
            sql: `
                AND (
                    (
                        ${assignmentAlias}.id IS NOT NULL
                        AND (
                            ${routeAlias}.division_id = ?
                            OR (
                                ${routeAlias}.division_id IS NULL
                                AND EXISTS (
                                    SELECT 1
                                    FROM wards scoped_w
                                    WHERE scoped_w.id = ${routeAlias}.ward_id
                                      AND scoped_w.division_id = ?
                                )
                            )
                        )
                    )
                    OR (
                        ${assignmentAlias}.id IS NULL
                        AND v.status = 'available'
                    )
                )
            `,
            params: [scope.divisionId, scope.divisionId]
        };
    }

    if (scope.scopeType === "ward") {
        return {
            sql: `
                AND (
                    (
                        ${assignmentAlias}.id IS NOT NULL
                        AND ${routeAlias}.ward_id = ?
                    )
                    OR (
                        ${assignmentAlias}.id IS NULL
                        AND v.status = 'available'
                    )
                )
            `,
            params: [scope.wardId]
        };
    }

    return { sql: "", params: [] };
}


/*
 * Join the latest active assignment for a source record.
 *
 * No vehicle-to-ward column is used here.
 */
function latestAssignmentJoin(
    sourceAlias,
    sourceColumn,
    assignmentAlias = "ra"
) {
    return `
        LEFT JOIN route_assignments ${assignmentAlias}
            ON ${assignmentAlias}.id = (
                SELECT ra2.id
                FROM route_assignments ra2
                WHERE ra2.${sourceColumn} =
                    ${sourceAlias}.id
                  AND ra2.status IN (
                    '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                  )
                ORDER BY ra2.id DESC
                LIMIT 1
            )
    `;
}


/*
 * ---------------------------------------------------------
 * ROUTE STOPS
 * ---------------------------------------------------------
 */
async function syncRouteStopTotals(
    connection,
    routeId
) {
    const [rows] = await connection.execute(
        `
        SELECT
            COUNT(*) AS total_stops,
            COALESCE(
                SUM(status = 'collected'),
                0
            ) AS completed_stops
        FROM route_stops
        WHERE route_id = ?
        `,
        [routeId]
    );

    const totalStops = Number(rows[0]?.total_stops || 0);
    const completedStops = Number(
        rows[0]?.completed_stops || 0
    );

    await connection.execute(
        `
        UPDATE routes
        SET
            total_stops = ?,
            completed_stops = ?
        WHERE id = ?
        `,
        [totalStops, completedStops, routeId]
    );
}


async function getRouteStops(
    routeId,
    connection = db
) {
    const [rows] =
        await connection.execute(
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
                collected_at,
                created_at,
                updated_at
            FROM route_stops
            WHERE route_id = ?
            ORDER BY stop_order
            `,
            [routeId]
        );


    return rows.map(row => ({
        id: Number(row.id),

        routeId:
            Number(row.route_id),

        order:
            Number(row.stop_order),

        name:
            row.stop_name,

        address:
            row.address,

        latitude:
            toNumber(row.latitude),

        longitude:
            toNumber(row.longitude),

        status:
            row.status,

        collectedAt:
            isoOrNull(row.collected_at),

        createdAt:
            isoOrNull(row.created_at),

        updatedAt:
            isoOrNull(row.updated_at)
    }));
}


/*
 * ---------------------------------------------------------
 * ROUTE RECORD
 * ---------------------------------------------------------
 */
async function getRouteRecord(
    routeId,
    scope,
    connection = db
) {
    const scopeFilter =
        routeScope(scope, "r");


    const [rows] =
        await connection.execute(
            `
            SELECT
                r.id,
                r.route_code,
                r.route_name,
                r.zone_id,
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
                r.scheduled_start_time,
                r.scheduled_end_time,
                r.created_by,
                r.created_at,
                r.updated_at,

                z.zone_code,
                z.zone_name,

                w.ward_number,
                w.ward_code,
                w.ward_name,
                wb.boundary_geojson,

                ra.id AS assignment_id,
                ra.assignment_code,
                ra.status AS assignment_status,

                v.id AS vehicle_id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.make,
                v.image_path,

                d.id AS driver_id,
                d.employee_id AS driver_employee_id,
                d.full_name AS driver_name

            FROM routes r

            JOIN zones z
                ON z.id = r.zone_id

            JOIN wards w
                ON w.id = r.ward_id
               AND w.zone_id = r.zone_id

            LEFT JOIN ward_boundaries wb
                ON wb.ward_id = w.id
               AND wb.is_official = 1

            ${latestAssignmentJoin(
                "r",
                "route_id",
                "ra"
            )}

            LEFT JOIN vehicles v
                ON v.id = ra.vehicle_id

            LEFT JOIN drivers d
                ON d.id = ra.driver_id

            WHERE r.id = ?
              ${scopeFilter.sql}

            LIMIT 1
            `,
            [
                routeId,
                ...scopeFilter.params
            ]
        );


    if (!rows.length) {
        return null;
    }


    const row =
        rows[0];


    const stops =
        await getRouteStops(
            Number(row.id),
            connection
        );


    return toRouteDto(
        row,
        stops
    );
}


function toRouteDto(
    row,
    stops = []
) {
    return {
        databaseId:
            Number(row.id),

        id:
            row.route_code,

        routeName:
            row.route_name,

        division:
            row.division_id === null ||
            row.division_id === undefined
                ? null
                : {
                    id: Number(row.division_id)
                },

        status:
            row.status,


        zone: {
            id:
                Number(row.zone_id),

            code:
                row.zone_code,

            name:
                row.zone_name
        },


        ward: {
            id:
                Number(row.ward_id),

            number:
                Number(row.ward_number),

            code:
                row.ward_code,

            name:
                row.ward_name
        },


        planningArea:
            (() => {
                const officialPolygon =
                    extractPolygonCoordinates(
                        row.boundary_geojson
                    );

                if (officialPolygon.length >= 3) {
                    return {
                        source: "official",
                        polygon: officialPolygon
                    };
                }

                const developmentPolygon =
                    DEVELOPMENT_OPERATIONAL_BOUNDARIES[
                        String(
                            row.ward_code ||
                            ""
                        ).toUpperCase()
                    ];

                return developmentPolygon
                    ? {
                        source: "development",
                        polygon: developmentPolygon
                    }
                    : null;
            })(),


        startPoint:
            row.start_point,

        endPoint:
            row.end_point,


        estimatedDistanceKm:
            toNumber(
                row.estimated_distance_km
            ),

        estimatedDurationMinutes:
            row.estimated_duration_minutes === null
                ? null
                : Number(
                    row.estimated_duration_minutes
                ),


        totalStops:
            Number(
                row.total_stops || 0
            ),

        completedStops:
            Number(
                row.completed_stops || 0
            ),

        delayMinutes:
            Number(
                row.delay_minutes || 0
            ),


        scheduledStartAt:
            isoOrNull(
                row.scheduled_start_time
            ),

        scheduledEndAt:
            isoOrNull(
                row.scheduled_end_time
            ),


        assignment:
            row.assignment_id === null
                ? null
                : {
                    id:
                        Number(
                            row.assignment_id
                        ),

                    code:
                        row.assignment_code,

                    status:
                        row.assignment_status
                },


        vehicle:
            row.vehicle_id === null
                ? null
                : {
                    id:
                        Number(
                            row.vehicle_id
                        ),

                    number:
                        row.vehicle_number,

                    registrationNumber:
                        row.registration_number,

                    type:
                        row.vehicle_type,

                    make:
                        row.make,

                    imagePath:
                        row.image_path
                },


        driver:
            row.driver_id === null
                ? null
                : {
                    id:
                        Number(
                            row.driver_id
                        ),

                    employeeId:
                        row.driver_employee_id,

                    name:
                        row.driver_name
                },


        createdBy:
            row.created_by === null
                ? null
                : Number(
                    row.created_by
                ),

        createdAt:
            isoOrNull(
                row.created_at
            ),

        updatedAt:
            isoOrNull(
                row.updated_at
            ),

        stops
    };
}


/*
 * ---------------------------------------------------------
 * OVERVIEW
 * ---------------------------------------------------------
 */
async function getOverview(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const routeFilter =
            routeScope(
                scope,
                "r"
            );


        const vehicleFilter =
            vehicleScope(
                scope,
                {
                    routeAlias: "r",
                    assignmentAlias: "ra"
                }
            );


        const complaintFilter =
            wardScope(
                scope,
                "w"
            );


        const collectionFilter =
            wardScope(
                scope,
                "w"
            );


        const [
            [routeRows],
            [vehicleRows],
            [complaintRows],
            [collectionRows]
        ] = await Promise.all([

            db.execute(
                `
                SELECT
                    COUNT(*) AS total_routes,

                    COALESCE(
                        SUM(
                            r.status IN (
                                'active',
                                'starting',
                                'delayed'
                            )
                        ),
                        0
                    ) AS active_routes,

                    COALESCE(
                        SUM(
                            r.status = 'scheduled'
                        ),
                        0
                    ) AS scheduled_routes,

                    COALESCE(
                        SUM(
                            r.status = 'delayed'
                        ),
                        0
                    ) AS delayed_routes,

                    COALESCE(
                        SUM(
                            r.status = 'starting'
                        ),
                        0
                    ) AS starting_routes

                FROM routes r

                WHERE r.status <> 'cancelled'

                ${routeFilter.sql}
                `,
                routeFilter.params
            ),


            db.execute(
                `
                SELECT
                    COUNT(v.id) AS total_vehicles,

                    COALESCE(
                        SUM(
                            v.status IN (
                                'en_route',
                                'collecting',
                                'delayed'
                            )
                        ),
                        0
                    ) AS deployed_vehicles,

                    COALESCE(
                        SUM(
                            v.status = 'maintenance'
                        ),
                        0
                    ) AS maintenance_vehicles

                FROM vehicles v

                ${latestAssignmentJoin(
                    "v",
                    "vehicle_id",
                    "ra"
                )}

                LEFT JOIN routes r
                    ON r.id = ra.route_id

                WHERE v.status <> 'inactive'

                ${vehicleFilter.sql}
                `,
                vehicleFilter.params
            ),


            db.execute(
                `
                SELECT
                    COUNT(c.id) AS total_complaints,

                    COALESCE(
                        SUM(
                            c.status IN (
                                'open',
                                'in_progress'
                            )
                        ),
                        0
                    ) AS open_complaints,

                    COALESCE(
                        SUM(
                            c.priority IN (
                                'critical',
                                'high'
                            )
                            AND c.status IN (
                                'open',
                                'in_progress'
                            )
                        ),
                        0
                    ) AS high_priority_complaints,

                    COALESCE(
                        SUM(
                            c.status = 'resolved'
                        ),
                        0
                    ) AS resolved_complaints

                FROM complaints c

                LEFT JOIN wards w
                    ON w.id = c.ward_id

                WHERE 1 = 1

                ${complaintFilter.sql}
                `,
                complaintFilter.params
            ),


            db.execute(
                `
                SELECT
                    COUNT(c.id) AS collection_records,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN
                                    c.collection_date =
                                    CURDATE()
                                THEN c.waste_tons
                                ELSE 0
                            END
                        ),
                        0
                    ) AS today_waste_tons,

                    COALESCE(
                        SUM(
                            c.status = 'collected'
                        ),
                        0
                    ) AS completed_collections,

                    COALESCE(
                        SUM(
                            c.status = 'in_progress'
                        ),
                        0
                    ) AS active_collections

                FROM collections c

                JOIN wards w
                    ON w.id = c.ward_id

                WHERE 1 = 1

                ${collectionFilter.sql}
                `,
                collectionFilter.params
            )
        ]);


        const routeStats =
            routeRows[0] || {};

        const vehicleStats =
            vehicleRows[0] || {};

        const complaintStats =
            complaintRows[0] || {};

        const collectionStats =
            collectionRows[0] || {};


        return res.json({
            success: true,

            scope: {
                type:
                    scope.scopeType,

                role:
                    scope.role,

                zoneId:
                    scope.zoneId,

                zoneCode:
                    scope.zoneCode,

                zoneName:
                    scope.zoneName,

                wardId:
                    scope.wardId,

                wardNumber:
                    scope.wardNumber,

                wardCode:
                    scope.wardCode,

                wardName:
                    scope.wardName,

                divisionId:
                    scope.divisionId,

                divisionCode:
                    scope.divisionCode,

                divisionName:
                    scope.divisionName
            },


            overview: {
                totalRoutes:
                    Number(
                        routeStats.total_routes || 0
                    ),

                activeRoutes:
                    Number(
                        routeStats.active_routes || 0
                    ),

                scheduledRoutes:
                    Number(
                        routeStats.scheduled_routes || 0
                    ),

                delayedRoutes:
                    Number(
                        routeStats.delayed_routes || 0
                    ),

                startingRoutes:
                    Number(
                        routeStats.starting_routes || 0
                    ),


                totalVehicles:
                    Number(
                        vehicleStats.total_vehicles || 0
                    ),

                deployedVehicles:
                    Number(
                        vehicleStats.deployed_vehicles || 0
                    ),

                maintenanceVehicles:
                    Number(
                        vehicleStats.maintenance_vehicles || 0
                    ),


                totalComplaints:
                    Number(
                        complaintStats.total_complaints || 0
                    ),

                openComplaints:
                    Number(
                        complaintStats.open_complaints || 0
                    ),

                highPriorityComplaints:
                    Number(
                        complaintStats.high_priority_complaints || 0
                    ),

                resolvedComplaints:
                    Number(
                        complaintStats.resolved_complaints || 0
                    ),


                collectionRecords:
                    Number(
                        collectionStats.collection_records || 0
                    ),

                completedCollections:
                    Number(
                        collectionStats.completed_collections || 0
                    ),

                activeCollections:
                    Number(
                        collectionStats.active_collections || 0
                    ),

                todayWasteTons:
                    toNumber(
                        collectionStats.today_waste_tons
                    ) || 0
            }
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load inspector overview.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * ROUTES
 * ---------------------------------------------------------
 */
async function getRoutes(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);

        const scopeFilter =
            routeScope(
                scope,
                "r"
            );


        const [rows] =
            await db.execute(
                `
                SELECT
                    r.id,
                    r.route_code,
                    r.route_name,
                    r.zone_id,
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
                    r.scheduled_start_time,
                    r.scheduled_end_time,
                    r.created_by,
                    r.created_at,
                    r.updated_at,

                    z.zone_code,
                    z.zone_name,

                    w.ward_number,
                    w.ward_code,
                    w.ward_name,
                    wb.boundary_geojson,

                    ra.id AS assignment_id,
                    ra.assignment_code,
                    ra.status AS assignment_status,

                    v.id AS vehicle_id,
                    v.vehicle_number,
                    v.registration_number,
                    v.vehicle_type,
                    v.make,
                    v.image_path,

                    d.id AS driver_id,
                    d.employee_id AS driver_employee_id,
                    d.full_name AS driver_name

                FROM routes r

                JOIN zones z
                    ON z.id = r.zone_id

                JOIN wards w
                    ON w.id = r.ward_id
                   AND w.zone_id = r.zone_id

                LEFT JOIN ward_boundaries wb
                    ON wb.ward_id = w.id
                   AND wb.is_official = 1

                ${latestAssignmentJoin(
                    "r",
                    "route_id",
                    "ra"
                )}

                LEFT JOIN vehicles v
                    ON v.id = ra.vehicle_id

                LEFT JOIN drivers d
                    ON d.id = ra.driver_id

                WHERE r.status <> 'cancelled'

                ${scopeFilter.sql}

                ORDER BY r.id DESC
                `,
                scopeFilter.params
            );


        const routeIds =
            rows.map(row =>
                Number(row.id)
            );


        let stopRows = [];


        if (routeIds.length) {
            const placeholders =
                routeIds
                    .map(() => "?")
                    .join(", ");


            const [stops] =
                await db.execute(
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
                        collected_at,
                        created_at,
                        updated_at
                    FROM route_stops
                    WHERE route_id IN (
                        ${placeholders}
                    )
                    ORDER BY
                        route_id,
                        stop_order
                    `,
                    routeIds
                );


            stopRows =
                stops;
        }


        const stopsByRoute =
            new Map();


        for (const stop of stopRows) {
            const routeId =
                Number(stop.route_id);


            if (
                !stopsByRoute.has(
                    routeId
                )
            ) {
                stopsByRoute.set(
                    routeId,
                    []
                );
            }


            stopsByRoute
                .get(routeId)
                .push({
                    id:
                        Number(stop.id),

                    routeId,

                    order:
                        Number(
                            stop.stop_order
                        ),

                    name:
                        stop.stop_name,

                    address:
                        stop.address,

                    latitude:
                        toNumber(
                            stop.latitude
                        ),

                    longitude:
                        toNumber(
                            stop.longitude
                        ),

                    status:
                        stop.status,

                    collectedAt:
                        isoOrNull(
                            stop.collected_at
                        ),

                    createdAt:
                        isoOrNull(
                            stop.created_at
                        ),

                    updatedAt:
                        isoOrNull(
                            stop.updated_at
                        )
                });
        }


        return res.json({
            success: true,

            routes:
                rows.map(row =>
                    toRouteDto(
                        row,
                        stopsByRoute.get(
                            Number(row.id)
                        ) || []
                    )
                )
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load routes.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * CREATE ROUTE
 * ---------------------------------------------------------
 */
async function createRoute(
    req,
    res
) {
    const routeCode = clean(req.body?.route_code);
    const routeName = clean(req.body?.route_name);
    const requestedZoneId = positiveInteger(req.body?.zone_id);
    const requestedWardId = positiveInteger(req.body?.ward_id);

    const vehicleId =
        req.body?.vehicle_id === undefined ||
        req.body?.vehicle_id === null ||
        req.body?.vehicle_id === ""
            ? null
            : positiveInteger(req.body.vehicle_id);

    const driverId =
        req.body?.driver_id === undefined ||
        req.body?.driver_id === null ||
        req.body?.driver_id === ""
            ? null
            : positiveInteger(req.body.driver_id);

    const legacyTotalStops =
        req.body?.total_stops === undefined ||
        req.body?.total_stops === null ||
        req.body?.total_stops === ""
            ? 0
            : Number(req.body.total_stops);

    if (
        !routeCode ||
        routeCode.length > 30 ||
        !routeName ||
        routeName.length > 150
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Valid route code, route name, zone and ward are required."
        });
    }

    if (
        !Number.isInteger(legacyTotalStops) ||
        legacyTotalStops < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Total stops must be a non-negative integer."
        });
    }

    if (legacyTotalStops > 0) {
        return res.status(400).json({
            success: false,
            message:
                "Create the route first, then add its actual route stops. Stop totals are calculated automatically."
        });
    }

    if (
        (vehicleId && !driverId) ||
        (!vehicleId && driverId)
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Vehicle and driver must be selected together."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);

        if (scope.scopeType !== "ward") {
            throw createScopeError(
                "Only a Sanitary Inspector with an assigned ward can create operational routes."
            );
        }

        // The Inspector's authenticated scope is authoritative.
        // Client-supplied zone/ward values are accepted only as a legacy
        // compatibility check and can never change the effective route scope.
        if (
            requestedZoneId !== null &&
            requestedZoneId !== scope.zoneId
        ) {
            throw createScopeError(
                "Route zone is outside the Inspector's assigned ward."
            );
        }

        if (
            requestedWardId !== null &&
            requestedWardId !== scope.wardId
        ) {
            throw createScopeError(
                "Route ward is outside the Inspector's assigned ward."
            );
        }

        const zoneId = scope.zoneId;
        const wardId = scope.wardId;
        const divisionId = scope.divisionId;

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [wardRows] = await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id
            FROM wards w
            JOIN zones z
                ON z.id = w.zone_id
            JOIN divisions d
                ON d.id = w.division_id
            WHERE w.id = ?
              AND w.zone_id = ?
              AND w.division_id = ?
              AND w.status = 'active'
              AND z.status = 'active'
              AND d.status = 'active'
            LIMIT 1
            FOR UPDATE
            `,
            [wardId, zoneId, divisionId]
        );

        if (!wardRows.length) {
            throw createScopeError(
                "Selected ward does not belong to the selected zone."
            );
        }

        const [routeResult] = await connection.execute(
            `
            INSERT INTO routes
            (
                route_code,
                route_name,
                zone_id,
                division_id,
                ward_id,
                status,
                total_stops,
                completed_stops,
                delay_minutes,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, 'scheduled', 0, 0, 0, ?)
            `,
            [
                routeCode,
                routeName,
                zoneId,
                divisionId,
                wardId,
                req.currentUser.id
            ]
        );

        const routeId = Number(routeResult.insertId);

        if (vehicleId || driverId) {
            await applyRouteAssignmentChange({
                req,
                connection,
                routeId,
                routeStatus: "scheduled",
                vehicleId,
                driverId,
                allowUnassign: false
            });
        }

        await connection.commit();

        const route = await getRouteRecord(
            routeId,
            scope
        );

        return res.status(201).json({
            success: true,
            message: "Route created successfully.",
            route
        });

    } catch (error) {
        await connection?.rollback();

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Route code already exists."
            });
        }

        return sendServerError(
            res,
            "Unable to create route.",
            error
        );
    } finally {
        connection?.release();
    }
}


/*
 * ---------------------------------------------------------
 * UPDATE ROUTE
 * ---------------------------------------------------------
 */
async function updateRoute(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);

    if (!routeId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route ID."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [routeRows] = await connection.execute(
            `
            SELECT
                r.id,
                r.route_code,
                r.route_name,
                r.zone_id,
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
                r.scheduled_start_time,
                r.scheduled_end_time
            FROM routes r
            WHERE r.id = ?
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, ...scopeFilter.params]
        );

        const existing = routeRows[0];

        if (!existing) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Route not found in the current scope."
            });
        }

        if (existing.status === "cancelled") {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Cancelled routes cannot be modified."
            });
        }

        const requestedStatus =
            req.body?.status === undefined
                ? existing.status
                : clean(req.body.status);

        if (!VALID_ROUTE_STATUSES.includes(requestedStatus)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid route status."
            });
        }

        const allowedStatuses =
            ROUTE_STATUS_TRANSITIONS[existing.status] || [];

        if (!allowedStatuses.includes(requestedStatus)) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    `Invalid route status transition from ${existing.status} to ${requestedStatus}.`
            });
        }

        if (scope.scopeType !== "ward") {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message:
                    "Only a Sanitary Inspector can modify operational routes."
            });
        }

        const requestedZoneId =
            req.body?.zone_id === undefined
                ? null
                : positiveInteger(req.body.zone_id);

        const requestedWardId =
            req.body?.ward_id === undefined
                ? null
                : positiveInteger(req.body.ward_id);

        if (
            req.body?.zone_id !== undefined &&
            !requestedZoneId
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "zone_id must be a positive integer when supplied."
            });
        }

        if (
            req.body?.ward_id !== undefined &&
            !requestedWardId
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "ward_id must be a positive integer when supplied."
            });
        }

        if (
            requestedZoneId !== null &&
            requestedZoneId !== scope.zoneId
        ) {
            throw createScopeError(
                "Route zone is outside the Inspector's assigned ward."
            );
        }

        if (
            requestedWardId !== null &&
            requestedWardId !== scope.wardId
        ) {
            throw createScopeError(
                "Route ward is outside the Inspector's assigned ward."
            );
        }

        const nextZoneId = scope.zoneId;
        const nextWardId = scope.wardId;
        const nextDivisionId = scope.divisionId;

        if (
            nextZoneId !== Number(existing.zone_id) ||
            nextWardId !== Number(existing.ward_id)
        ) {
            const [wardRows] = await connection.execute(
                `
                SELECT id
                FROM wards
                JOIN divisions d
                    ON d.id = wards.division_id
                WHERE wards.id = ?
                  AND wards.zone_id = ?
                  AND wards.division_id = ?
                  AND wards.status = 'active'
                  AND d.status = 'active'
                LIMIT 1
                FOR UPDATE
                `,
                [nextWardId, nextZoneId, nextDivisionId]
            );

            if (!wardRows.length) {
                throw createScopeError(
                    "Selected ward does not belong to the selected zone."
                );
            }
        }

        const [assignmentRows] = await connection.execute(
            `
            SELECT
                id,
                assignment_code,
                vehicle_id,
                driver_id,
                status
            FROM route_assignments
            WHERE route_id = ?
              AND status IN (
                '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
              )
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
            `,
            [routeId]
        );

        const currentAssignment = assignmentRows[0] || null;
        const currentVehicleId = currentAssignment
            ? Number(currentAssignment.vehicle_id)
            : null;
        const currentDriverId = currentAssignment
            ? Number(currentAssignment.driver_id)
            : null;

        const hasVehicleField =
            Object.prototype.hasOwnProperty.call(
                req.body || {},
                "vehicle_id"
            );

        const hasDriverField =
            Object.prototype.hasOwnProperty.call(
                req.body || {},
                "driver_id"
            );

        if (hasVehicleField !== hasDriverField) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Vehicle and driver must be supplied together when changing route assignment."
            });
        }

        let desiredVehicleId = currentVehicleId;
        let desiredDriverId = currentDriverId;
        let assignmentChangeRequested = false;

        if (hasVehicleField && hasDriverField) {
            desiredVehicleId =
                req.body.vehicle_id === null ||
                req.body.vehicle_id === ""
                    ? null
                    : positiveInteger(req.body.vehicle_id);

            desiredDriverId =
                req.body.driver_id === null ||
                req.body.driver_id === ""
                    ? null
                    : positiveInteger(req.body.driver_id);

            if (
                (desiredVehicleId && !desiredDriverId) ||
                (!desiredVehicleId && desiredDriverId)
            ) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message:
                        "Vehicle and driver must be selected together."
                });
            }

            assignmentChangeRequested =
                desiredVehicleId !== currentVehicleId ||
                desiredDriverId !== currentDriverId;
        }

        if (
            (nextZoneId !== Number(existing.zone_id) ||
                nextWardId !== Number(existing.ward_id)) &&
            (currentAssignment || assignmentChangeRequested)
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Change the route area only after the current crew assignment has been removed."
            });
        }

        if (
            ["starting", "active", "delayed"].includes(requestedStatus) &&
            !desiredVehicleId
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Starting, active, and delayed routes require an assigned vehicle and driver."
            });
        }

        if (requestedStatus === "completed") {
            const [stopStats] = await connection.execute(
                `
                SELECT
                    COUNT(*) AS total_stops,
                    COALESCE(
                        SUM(status = 'collected'),
                        0
                    ) AS completed_stops
                FROM route_stops
                WHERE route_id = ?
                `,
                [routeId]
            );

            const totalStops = Number(stopStats[0]?.total_stops || 0);
            const completedStops = Number(
                stopStats[0]?.completed_stops || 0
            );

            if (totalStops > 0 && completedStops < totalStops) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message:
                        `Route cannot be completed until all ${totalStops} route stops are collected.`
                });
            }
        }

        const updates = [];
        const values = [];

        if (req.body?.route_name !== undefined) {
            const routeName = clean(req.body.route_name);

            if (!routeName || routeName.length > 150) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message:
                        "Route name must be between 1 and 150 characters."
                });
            }

            updates.push("route_name = ?");
            values.push(routeName);
        }

        if (
            Number(existing.zone_id) !== Number(nextZoneId) ||
            Number(existing.ward_id) !== Number(nextWardId) ||
            Number(existing.division_id || 0) !== Number(nextDivisionId)
        ) {
            updates.push("zone_id = ?");
            updates.push("division_id = ?");
            updates.push("ward_id = ?");
            values.push(nextZoneId, nextDivisionId, nextWardId);
        }

        if (requestedStatus !== existing.status) {
            updates.push("status = ?");
            values.push(requestedStatus);
        }

        for (const field of [
            "estimated_distance_km",
            "estimated_duration_minutes",
            "delay_minutes"
        ]) {
            if (req.body?.[field] === undefined) {
                continue;
            }

            const number = Number(req.body[field]);

            if (!Number.isFinite(number) || number < 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be a non-negative number.`
                });
            }

            if (
                field !== "estimated_distance_km" &&
                !Number.isInteger(number)
            ) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be an integer.`
                });
            }

            updates.push(`${field} = ?`);
            values.push(number);
        }

        for (const field of [
            "start_point",
            "end_point",
            "scheduled_start_time",
            "scheduled_end_time"
        ]) {
            if (req.body?.[field] === undefined) {
                continue;
            }

            const value = clean(req.body[field]);

            if (
                ["start_point", "end_point"].includes(field) &&
                value &&
                value.length > 200
            ) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be at most 200 characters.`
                });
            }

            updates.push(`${field} = ?`);
            values.push(value);
        }

        if (updates.length) {
            await connection.execute(
                `
                UPDATE routes
                SET ${updates.join(", ")}
                WHERE id = ?
                `,
                [...values, routeId]
            );
        }

        if (
            assignmentChangeRequested ||
            (currentAssignment &&
                ["scheduled", "starting", "active", "delayed", "completed", "cancelled"].includes(
                    requestedStatus
                ))
        ) {
            await applyRouteAssignmentChange({
                req,
                connection,
                routeId,
                routeStatus: requestedStatus,
                vehicleId: desiredVehicleId,
                driverId: desiredDriverId,
                currentAssignment,
                allowUnassign: true
            });
        }

        if (!updates.length && !assignmentChangeRequested && !currentAssignment) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "No supported route changes were supplied."
            });
        }

        await connection.commit();

        const route = await getRouteRecord(routeId, scope);

        return res.json({
            success: true,
            message: "Route updated successfully.",
            route
        });

    } catch (error) {
        await connection?.rollback();

        return sendServerError(
            res,
            "Unable to update route.",
            error
        );
    } finally {
        connection?.release();
    }
}


/*
 * ---------------------------------------------------------
 * CANCEL ROUTE
 * ---------------------------------------------------------
 *
 * DELETE is implemented as a safe operational cancellation,
 * not a hard delete, so the route history remains in MySQL.
 */
async function deleteRoute(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);

    if (!routeId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route ID."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [routeRows] = await connection.execute(
            `
            SELECT id, status
            FROM routes r
            WHERE r.id = ?
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, ...scopeFilter.params]
        );

        if (!routeRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Route not found in the current scope."
            });
        }

        if (routeRows[0].status === "completed") {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Completed routes cannot be cancelled."
            });
        }

        const [assignmentRows] = await connection.execute(
            `
            SELECT
                id,
                vehicle_id,
                driver_id
            FROM route_assignments
            WHERE route_id = ?
              AND status IN (
                '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
              )
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
              AND status IN (
                '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
              )
            `,
            [routeId]
        );

        await connection.execute(
            `
            UPDATE routes
            SET status = 'cancelled'
            WHERE id = ?
            `,
            [routeId]
        );

        for (const assignment of assignmentRows) {
            await releaseVehicleIfUnused(
                connection,
                Number(assignment.vehicle_id)
            );

            await releaseDriverIfUnused(
                connection,
                Number(assignment.driver_id)
            );
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "Route cancelled successfully."
        });

    } catch (error) {
        await connection?.rollback();

        return sendServerError(
            res,
            "Unable to cancel route.",
            error
        );
    } finally {
        connection?.release();
    }
}


async function getRouteStopsForInspector(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);

    if (!routeId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route ID."
        });
    }

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        const [routeRows] = await db.execute(
            `
            SELECT r.id
            FROM routes r
            WHERE r.id = ?
              AND r.status <> 'cancelled'
              ${scopeFilter.sql}
            LIMIT 1
            `,
            [routeId, ...scopeFilter.params]
        );

        if (!routeRows.length) {
            return res.status(404).json({
                success: false,
                message: "Route not found in the current scope."
            });
        }

        const stops = await getRouteStops(
            routeId,
            db
        );

        return res.json({
            success: true,
            stops
        });
    } catch (error) {
        return sendServerError(
            res,
            "Unable to load route stops.",
            error
        );
    }
}

async function createRouteStop(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);
    const stopName = clean(req.body?.stop_name);
    const address = clean(req.body?.address);
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    let stopOrder =
        req.body?.stop_order === undefined ||
        req.body?.stop_order === ""
            ? null
            : positiveInteger(req.body.stop_order);

    if (!routeId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route ID."
        });
    }

    if (!stopName || stopName.length > 150) {
        return res.status(400).json({
            success: false,
            message: "Stop name is required and must be at most 150 characters."
        });
    }

    if (address && address.length > 255) {
        return res.status(400).json({
            success: false,
            message: "Stop address cannot exceed 255 characters."
        });
    }

    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        return res.status(400).json({
            success: false,
            message: "Latitude must be between -90 and 90 and longitude between -180 and 180."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [routeRows] = await connection.execute(
            `
            SELECT
                r.id,
                r.status,
                r.ward_id
            FROM routes r
            WHERE r.id = ?
              AND r.status NOT IN ('completed', 'cancelled')
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, ...scopeFilter.params]
        );

        if (!routeRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Route not found or is no longer editable."
            });
        }

        await validateRouteStopLocation({
            connection,
            wardId: Number(routeRows[0].ward_id),
            latitude,
            longitude
        });

        if (!stopOrder) {
            const [orderRows] = await connection.execute(
                `
                SELECT COALESCE(MAX(stop_order), 0) + 1 AS next_order
                FROM route_stops
                WHERE route_id = ?
                FOR UPDATE
                `,
                [routeId]
            );
            stopOrder = Number(orderRows[0]?.next_order || 1);
        }

        const [duplicateOrder] = await connection.execute(
            `
            SELECT id
            FROM route_stops
            WHERE route_id = ?
              AND stop_order = ?
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, stopOrder]
        );

        if (duplicateOrder.length) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "That stop order is already used by this route."
            });
        }

        const [result] = await connection.execute(
            `
            INSERT INTO route_stops
            (
                route_id,
                stop_order,
                stop_name,
                address,
                latitude,
                longitude,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `,
            [
                routeId,
                stopOrder,
                stopName,
                address,
                latitude,
                longitude
            ]
        );

        await syncRouteStopTotals(
            connection,
            routeId
        );

        await connection.commit();

        const [stopRows] = await db.execute(
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
                collected_at,
                created_at,
                updated_at
            FROM route_stops
            WHERE id = ?
            LIMIT 1
            `,
            [Number(result.insertId)]
        );

        return res.status(201).json({
            success: true,
            message: "Route stop added successfully.",
            stop:
                stopRows[0]
                    ? {
                        id: Number(stopRows[0].id),
                        routeId: Number(stopRows[0].route_id),
                        order: Number(stopRows[0].stop_order),
                        name: stopRows[0].stop_name,
                        address: stopRows[0].address,
                        latitude: toNumber(stopRows[0].latitude),
                        longitude: toNumber(stopRows[0].longitude),
                        status: stopRows[0].status,
                        collectedAt: isoOrNull(stopRows[0].collected_at),
                        createdAt: isoOrNull(stopRows[0].created_at),
                        updatedAt: isoOrNull(stopRows[0].updated_at)
                    }
                    : null
        });

    } catch (error) {
        await connection?.rollback();
        return sendServerError(
            res,
            "Unable to add route stop.",
            error
        );
    } finally {
        connection?.release();
    }
}

async function updateRouteStop(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);
    const stopId = positiveInteger(req.params.stopId);

    if (!routeId || !stopId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route or stop ID."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `
            SELECT
                r.id AS route_id,
                r.status AS route_status,
                r.ward_id,
                s.id,
                s.stop_order,
                s.stop_name,
                s.address,
                s.latitude,
                s.longitude
            FROM routes r
            JOIN route_stops s
                ON s.route_id = r.id
            WHERE r.id = ?
              AND s.id = ?
              AND r.status NOT IN ('completed', 'cancelled')
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, stopId, ...scopeFilter.params]
        );

        const existing = rows[0];

        if (!existing) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Route stop not found in the current scope."
            });
        }

        const stopName =
            req.body?.stop_name === undefined
                ? existing.stop_name
                : clean(req.body.stop_name);

        const address =
            req.body?.address === undefined
                ? existing.address
                : clean(req.body.address);

        const latitude =
            req.body?.latitude === undefined
                ? Number(existing.latitude)
                : Number(req.body.latitude);

        const longitude =
            req.body?.longitude === undefined
                ? Number(existing.longitude)
                : Number(req.body.longitude);

        const stopOrder =
            req.body?.stop_order === undefined
                ? Number(existing.stop_order)
                : positiveInteger(req.body.stop_order);

        if (!stopName || stopName.length > 150) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Stop name is required and must be at most 150 characters."
            });
        }

        if (address && address.length > 255) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Stop address cannot exceed 255 characters."
            });
        }

        if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Latitude must be between -90 and 90 and longitude between -180 and 180."
            });
        }

        await validateRouteStopLocation({
            connection,
            wardId: Number(existing.ward_id),
            latitude,
            longitude
        });

        if (!stopOrder) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Stop order must be a positive integer."
            });
        }

        const [duplicateOrder] = await connection.execute(
            `
            SELECT id
            FROM route_stops
            WHERE route_id = ?
              AND stop_order = ?
              AND id <> ?
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, stopOrder, stopId]
        );

        if (duplicateOrder.length) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "That stop order is already used by this route."
            });
        }

        await connection.execute(
            `
            UPDATE route_stops
            SET
                stop_order = ?,
                stop_name = ?,
                address = ?,
                latitude = ?,
                longitude = ?
            WHERE id = ?
              AND route_id = ?
            `,
            [
                stopOrder,
                stopName,
                address,
                latitude,
                longitude,
                stopId,
                routeId
            ]
        );

        await syncRouteStopTotals(
            connection,
            routeId
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Route stop updated successfully."
        });

    } catch (error) {
        await connection?.rollback();
        return sendServerError(
            res,
            "Unable to update route stop.",
            error
        );
    } finally {
        connection?.release();
    }
}

async function deleteRouteStop(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);
    const stopId = positiveInteger(req.params.stopId);

    if (!routeId || !stopId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route or stop ID."
        });
    }

    let connection;

    try {
        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `
            SELECT
                r.id,
                r.status
            FROM routes r
            JOIN route_stops s
                ON s.route_id = r.id
            WHERE r.id = ?
              AND s.id = ?
              AND r.status NOT IN ('completed', 'cancelled')
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, stopId, ...scopeFilter.params]
        );

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Route stop not found in the current scope."
            });
        }

        await connection.execute(
            `
            DELETE FROM route_stops
            WHERE id = ?
              AND route_id = ?
            `,
            [stopId, routeId]
        );

        // Re-number the remaining stops safely around the UNIQUE(route_id, stop_order) key.
        await connection.execute(
            `
            UPDATE route_stops
            SET stop_order = stop_order + 1000000
            WHERE route_id = ?
            `,
            [routeId]
        );

        const [remaining] = await connection.execute(
            `
            SELECT id
            FROM route_stops
            WHERE route_id = ?
            ORDER BY stop_order
            FOR UPDATE
            `,
            [routeId]
        );

        for (let index = 0; index < remaining.length; index += 1) {
            await connection.execute(
                `
                UPDATE route_stops
                SET stop_order = ?
                WHERE id = ?
                `,
                [index + 1, Number(remaining[index].id)]
            );
        }

        await syncRouteStopTotals(
            connection,
            routeId
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Route stop deleted successfully."
        });

    } catch (error) {
        await connection?.rollback();
        return sendServerError(
            res,
            "Unable to delete route stop.",
            error
        );
    } finally {
        connection?.release();
    }
}


/*
 * ---------------------------------------------------------
 * VEHICLES
 * ---------------------------------------------------------
 */
async function getVehicles(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const scopeFilter =
            vehicleScope(
                scope,
                {
                    routeAlias: "r",
                    assignmentAlias: "ra"
                }
            );


        const [rows] =
            await db.execute(
                `
                SELECT
                    v.id,
                    v.vehicle_number,
                    v.registration_number,
                    v.vehicle_type,
                    v.make,
                    v.capacity_tons,
                    v.current_load_tons,
                    v.current_load_percent,
                    v.eta_minutes,
                    v.status,
                    v.current_latitude,
                    v.current_longitude,
                    v.last_location_at,
                    v.image_path,

                    r.id AS route_id,
                    r.route_code,
                    r.route_name,
                    r.zone_id AS route_zone_id,
                    r.ward_id AS route_ward_id,

                    z.zone_code AS route_zone_code,
                    z.zone_name AS route_zone_name,

                    w.ward_number AS route_ward_number,
                    w.ward_code AS route_ward_code,
                    w.ward_name AS route_ward_name,

                    d.id AS driver_id,
                    d.employee_id AS driver_employee_id,
                    d.full_name AS driver_name

                FROM vehicles v

                ${latestAssignmentJoin(
                    "v",
                    "vehicle_id",
                    "ra"
                )}

                LEFT JOIN routes r
                    ON r.id = ra.route_id

                LEFT JOIN zones z
                    ON z.id = r.zone_id

                LEFT JOIN wards w
                    ON w.id = r.ward_id

                LEFT JOIN drivers d
                    ON d.id = ra.driver_id

                WHERE v.status <> 'inactive'

                ${scopeFilter.sql}

                ORDER BY
                    CASE
                        WHEN v.status = 'collecting'
                            THEN 1
                        WHEN v.status = 'en_route'
                            THEN 2
                        WHEN v.status = 'delayed'
                            THEN 3
                        WHEN v.status = 'maintenance'
                            THEN 4
                        ELSE 5
                    END,
                    v.id
                `,
                scopeFilter.params
            );


        return res.json({
            success: true,

            vehicles:
                rows.map(row => ({
                    databaseId:
                        Number(row.id),

                    vehicleNumber:
                        row.vehicle_number,

                    registrationNumber:
                        row.registration_number,

                    type:
                        row.vehicle_type,

                    make:
                        row.make,

                    imagePath:
                        row.image_path,

                    capacityTons:
                        toNumber(
                            row.capacity_tons
                        ),

                    currentLoadTons:
                        toNumber(
                            row.current_load_tons
                        ),

                    currentLoadPercent:
                        Number(
                            row.current_load_percent || 0
                        ),

                    etaMinutes:
                        row.eta_minutes === null
                            ? null
                            : Number(
                                row.eta_minutes
                            ),

                    status:
                        row.status,


                    location:
                        row.current_latitude === null ||
                        row.current_longitude === null
                            ? null
                            : {
                                latitude:
                                    toNumber(
                                        row.current_latitude
                                    ),

                                longitude:
                                    toNumber(
                                        row.current_longitude
                                    ),

                                recordedAt:
                                    isoOrNull(
                                        row.last_location_at
                                    )
                            },


                    assignment:
                        row.route_id === null
                            ? null
                            : {
                                routeId:
                                    Number(
                                        row.route_id
                                    ),

                                routeCode:
                                    row.route_code,

                                routeName:
                                    row.route_name,


                                zone:
                                    row.route_zone_id === null
                                        ? null
                                        : {
                                            id:
                                                Number(
                                                    row.route_zone_id
                                                ),

                                            code:
                                                row.route_zone_code,

                                            name:
                                                row.route_zone_name
                                        },


                                ward:
                                    row.route_ward_id === null
                                        ? null
                                        : {
                                            id:
                                                Number(
                                                    row.route_ward_id
                                                ),

                                            number:
                                                row.route_ward_number === null
                                                    ? null
                                                    : Number(
                                                        row.route_ward_number
                                                    ),

                                            code:
                                                row.route_ward_code,

                                            name:
                                                row.route_ward_name
                                        },


                                driver:
                                    row.driver_id === null
                                        ? null
                                        : {
                                            id:
                                                Number(
                                                    row.driver_id
                                                ),

                                            employeeId:
                                                row.driver_employee_id,

                                            name:
                                                row.driver_name
                                        }
                            }
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load vehicles.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * DRIVERS
 * ---------------------------------------------------------
 */
async function getDrivers(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const driverFilter =
            driverScope(
                scope,
                "d"
            );


        const [rows] =
            await db.execute(
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
                    d.status,

                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    z.id AS zone_id,
                    z.zone_code,
                    z.zone_name

                FROM drivers d

                LEFT JOIN wards w
                    ON w.id = d.assigned_ward_id

                LEFT JOIN zones z
                    ON z.id = w.zone_id

                WHERE d.status <> 'inactive'

                ${driverFilter.sql}

                ORDER BY
                    CASE
                        WHEN d.status = 'available'
                            THEN 1
                        WHEN d.status = 'assigned'
                            THEN 2
                        WHEN d.status = 'on_break'
                            THEN 3
                        ELSE 4
                    END,
                    d.id
                `,
                driverFilter.params
            );


        return res.json({
            success: true,

            drivers:
                rows.map(row => ({
                    databaseId:
                        Number(row.id),

                    userId:
                        row.user_id === null
                            ? null
                            : Number(
                                row.user_id
                            ),

                    employeeId:
                        row.employee_id,

                    fullName:
                        row.full_name,

                    mobileNumber:
                        row.mobile_number,

                    email:
                        row.email,

                    licenseNumber:
                        row.license_number,

                    licenseType:
                        row.license_type,

                    status:
                        row.status,


                    zone:
                        row.zone_id === null
                            ? null
                            : {
                                id:
                                    Number(
                                        row.zone_id
                                    ),

                                code:
                                    row.zone_code,

                                name:
                                    row.zone_name
                            },


                    ward:
                        row.assigned_ward_id === null
                            ? null
                            : {
                                id:
                                    Number(
                                        row.assigned_ward_id
                                    ),

                                number:
                                    row.ward_number === null
                                        ? null
                                        : Number(
                                            row.ward_number
                                        ),

                                code:
                                    row.ward_code,

                                name:
                                    row.ward_name
                            }
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load drivers.",
            error
        );
    }
}



/*
 * ---------------------------------------------------------
 * VEHICLE MANAGEMENT
 * ---------------------------------------------------------
 *
 * Vehicles are fleet-level resources. They do NOT have a direct
 * ward assignment. Operational scope comes from the active route
 * assignment -> route -> zone/ward relationship.
 *
 * New vehicles start as AVAILABLE. Master-data editing covers
 * vehicle identity/specification and safe fleet status changes.
 * Actual GPS/load updates belong to operational tracking.
 */
function validateVehicleStatus(status) {
    const allowed = [
        "available",
        "en_route",
        "collecting",
        "delayed",
        "maintenance",
        "inactive"
    ];

    return allowed.includes(status)
        ? status
        : null;
}


function validEmailOrNull(value) {
    const email = clean(value);

    if (!email) {
        return null;
    }

    if (
        email.length > 190 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return false;
    }

    return email;
}


async function getVehicleForManagement(
    req,
    vehicleId,
    connection = db
) {
    const scope =
        await getScopeContext(req, connection);

    const scopeFilter =
        vehicleManagementScope(
            scope,
            {
                routeAlias: "r",
                assignmentAlias: "ra"
            }
        );

    const [rows] =
        await connection.execute(
            `
            SELECT
                v.id,
                v.vehicle_number,
                v.registration_number,
                v.vehicle_type,
                v.make,
                v.capacity_tons,
                v.current_load_tons,
                v.current_load_percent,
                v.eta_minutes,
                v.status,
                v.current_latitude,
                v.current_longitude,
                v.last_location_at,
                v.image_path,

                r.id AS route_id,
                r.route_code,
                r.route_name,
                r.zone_id AS route_zone_id,
                r.ward_id AS route_ward_id

            FROM vehicles v

            ${latestAssignmentJoin(
                "v",
                "vehicle_id",
                "ra"
            )}

            LEFT JOIN routes r
                ON r.id = ra.route_id

            WHERE v.id = ?
              AND v.status <> 'inactive'
              ${scopeFilter.sql}

            LIMIT 1
            `,
            [
                vehicleId,
                ...scopeFilter.params
            ]
        );

    return rows[0] || null;
}


async function createVehicle(
    req,
    res
) {
    const vehicleNumber =
        clean(
            req.body?.vehicle_number
        );

    const registrationNumber =
        clean(
            req.body?.registration_number
        );

    const vehicleType =
        clean(
            req.body?.vehicle_type
        );

    const make =
        clean(
            req.body?.make
        );

    const capacityTons =
        Number(
            req.body?.capacity_tons
        );

    const imagePath =
        clean(
            req.body?.image_path
        );

    if (
        !vehicleNumber ||
        vehicleNumber.length > 50 ||
        (registrationNumber && registrationNumber.length > 50) ||
        !vehicleType ||
        vehicleType.length > 60 ||
        (make && make.length > 80) ||
        !Number.isFinite(capacityTons) ||
        capacityTons <= 0 ||
        (imagePath && imagePath.length > 255)
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Vehicle number, type and a positive capacity are required."
        });
    }

    try {
        await getScopeContext(req);

        const [result] =
            await db.execute(
                `
                INSERT INTO vehicles
                (
                    vehicle_number,
                    registration_number,
                    vehicle_type,
                    make,
                    capacity_tons,
                    current_load_tons,
                    current_load_percent,
                    status,
                    image_path
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    0,
                    0,
                    'available',
                    ?
                )
                `,
                [
                    vehicleNumber,
                    registrationNumber,
                    vehicleType,
                    make,
                    capacityTons,
                    imagePath
                ]
            );

        const vehicle =
            await getVehicleForManagement(
                req,
                Number(result.insertId)
            );

        return res.status(201).json({
            success: true,
            message:
                "Vehicle added successfully.",
            vehicle: vehicle || {
                databaseId:
                    Number(result.insertId),
                vehicleNumber,
                registrationNumber,
                type: vehicleType,
                make,
                capacityTons,
                status: "available",
                imagePath
            }
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message:
                    "Vehicle number or registration number already exists."
            });
        }

        return sendServerError(
            res,
            "Unable to add vehicle.",
            error
        );
    }
}


async function updateVehicle(
    req,
    res
) {
    const vehicleId =
        positiveInteger(
            req.params.id
        );

    if (!vehicleId) {
        return res.status(400).json({
            success: false,
            message: "Invalid vehicle ID."
        });
    }

    try {
        const scope =
            await getScopeContext(req);

        const scopeFilter =
            vehicleManagementScope(
                scope,
                {
                    routeAlias: "r",
                    assignmentAlias: "ra"
                }
            );

        const [rows] =
            await db.execute(
                `
                SELECT
                    v.id,
                    v.vehicle_number,
                    v.registration_number,
                    v.vehicle_type,
                    v.make,
                    v.capacity_tons,
                    v.status,
                    v.image_path,
                    ra.id AS assignment_id,
                    ra.status AS assignment_status

                FROM vehicles v

                ${latestAssignmentJoin(
                    "v",
                    "vehicle_id",
                    "ra"
                )}

                LEFT JOIN routes r
                    ON r.id = ra.route_id

                WHERE v.id = ?
                  AND v.status <> 'inactive'
                  ${scopeFilter.sql}

                LIMIT 1
                `,
                [
                    vehicleId,
                    ...scopeFilter.params
                ]
            );

        const existing =
            rows[0];

        if (!existing) {
            return res.status(404).json({
                success: false,
                message:
                    "Vehicle not found in the current operational scope."
            });
        }

        const updates = [];
        const values = [];

        if (req.body?.vehicle_number !== undefined) {
            const value = clean(req.body.vehicle_number);

            if (!value || value.length > 50) {
                return res.status(400).json({
                    success: false,
                    message: "Vehicle number must be between 1 and 50 characters."
                });
            }

            updates.push("vehicle_number = ?");
            values.push(value);
        }

        if (req.body?.registration_number !== undefined) {
            const value = clean(req.body.registration_number);

            if (value && value.length > 50) {
                return res.status(400).json({
                    success: false,
                    message: "Registration number cannot exceed 50 characters."
                });
            }

            updates.push("registration_number = ?");
            values.push(value);
        }

        if (req.body?.vehicle_type !== undefined) {
            const value = clean(req.body.vehicle_type);

            if (!value || value.length > 60) {
                return res.status(400).json({
                    success: false,
                    message: "Vehicle type must be between 1 and 60 characters."
                });
            }

            updates.push("vehicle_type = ?");
            values.push(value);
        }

        if (req.body?.make !== undefined) {
            const value = clean(req.body.make);

            if (value && value.length > 80) {
                return res.status(400).json({
                    success: false,
                    message: "Vehicle make cannot exceed 80 characters."
                });
            }

            updates.push("make = ?");
            values.push(value);
        }

        if (req.body?.capacity_tons !== undefined) {
            const value = Number(req.body.capacity_tons);

            if (!Number.isFinite(value) || value <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Vehicle capacity must be greater than zero."
                });
            }

            updates.push("capacity_tons = ?");
            values.push(value);
        }

        if (req.body?.image_path !== undefined) {
            const value = clean(req.body.image_path);

            if (value && value.length > 255) {
                return res.status(400).json({
                    success: false,
                    message: "Vehicle image path/URL cannot exceed 255 characters."
                });
            }

            updates.push("image_path = ?");
            values.push(value);
        }

        if (req.body?.status !== undefined) {
            const status =
                validateVehicleStatus(
                    clean(req.body.status)
                );

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid vehicle status."
                });
            }

            if (
                existing.assignment_id &&
                ["available", "maintenance", "inactive"].includes(status)
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "This vehicle has an active route assignment. Cancel or reassign the route before making it available, entering maintenance, or deactivating it."
                });
            }

            updates.push("status = ?");
            values.push(status);
        }

        if (!updates.length) {
            return res.status(400).json({
                success: false,
                message: "No vehicle changes were supplied."
            });
        }

        values.push(vehicleId);

        await db.execute(
            `
            UPDATE vehicles
            SET ${updates.join(", ")}
            WHERE id = ?
            `,
            values
        );

        const vehicle =
            await getVehicleForManagement(
                req,
                vehicleId
            );

        return res.json({
            success: true,
            message:
                "Vehicle updated successfully.",
            vehicle
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message:
                    "Vehicle number or registration number already exists."
            });
        }

        return sendServerError(
            res,
            "Unable to update vehicle.",
            error
        );
    }
}


async function deleteVehicle(
    req,
    res
) {
    const vehicleId =
        positiveInteger(
            req.params.id
        );

    if (!vehicleId) {
        return res.status(400).json({
            success: false,
            message: "Invalid vehicle ID."
        });
    }

    try {
        const scope =
            await getScopeContext(req);

        const scopeFilter =
            vehicleManagementScope(
                scope,
                {
                    routeAlias: "r",
                    assignmentAlias: "ra"
                }
            );

        const [rows] =
            await db.execute(
                `
                SELECT
                    v.id,
                    v.status,
                    ra.id AS assignment_id
                FROM vehicles v
                ${latestAssignmentJoin(
                    "v",
                    "vehicle_id",
                    "ra"
                )}
                LEFT JOIN routes r
                    ON r.id = ra.route_id
                WHERE v.id = ?
                  AND v.status <> 'inactive'
                  ${scopeFilter.sql}
                LIMIT 1
                `,
                [
                    vehicleId,
                    ...scopeFilter.params
                ]
            );

        const vehicle = rows[0];

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message:
                    "Vehicle not found in the current operational scope."
            });
        }

        if (vehicle.assignment_id) {
            return res.status(409).json({
                success: false,
                message:
                    "Cannot deactivate a vehicle with an active route assignment. Cancel or reassign the route first."
            });
        }

        await db.execute(
            `
            UPDATE vehicles
            SET status = 'inactive'
            WHERE id = ?
            `,
            [vehicleId]
        );

        return res.json({
            success: true,
            message:
                "Vehicle deactivated successfully."
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to deactivate vehicle.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * DRIVER MANAGEMENT
 * ---------------------------------------------------------
 *
 * Drivers are assigned to wards. The Inspector may create or
 * edit drivers only inside the Inspector's authenticated ward.
 * For wider administrative roles, the selected ward must remain
 * inside their zone (or city for the Deputy Commissioner).
 *
 * Driver route assignment status is controlled by route assignment
 * operations. Manual management uses available/on_break/inactive.
 */
const MANUAL_DRIVER_STATUSES = [
    "available",
    "on_break",
    "inactive"
];


async function validateDriverWard(
    req,
    wardId,
    connection = db
) {
    const scope =
        await getScopeContext(req, connection);

    const [rows] =
        await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                z.zone_code,
                z.zone_name,
                d.division_code,
                d.division_name,
                w.ward_code,
                w.ward_name
            FROM wards w
            JOIN zones z
                ON z.id = w.zone_id
            JOIN divisions d
                ON d.id = w.division_id
            WHERE w.id = ?
              AND w.status = 'active'
              AND z.status = 'active'
              AND d.status = 'active'
            LIMIT 1
            `,
            [wardId]
        );

    const ward = rows[0];

    if (!ward) {
        throw createScopeError(
            "Selected ward does not exist or is inactive."
        );
    }

    if (
        scope.scopeType === "division" &&
        Number(ward.division_id) !== Number(scope.divisionId)
    ) {
        throw createScopeError(
            "Selected ward is outside the assigned division."
        );
    }

    if (
        scope.scopeType === "ward" &&
        Number(ward.id) !== Number(scope.wardId)
    ) {
        throw createScopeError(
            "Selected ward is outside the assigned ward."
        );
    }

    return ward;
}


async function getDriverForManagement(
    req,
    driverId,
    connection = db
) {
    const scope =
        await getScopeContext(req, connection);

    const driverFilter =
        driverScope(
            scope,
            "d"
        );

    const [rows] =
        await connection.execute(
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
                d.status,

                w.ward_number,
                w.ward_code,
                w.ward_name,

                z.id AS zone_id,
                z.zone_code,
                z.zone_name

            FROM drivers d

            LEFT JOIN wards w
                ON w.id = d.assigned_ward_id

            LEFT JOIN zones z
                ON z.id = w.zone_id

            WHERE d.id = ?
              AND d.status <> 'inactive'
              ${driverFilter.sql}

            LIMIT 1
            `,
            [
                driverId,
                ...driverFilter.params
            ]
        );

    const row = rows[0];

    if (!row) {
        return null;
    }

    return {
        databaseId: Number(row.id),
        userId:
            row.user_id === null
                ? null
                : Number(row.user_id),
        employeeId: row.employee_id,
        fullName: row.full_name,
        mobileNumber: row.mobile_number,
        email: row.email,
        licenseNumber: row.license_number,
        licenseType: row.license_type,
        status: row.status,
        zone:
            row.zone_id === null
                ? null
                : {
                    id: Number(row.zone_id),
                    code: row.zone_code,
                    name: row.zone_name
                },
        ward:
            row.assigned_ward_id === null
                ? null
                : {
                    id: Number(row.assigned_ward_id),
                    number:
                        row.ward_number === null
                            ? null
                            : Number(row.ward_number),
                    code: row.ward_code,
                    name: row.ward_name
                }
    };
}


async function createDriver(
    req,
    res
) {
    const employeeId =
        clean(
            req.body?.employee_id
        );

    const fullName =
        clean(
            req.body?.full_name
        );

    const mobileNumber =
        clean(
            req.body?.mobile_number
        );

    const email =
        validEmailOrNull(
            req.body?.email
        );

    const licenseNumber =
        clean(
            req.body?.license_number
        );

    const licenseType =
        clean(
            req.body?.license_type
        );

    const wardId =
        positiveInteger(
            req.body?.assigned_ward_id
        );

    if (
        !employeeId ||
        employeeId.length > 60 ||
        !fullName ||
        fullName.length > 120 ||
        !mobileNumber ||
        mobileNumber.length > 20 ||
        email === false ||
        !licenseNumber ||
        licenseNumber.length > 80 ||
        (licenseType && licenseType.length > 50) ||
        !wardId
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Employee ID, name, mobile, license number and assigned ward are required."
        });
    }

    try {
        const ward =
            await validateDriverWard(
                req,
                wardId
            );

        const [result] =
            await db.execute(
                `
                INSERT INTO drivers
                (
                    employee_id,
                    full_name,
                    mobile_number,
                    email,
                    license_number,
                    license_type,
                    assigned_ward_id,
                    status
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'available'
                )
                `,
                [
                    employeeId,
                    fullName,
                    mobileNumber,
                    email,
                    licenseNumber,
                    licenseType,
                    ward.id
                ]
            );

        const driver =
            await getDriverForManagement(
                req,
                Number(result.insertId)
            );

        return res.status(201).json({
            success: true,
            message:
                "Driver added successfully.",
            driver: driver || {
                databaseId: Number(result.insertId),
                employeeId,
                fullName,
                mobileNumber,
                email,
                licenseNumber,
                licenseType,
                status: "available",
                zone: {
                    id: Number(ward.zone_id),
                    code: ward.zone_code,
                    name: ward.zone_name
                },
                ward: {
                    id: Number(ward.id),
                    number: Number(ward.ward_number),
                    code: ward.ward_code,
                    name: ward.ward_name
                }
            }
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message:
                    "Employee ID already exists."
            });
        }

        return sendServerError(
            res,
            "Unable to add driver.",
            error
        );
    }
}


async function updateDriver(
    req,
    res
) {
    const driverId =
        positiveInteger(
            req.params.id
        );

    if (!driverId) {
        return res.status(400).json({
            success: false,
            message: "Invalid driver ID."
        });
    }

    try {
        const scope =
            await getScopeContext(req);

        const driverFilter =
            driverScope(
                scope,
                "d"
            );

        const [rows] =
            await db.execute(
                `
                SELECT
                    d.id,
                    d.employee_id,
                    d.full_name,
                    d.mobile_number,
                    d.email,
                    d.license_number,
                    d.license_type,
                    d.assigned_ward_id,
                    d.status,
                    ra.id AS assignment_id

                FROM drivers d

                LEFT JOIN route_assignments ra
                    ON ra.driver_id = d.id
                   AND ra.status IN (
                        'assigned',
                        'active',
                        'delayed'
                   )

                WHERE d.id = ?
                  AND d.status <> 'inactive'
                  ${driverFilter.sql}

                ORDER BY ra.id DESC
                LIMIT 1
                `,
                [
                    driverId,
                    ...driverFilter.params
                ]
            );

        const existing = rows[0];

        if (!existing) {
            return res.status(404).json({
                success: false,
                message:
                    "Driver not found in the current operational scope."
            });
        }

        const updates = [];
        const values = [];

        if (req.body?.employee_id !== undefined) {
            const value = clean(req.body.employee_id);

            if (!value || value.length > 60) {
                return res.status(400).json({
                    success: false,
                    message: "Employee ID must be between 1 and 60 characters."
                });
            }

            updates.push("employee_id = ?");
            values.push(value);
        }

        if (req.body?.full_name !== undefined) {
            const value = clean(req.body.full_name);

            if (!value || value.length > 120) {
                return res.status(400).json({
                    success: false,
                    message: "Driver name must be between 1 and 120 characters."
                });
            }

            updates.push("full_name = ?");
            values.push(value);
        }

        if (req.body?.mobile_number !== undefined) {
            const value = clean(req.body.mobile_number);

            if (!value || value.length > 20) {
                return res.status(400).json({
                    success: false,
                    message: "Mobile number must be between 1 and 20 characters."
                });
            }

            updates.push("mobile_number = ?");
            values.push(value);
        }

        if (req.body?.email !== undefined) {
            const value = validEmailOrNull(req.body.email);

            if (value === false) {
                return res.status(400).json({
                    success: false,
                    message: "Enter a valid email address."
                });
            }

            updates.push("email = ?");
            values.push(value);
        }

        if (req.body?.license_number !== undefined) {
            const value = clean(req.body.license_number);

            if (!value || value.length > 80) {
                return res.status(400).json({
                    success: false,
                    message: "License number must be between 1 and 80 characters."
                });
            }

            updates.push("license_number = ?");
            values.push(value);
        }

        if (req.body?.license_type !== undefined) {
            const value = clean(req.body.license_type);

            if (value && value.length > 50) {
                return res.status(400).json({
                    success: false,
                    message: "License type cannot exceed 50 characters."
                });
            }

            updates.push("license_type = ?");
            values.push(value);
        }

        if (req.body?.assigned_ward_id !== undefined) {
            const nextWardId =
                positiveInteger(
                    req.body.assigned_ward_id
                );

            if (!nextWardId) {
                return res.status(400).json({
                    success: false,
                    message: "Assigned ward must be a valid ward."
                });
            }

            if (
                existing.assignment_id &&
                Number(existing.assigned_ward_id) !== Number(nextWardId)
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Unassign the driver's active route before changing the assigned ward."
                });
            }

            const ward =
                await validateDriverWard(
                    req,
                    nextWardId
                );

            if (Number(existing.assigned_ward_id) !== Number(ward.id)) {
                updates.push("assigned_ward_id = ?");
                values.push(ward.id);
            }
        }

        if (req.body?.status !== undefined) {
            const status =
                clean(
                    req.body.status
                );

            if (!MANUAL_DRIVER_STATUSES.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Driver status must be available, on_break, or inactive when managed manually."
                });
            }

            if (existing.assignment_id && status !== "available") {
                return res.status(409).json({
                    success: false,
                    message:
                        "The driver has an active route assignment. Complete or cancel the assignment before changing availability."
                });
            }

            updates.push("status = ?");
            values.push(status);
        }

        if (!updates.length) {
            return res.status(400).json({
                success: false,
                message: "No driver changes were supplied."
            });
        }

        values.push(driverId);

        await db.execute(
            `
            UPDATE drivers
            SET ${updates.join(", ")}
            WHERE id = ?
            `,
            values
        );

        const driver =
            await getDriverForManagement(
                req,
                driverId
            );

        return res.json({
            success: true,
            message:
                "Driver updated successfully.",
            driver
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message:
                    "Employee ID already exists."
            });
        }

        return sendServerError(
            res,
            "Unable to update driver.",
            error
        );
    }
}


async function deleteDriver(
    req,
    res
) {
    const driverId =
        positiveInteger(
            req.params.id
        );

    if (!driverId) {
        return res.status(400).json({
            success: false,
            message: "Invalid driver ID."
        });
    }

    try {
        const scope =
            await getScopeContext(req);

        const driverFilter =
            driverScope(
                scope,
                "d"
            );

        const [rows] =
            await db.execute(
                `
                SELECT
                    d.id,
                    d.status,
                    ra.id AS assignment_id

                FROM drivers d

                LEFT JOIN route_assignments ra
                    ON ra.driver_id = d.id
                   AND ra.status IN (
                        'assigned',
                        'active',
                        'delayed'
                   )

                WHERE d.id = ?
                  AND d.status <> 'inactive'
                  ${driverFilter.sql}

                ORDER BY ra.id DESC
                LIMIT 1
                `,
                [
                    driverId,
                    ...driverFilter.params
                ]
            );

        const driver = rows[0];

        if (!driver) {
            return res.status(404).json({
                success: false,
                message:
                    "Driver not found in the current operational scope."
            });
        }

        if (driver.assignment_id) {
            return res.status(409).json({
                success: false,
                message:
                    "Cannot deactivate a driver with an active route assignment. Complete or cancel the route first."
            });
        }

        await db.execute(
            `
            UPDATE drivers
            SET status = 'inactive'
            WHERE id = ?
            `,
            [driverId]
        );

        return res.json({
            success: true,
            message:
                "Driver deactivated successfully."
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to deactivate driver.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * ROUTE ASSIGNMENTS
 * ---------------------------------------------------------
 */
async function getCurrentRouteAssignment(
    connection,
    routeId,
    { forUpdate = false } = {}
) {
    const [rows] = await connection.execute(
        `
        SELECT
            id,
            assignment_code,
            vehicle_id,
            driver_id,
            status,
            assigned_at,
            started_at,
            completed_at,
            unassigned_at
        FROM route_assignments
        WHERE route_id = ?
          AND status IN (
            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
          )
        ORDER BY id DESC
        LIMIT 1
        ${forUpdate ? "FOR UPDATE" : ""}
        `,
        [routeId]
    );

    return rows[0] || null;
}

async function releaseVehicleIfUnused(
    connection,
    vehicleId
) {
    const [rows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE vehicle_id = ?
          AND status IN (
            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
          )
        LIMIT 1
        `,
        [vehicleId]
    );

    if (!rows.length) {
        await connection.execute(
            `
            UPDATE vehicles
            SET status = 'available'
            WHERE id = ?
              AND status <> 'inactive'
            `,
            [vehicleId]
        );
    }
}

async function releaseDriverIfUnused(
    connection,
    driverId
) {
    const [rows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE driver_id = ?
          AND status IN (
            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
          )
        LIMIT 1
        `,
        [driverId]
    );

    if (!rows.length) {
        await connection.execute(
            `
            UPDATE drivers
            SET status = 'available'
            WHERE id = ?
              AND status <> 'inactive'
            `,
            [driverId]
        );
    }
}

async function ensureVehicleAvailableForAssignment(
    connection,
    vehicleId,
    routeId,
    currentVehicleId = null
) {
    const [vehicleRows] = await connection.execute(
        `
        SELECT
            v.id,
            v.status
        FROM vehicles v
        WHERE v.id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [vehicleId]
    );

    const vehicle = vehicleRows[0];

    if (!vehicle || vehicle.status === "inactive") {
        throw createConflictError(
            "Selected vehicle is unavailable."
        );
    }

    if (
        Number(vehicle.id) === Number(currentVehicleId)
    ) {
        return;
    }

    if (vehicle.status !== "available") {
        throw createConflictError(
            "Selected vehicle is not available."
        );
    }

    const [assignmentRows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE vehicle_id = ?
          AND route_id <> ?
          AND status IN (
            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
          )
        LIMIT 1
        FOR UPDATE
        `,
        [vehicleId, routeId]
    );

    if (assignmentRows.length) {
        throw createConflictError(
            "Selected vehicle is already assigned to another active route."
        );
    }
}

async function ensureDriverAvailableForAssignment(
    connection,
    driverId,
    routeId,
    wardId,
    currentDriverId = null
) {
    const [driverRows] = await connection.execute(
        `
        SELECT
            d.id,
            d.status,
            d.assigned_ward_id
        FROM drivers d
        WHERE d.id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [driverId]
    );

    const driver = driverRows[0];

    if (!driver || driver.status === "inactive") {
        throw createConflictError(
            "Selected driver is unavailable."
        );
    }

    if (
        Number(driver.id) === Number(currentDriverId)
    ) {
        return;
    }

    if (driver.status !== "available") {
        throw createConflictError(
            "Selected driver is not available."
        );
    }

    if (
        driver.assigned_ward_id !== null &&
        Number(driver.assigned_ward_id) !== Number(wardId)
    ) {
        throw createConflictError(
            "Selected driver is not assigned to the route ward."
        );
    }

    const [assignmentRows] = await connection.execute(
        `
        SELECT id
        FROM route_assignments
        WHERE driver_id = ?
          AND route_id <> ?
          AND status IN (
            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
          )
        LIMIT 1
        FOR UPDATE
        `,
        [driverId, routeId]
    );

    if (assignmentRows.length) {
        throw createConflictError(
            "Selected driver is already assigned to another active route."
        );
    }
}

async function applyRouteAssignmentChange({
    req,
    connection,
    routeId,
    routeStatus,
    vehicleId,
    driverId,
    currentAssignment = null,
    allowUnassign = true
}) {
    const current =
        currentAssignment ||
        await getCurrentRouteAssignment(
            connection,
            routeId,
            { forUpdate: true }
        );

    const currentVehicleId = current
        ? Number(current.vehicle_id)
        : null;

    const currentDriverId = current
        ? Number(current.driver_id)
        : null;

    if (
        (vehicleId && !driverId) ||
        (!vehicleId && driverId)
    ) {
        throw createConflictError(
            "Vehicle and driver must be assigned together."
        );
    }

    if (!vehicleId && !driverId) {
        if (!current) {
            if (!allowUnassign) {
                return null;
            }
            return null;
        }

        if (routeStatus !== "scheduled") {
            throw createConflictError(
                "An active route cannot be left without a vehicle and driver."
            );
        }

        await connection.execute(
            `
            UPDATE route_assignments
            SET
                status = 'cancelled',
                unassigned_at = NOW()
            WHERE id = ?
            `,
            [current.id]
        );

        await releaseVehicleIfUnused(
            connection,
            currentVehicleId
        );

        await releaseDriverIfUnused(
            connection,
            currentDriverId
        );

        return null;
    }

    if (["completed", "cancelled"].includes(routeStatus)) {
        if (!current) {
            return null;
        }

        if (
            Number(vehicleId) !== currentVehicleId ||
            Number(driverId) !== currentDriverId
        ) {
            throw createConflictError(
                "A completed or cancelled route cannot be reassigned."
            );
        }

        const finalAssignmentStatus =
            routeStatus === "completed"
                ? "completed"
                : "cancelled";

        await connection.execute(
            `
            UPDATE route_assignments
            SET
                status = ?,
                completed_at = CASE
                    WHEN ? = 'completed'
                        THEN NOW()
                    ELSE completed_at
                END,
                unassigned_at = CASE
                    WHEN ? = 'cancelled'
                        THEN NOW()
                    ELSE unassigned_at
                END
            WHERE id = ?
            `,
            [
                finalAssignmentStatus,
                routeStatus,
                routeStatus,
                current.id
            ]
        );

        await releaseVehicleIfUnused(
            connection,
            currentVehicleId
        );

        await releaseDriverIfUnused(
            connection,
            currentDriverId
        );

        return null;
    }

    if (!routeStatusAllowsAssignment(routeStatus)) {
        throw createConflictError(
            "A completed or cancelled route cannot receive a new assignment."
        );
    }

    if (
        current &&
        currentVehicleId === Number(vehicleId) &&
        currentDriverId === Number(driverId)
    ) {
        const assignmentStatus =
            assignmentStatusForRouteStatus(routeStatus);

        const vehicleStatus =
            vehicleStatusForRouteStatus(routeStatus);

        await connection.execute(
            `
            UPDATE route_assignments
            SET
                status = ?,
                started_at = CASE
                    WHEN ? = 'active' AND started_at IS NULL
                        THEN NOW()
                    ELSE started_at
                END
            WHERE id = ?
            `,
            [assignmentStatus, routeStatus, current.id]
        );

        await connection.execute(
            `
            UPDATE vehicles
            SET status = ?
            WHERE id = ?
            `,
            [vehicleStatus, currentVehicleId]
        );

        await connection.execute(
            `
            UPDATE drivers
            SET status = 'assigned'
            WHERE id = ?
            `,
            [currentDriverId]
        );

        return current;
    }

    // Determine route ward for driver validation.
    const [routeRows] = await connection.execute(
        `
        SELECT ward_id
        FROM routes
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [routeId]
    );

    const routeRow = routeRows[0];

    if (!routeRow) {
        throw new Error("Route no longer exists.");
    }

    await ensureVehicleAvailableForAssignment(
        connection,
        Number(vehicleId),
        routeId,
        currentVehicleId
    );

    await ensureDriverAvailableForAssignment(
        connection,
        Number(driverId),
        routeId,
        Number(routeRow.ward_id),
        currentDriverId
    );

    if (current) {
        await connection.execute(
            `
            UPDATE route_assignments
            SET
                status = 'cancelled',
                unassigned_at = NOW()
            WHERE id = ?
            `,
            [current.id]
        );

        await releaseVehicleIfUnused(
            connection,
            currentVehicleId
        );

        await releaseDriverIfUnused(
            connection,
            currentDriverId
        );
    }

    const assignmentCode =
        `ASG-${routeId}-${Date.now()}`;

    const assignmentStatus =
        assignmentStatusForRouteStatus(routeStatus);

    await connection.execute(
        `
        INSERT INTO route_assignments
        (
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
            assignmentCode,
            routeId,
            Number(vehicleId),
            Number(driverId),
            req.currentUser.id,
            assignmentStatus,
            routeStatus === "active"
                ? new Date()
                : null
        ]
    );

    await connection.execute(
        `
        UPDATE vehicles
        SET status = ?
        WHERE id = ?
        `,
        [
            vehicleStatusForRouteStatus(routeStatus),
            Number(vehicleId)
        ]
    );

    await connection.execute(
        `
        UPDATE drivers
        SET status = 'assigned'
        WHERE id = ?
        `,
        [Number(driverId)]
    );

    return await getCurrentRouteAssignment(
        connection,
        routeId,
        { forUpdate: false }
    );
}

async function updateRouteAssignment(
    req,
    res
) {
    const routeId = positiveInteger(req.params.id);

    if (!routeId) {
        return res.status(400).json({
            success: false,
            message: "Invalid route ID."
        });
    }

    const vehicleId =
        req.body?.vehicle_id === null ||
        req.body?.vehicle_id === "" ||
        req.body?.vehicle_id === undefined
            ? null
            : positiveInteger(req.body.vehicle_id);

    const driverId =
        req.body?.driver_id === null ||
        req.body?.driver_id === "" ||
        req.body?.driver_id === undefined
            ? null
            : positiveInteger(req.body.driver_id);

    let connection;

    try {
        if (
            (vehicleId && !driverId) ||
            (!vehicleId && driverId)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vehicle and driver must be assigned together."
            });
        }

        const scope = await getScopeContext(req);
        const scopeFilter = routeScope(scope, "r");

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [routeRows] = await connection.execute(
            `
            SELECT id, status, zone_id, ward_id
            FROM routes r
            WHERE r.id = ?
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [routeId, ...scopeFilter.params]
        );

        const route = routeRows[0];

        if (!route) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Route not found in the current scope."
            });
        }

        if (!routeStatusAllowsAssignment(route.status)) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Completed or cancelled routes cannot be reassigned."
            });
        }

        const currentAssignment =
            await getCurrentRouteAssignment(
                connection,
                routeId,
                { forUpdate: true }
            );

        await applyRouteAssignmentChange({
            req,
            connection,
            routeId,
            routeStatus: route.status,
            vehicleId,
            driverId,
            currentAssignment,
            allowUnassign: true
        });

        await connection.commit();

        const updatedRoute =
            await getRouteRecord(routeId, scope);

        return res.json({
            success: true,
            message: "Route assignment updated successfully.",
            route: updatedRoute
        });

    } catch (error) {
        await connection?.rollback();
        return sendServerError(
            res,
            "Unable to update route assignment.",
            error
        );
    } finally {
        connection?.release();
    }
}

async function removeRouteAssignment(
    req,
    res
) {
    req.body = {
        vehicle_id: null,
        driver_id: null
    };

    return updateRouteAssignment(req, res);
}


async function getAssignments(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const scopeFilter =
            routeScope(
                scope,
                "r"
            );


        const [rows] =
            await db.execute(
                `
                SELECT
                    ra.id,
                    ra.assignment_code,
                    ra.status,
                    ra.assigned_at,
                    ra.started_at,
                    ra.completed_at,
                    ra.unassigned_at,

                    r.id AS route_id,
                    r.route_code,
                    r.route_name,
                    r.zone_id,
                    r.ward_id,

                    z.zone_code,
                    z.zone_name,

                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    d.id AS driver_id,
                    d.employee_id,
                    d.full_name AS driver_name,
                    d.mobile_number AS driver_mobile_number,
                    d.email AS driver_email,
                    d.license_number,
                    d.license_type,

                    v.id AS vehicle_id,
                    v.vehicle_number,
                    v.registration_number,
                    v.vehicle_type,
                    v.make,
                    v.image_path,
                    v.current_load_tons,
                    v.current_load_percent,
                    v.capacity_tons

                FROM route_assignments ra

                JOIN routes r
                    ON r.id = ra.route_id

                JOIN zones z
                    ON z.id = r.zone_id

                JOIN wards w
                    ON w.id = r.ward_id
                   AND w.zone_id = r.zone_id

                JOIN drivers d
                    ON d.id = ra.driver_id

                JOIN vehicles v
                    ON v.id = ra.vehicle_id

                WHERE ra.status IN (
                    '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                )

                ${scopeFilter.sql}

                ORDER BY
                    ra.id DESC
                `,
                scopeFilter.params
            );


        return res.json({
            success: true,

            assignments:
                rows.map(row => ({
                    id:
                        Number(row.id),

                    code:
                        row.assignment_code,

                    status:
                        row.status,

                    assignedAt:
                        isoOrNull(
                            row.assigned_at
                        ),

                    startedAt:
                        isoOrNull(
                            row.started_at
                        ),

                    completedAt:
                        isoOrNull(
                            row.completed_at
                        ),

                    unassignedAt:
                        isoOrNull(
                            row.unassigned_at
                        ),


                    route: {
                        id:
                            Number(
                                row.route_id
                            ),

                        code:
                            row.route_code,

                        name:
                            row.route_name
                    },


                    division: {
                        id:
                            row.division_id === null
                                ? null
                                : Number(row.division_id),
                    },

                    zone: {
                        id:
                            Number(
                                row.zone_id
                            ),

                        code:
                            row.zone_code,

                        name:
                            row.zone_name
                    },


                    ward: {
                        id:
                            Number(
                                row.ward_id
                            ),

                        number:
                            Number(
                                row.ward_number
                            ),

                        code:
                            row.ward_code,

                        name:
                            row.ward_name
                    },


                    driver: {
                        id:
                            Number(
                                row.driver_id
                            ),

                        employeeId:
                            row.employee_id,

                        name:
                            row.driver_name,

                        mobileNumber:
                            row.driver_mobile_number,

                        email:
                            row.driver_email,

                        licenseNumber:
                            row.license_number,

                        licenseType:
                            row.license_type
                    },


                    vehicle: {
                        id:
                            Number(
                                row.vehicle_id
                            ),

                        number:
                            row.vehicle_number,

                        registrationNumber:
                            row.registration_number,

                        type:
                            row.vehicle_type,

                        make:
                            row.make,

                        imagePath:
                            row.image_path,

                        currentLoadTons:
                            toNumber(
                                row.current_load_tons
                            ),

                        currentLoadPercent:
                            Number(
                                row.current_load_percent ||
                                0
                            ),

                        capacityTons:
                            toNumber(
                                row.capacity_tons
                            )
                    }
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load route assignments.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * COLLECTIONS
 * ---------------------------------------------------------
 */
async function getCollections(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const scopeFilter =
            wardScope(
                scope,
                "w"
            );


        const [rows] =
            await db.execute(
                `
                SELECT
                    c.id,
                    c.route_id,
                    c.route_stop_id,
                    c.ward_id,
                    c.vehicle_id,
                    c.driver_id,
                    c.collection_date,
                    c.waste_tons,
                    c.status,
                    c.notes,
                    c.collected_at,
                    c.created_at,
                    c.updated_at,

                    r.route_code,
                    r.route_name,

                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    v.vehicle_number,

                    d.full_name AS driver_name

                FROM collections c

                JOIN routes r
                    ON r.id = c.route_id

                JOIN wards w
                    ON w.id = c.ward_id

                LEFT JOIN vehicles v
                    ON v.id = c.vehicle_id

                LEFT JOIN drivers d
                    ON d.id = c.driver_id

                WHERE 1 = 1

                ${scopeFilter.sql}

                ORDER BY
                    c.collection_date DESC,
                    c.id DESC
                `,
                scopeFilter.params
            );


        const totalWasteTons =
            rows.reduce(
                (total, row) =>
                    total +
                    Number(
                        row.waste_tons || 0
                    ),
                0
            );


        const completedRecords =
            rows.filter(
                row =>
                    row.status ===
                    "collected"
            ).length;


        const activeRecords =
            rows.filter(
                row =>
                    row.status ===
                    "in_progress"
            ).length;


        return res.json({
            success: true,

            summary: {
                totalRecords:
                    rows.length,

                totalWasteTons,

                completedRecords,

                activeRecords
            },

            collections:
                rows.map(row => ({
                    id:
                        Number(row.id),

                    routeId:
                        Number(
                            row.route_id
                        ),

                    routeStopId:
                        row.route_stop_id === null
                            ? null
                            : Number(
                                row.route_stop_id
                            ),

                    wardId:
                        Number(
                            row.ward_id
                        ),

                    vehicleId:
                        row.vehicle_id === null
                            ? null
                            : Number(
                                row.vehicle_id
                            ),

                    driverId:
                        row.driver_id === null
                            ? null
                            : Number(
                                row.driver_id
                            ),

                    collectionDate:
                        row.collection_date,

                    wasteTons:
                        toNumber(
                            row.waste_tons
                        ) || 0,

                    status:
                        row.status,

                    notes:
                        row.notes,

                    collectedAt:
                        isoOrNull(
                            row.collected_at
                        ),

                    createdAt:
                        isoOrNull(
                            row.created_at
                        ),

                    updatedAt:
                        isoOrNull(
                            row.updated_at
                        ),


                    route: {
                        code:
                            row.route_code,

                        name:
                            row.route_name
                    },


                    ward: {
                        number:
                            Number(
                                row.ward_number
                            ),

                        code:
                            row.ward_code,

                        name:
                            row.ward_name
                    },


                    vehicleNumber:
                        row.vehicle_number,

                    driverName:
                        row.driver_name
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load collection operations.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * COMPLAINTS
 * ---------------------------------------------------------
 */
async function getComplaints(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const params = [];
        let scopeSql = "";


        if (
            scope.scopeType ===
            "zone"
        ) {
            scopeSql =
                "AND w.zone_id = ?";

            params.push(
                scope.zoneId
            );
        } else if (
            scope.scopeType ===
            "ward"
        ) {
            scopeSql =
                "AND c.ward_id = ?";

            params.push(
                scope.wardId
            );
        }


        const [rows] =
            await db.execute(
                `
                SELECT
                    c.id,
                    c.complaint_code,
                    c.citizen_user_id,
                    c.complaint_type,
                    c.description,
                    c.location_text,
                    c.ward_id,
                    c.latitude,
                    c.longitude,
                    c.priority,
                    c.status,
                    c.assigned_vehicle_id,
                    c.assigned_driver_id,
                    c.reported_at,
                    c.resolved_at,
                    c.created_at,
                    c.updated_at,

                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    v.vehicle_number,

                    d.full_name AS driver_name

                FROM complaints c

                LEFT JOIN wards w
                    ON w.id = c.ward_id

                LEFT JOIN vehicles v
                    ON v.id = c.assigned_vehicle_id

                LEFT JOIN drivers d
                    ON d.id = c.assigned_driver_id

                WHERE 1 = 1

                ${scopeSql}

                ORDER BY
                    c.reported_at DESC
                `,
                params
            );


        return res.json({
            success: true,

            complaints:
                rows.map(row => ({
                    databaseId:
                        Number(row.id),

                    id:
                        row.complaint_code,

                    citizenUserId:
                        row.citizen_user_id === null
                            ? null
                            : Number(
                                row.citizen_user_id
                            ),

                    type:
                        row.complaint_type,

                    description:
                        row.description,

                    location:
                        row.location_text,


                    ward:
                        row.ward_id === null
                            ? null
                            : {
                                id:
                                    Number(
                                        row.ward_id
                                    ),

                                number:
                                    row.ward_number === null
                                        ? null
                                        : Number(
                                            row.ward_number
                                        ),

                                code:
                                    row.ward_code,

                                name:
                                    row.ward_name
                            },


                    priority:
                        row.priority,

                    status:
                        row.status,


                    assignedVehicle:
                        row.assigned_vehicle_id === null
                            ? null
                            : {
                                id:
                                    Number(
                                        row.assigned_vehicle_id
                                    ),

                                number:
                                    row.vehicle_number
                            },


                    assignedDriver:
                        row.assigned_driver_id === null
                            ? null
                            : {
                                id:
                                    Number(
                                        row.assigned_driver_id
                                    ),

                                name:
                                    row.driver_name
                            },


                    locationCoordinates:
                        row.latitude === null ||
                        row.longitude === null
                            ? null
                            : {
                                latitude:
                                    toNumber(
                                        row.latitude
                                    ),

                                longitude:
                                    toNumber(
                                        row.longitude
                                    )
                            },


                    reportedAt:
                        isoOrNull(
                            row.reported_at
                        ),

                    resolvedAt:
                        isoOrNull(
                            row.resolved_at
                        ),

                    createdAt:
                        isoOrNull(
                            row.created_at
                        ),

                    updatedAt:
                        isoOrNull(
                            row.updated_at
                        )
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load citizen complaints.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * UPDATE COMPLAINT STATUS
 * ---------------------------------------------------------
 */
async function updateComplaint(
    req,
    res
) {
    const complaintId =
        positiveInteger(
            req.params.id
        );


    const status =
        clean(
            req.body?.status
        );


    if (!complaintId) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid complaint ID."
        });
    }


    if (
        !VALID_COMPLAINT_STATUSES.includes(
            status
        )
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid complaint status."
        });
    }


    try {
        const scope =
            await getScopeContext(req);


        const params = [
            complaintId
        ];

        let scopeSql = "";


        if (
            scope.scopeType ===
            "zone"
        ) {
            scopeSql =
                "AND w.zone_id = ?";

            params.push(
                scope.zoneId
            );
        } else if (
            scope.scopeType ===
            "ward"
        ) {
            scopeSql =
                "AND c.ward_id = ?";

            params.push(
                scope.wardId
            );
        }


        const [
            complaintRows
        ] = await db.execute(
            `
            SELECT
                c.id
            FROM complaints c

            LEFT JOIN wards w
                ON w.id = c.ward_id

            WHERE c.id = ?

            ${scopeSql}

            LIMIT 1
            `,
            params
        );


        if (
            !complaintRows.length
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Complaint not found in the current scope."
            });
        }


        await db.execute(
            `
            UPDATE complaints
            SET
                status = ?,

                resolved_at =
                    CASE
                        WHEN ? = 'resolved'
                            THEN NOW()
                        ELSE NULL
                    END

            WHERE id = ?
            `,
            [
                status,
                status,
                complaintId
            ]
        );


        return res.json({
            success: true,
            message:
                "Complaint updated successfully."
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to update complaint.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * NOTIFICATIONS
 * ---------------------------------------------------------
 */
async function getNotifications(
    req,
    res
) {
    try {
        const [rows] =
            await db.execute(
                `
                SELECT
                    n.id,
                    n.title,
                    n.message,
                    n.notification_type,
                    n.priority,
                    n.is_read,
                    n.created_at,
                    n.read_at,

                    r.route_code,

                    c.complaint_code

                FROM notifications n

                LEFT JOIN routes r
                    ON r.id =
                       n.related_route_id

                LEFT JOIN complaints c
                    ON c.id =
                       n.related_complaint_id

                WHERE
                    n.recipient_user_id = ?

                ORDER BY
                    n.created_at DESC

                LIMIT 50
                `,
                [
                    req.currentUser.id
                ]
            );


        return res.json({
            success: true,

            notifications:
                rows.map(row => ({
                    id:
                        Number(row.id),

                    title:
                        row.title,

                    message:
                        row.message,

                    type:
                        row.notification_type,

                    priority:
                        row.priority,

                    isRead:
                        Boolean(
                            row.is_read
                        ),

                    createdAt:
                        isoOrNull(
                            row.created_at
                        ),

                    readAt:
                        isoOrNull(
                            row.read_at
                        ),

                    relatedRouteCode:
                        row.route_code,

                    relatedComplaintCode:
                        row.complaint_code
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load notifications.",
            error
        );
    }
}


/*
 * Mark all notifications for the current user as read.
 */
async function markNotificationsRead(
    req,
    res
) {
    try {
        await db.execute(
            `
            UPDATE notifications
            SET
                is_read = TRUE,
                read_at =
                    COALESCE(
                        read_at,
                        NOW()
                    )
            WHERE
                recipient_user_id = ?
                AND is_read = FALSE
            `,
            [
                req.currentUser.id
            ]
        );


        return res.json({
            success: true,
            message:
                "Notifications marked as read."
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to update notifications.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * ZONES
 * ---------------------------------------------------------
 */
async function getZones(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const params = [];
        let scopeSql = "";


        if (scope.scopeType === "division") {
            scopeSql = `
                AND EXISTS (
                    SELECT 1
                    FROM wards zone_wards
                    WHERE zone_wards.zone_id = z.id
                      AND zone_wards.division_id = ?
                )`;
            params.push(scope.divisionId);
        } else if (scope.scopeType === "ward") {
            scopeSql = "AND z.id = ?";
            params.push(scope.zoneId);
        }


        const [rows] =
            await db.execute(
                `
                SELECT
                    z.id,
                    z.zone_code,
                    z.zone_name
                FROM zones z
                WHERE z.status = 'active'
                ${scopeSql}
                ORDER BY z.zone_name
                `,
                params
            );


        return res.json({
            success: true,

            zones:
                rows.map(row => ({
                    id:
                        Number(row.id),

                    code:
                        row.zone_code,

                    name:
                        row.zone_name
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load zones.",
            error
        );
    }
}


/*
 * ---------------------------------------------------------
 * WARDS
 * ---------------------------------------------------------
 */
async function getWards(
    req,
    res
) {
    try {
        const scope =
            await getScopeContext(req);


        const rawZoneId =
            req.query?.zone_id;


        const requestedZoneId =
            rawZoneId ===
                undefined ||
            rawZoneId === ""
                ? null
                : positiveInteger(
                    rawZoneId
                );


        if (
            rawZoneId !==
                undefined &&
            rawZoneId !== "" &&
            !requestedZoneId
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid zone_id."
            });
        }


        const params = [];
        let scopeSql = "";


        if (scope.scopeType === "division") {
            scopeSql += "AND w.division_id = ?";
            params.push(scope.divisionId);
        } else if (scope.scopeType === "ward") {
            scopeSql +=
                "AND w.id = ?";

            params.push(
                scope.wardId
            );
        }


        if (requestedZoneId) {
            if (
                scope.scopeType === "ward" &&
                requestedZoneId !== scope.zoneId
            ) {
                throw createScopeError(
                    "Requested zone is outside the assigned ward."
                );
            }

            if (scope.scopeType === "division") {
                const [zoneRows] = await db.execute(
                    `
                    SELECT 1
                    FROM wards
                    WHERE zone_id = ?
                      AND division_id = ?
                    LIMIT 1
                    `,
                    [requestedZoneId, scope.divisionId]
                );

                if (!zoneRows.length) {
                    throw createScopeError(
                        "Requested zone is outside the assigned division."
                    );
                }
            }


            scopeSql +=
                " AND w.zone_id = ?";

            params.push(
                requestedZoneId
            );
        }


        const [rows] =
            await db.execute(
                `
                SELECT
                    w.id,
                    w.zone_id,
                    w.division_id,
                    w.ward_number,
                    w.ward_code,
                    w.ward_name,

                    z.zone_code,
                    z.zone_name

                FROM wards w

                JOIN zones z
                    ON z.id = w.zone_id

                WHERE w.status = 'active'
                  AND z.status = 'active'

                  ${scopeSql}

                ORDER BY
                    z.zone_name,
                    w.ward_number
                `,
                params
            );


        return res.json({
            success: true,

            wards:
                rows.map(row => ({
                    id:
                        Number(row.id),

                    zone_id:
                        Number(
                            row.zone_id
                        ),

                    zone: {
                        id:
                            Number(
                                row.zone_id
                            ),

                        code:
                            row.zone_code,

                        name:
                            row.zone_name
                    },

                    number:
                        Number(
                            row.ward_number
                        ),

                    code:
                        row.ward_code,

                    name:
                        row.ward_name
                }))
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to load wards.",
            error
        );
    }
}


module.exports = {
    ADMIN_ROLES,

    getOverview,

    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    updateRouteAssignment,
    removeRouteAssignment,
    getRouteStopsForInspector,
    createRouteStop,
    updateRouteStop,
    deleteRouteStop,

    getVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,

    getDrivers,
    createDriver,
    updateDriver,
    deleteDriver,

    getAssignments,

    getCollections,

    getComplaints,
    updateComplaint,

    getNotifications,
    markNotificationsRead,

    getZones,
    getWards
};

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
    const role =
        req.currentUser?.role;

    if (!ADMIN_ROLES.includes(role)) {
        throw createScopeError(
            "This account does not have administrative dashboard access."
        );
    }


    if (
        role ===
        "deputy_commissioner"
    ) {
        return {
            role,
            scopeType: "city",

            zoneId: null,
            zoneCode: null,
            zoneName: "Entire City",

            wardId: null,
            wardNumber: null,
            wardCode: null,
            wardName: null
        };
    }


    const [rows] =
        await connection.execute(
            `
            SELECT
                p.zone_id,

                z.zone_code,
                z.zone_name,

                p.ward_id,

                w.ward_number,
                w.ward_code,
                w.ward_name

            FROM user_profiles p

            LEFT JOIN zones z
                ON z.id = p.zone_id
               AND z.status = 'active'

            LEFT JOIN wards w
                ON w.id = p.ward_id
               AND w.zone_id = p.zone_id
               AND w.status = 'active'

            WHERE p.user_id = ?

            LIMIT 1
            `,
            [req.currentUser.id]
        );


    const profile =
        rows[0];


    if (!profile) {
        throw createScopeError(
            "An operational scope is not configured for this account. Complete your profile first."
        );
    }


    if (
        role ===
        "assistant_commissioner"
    ) {
        const zoneId =
            positiveInteger(
                profile.zone_id
            );

        if (!zoneId) {
            throw createScopeError(
                "Assistant Commissioner zone assignment is missing."
            );
        }

        return {
            role,
            scopeType: "zone",

            zoneId,

            zoneCode:
                profile.zone_code,

            zoneName:
                profile.zone_name,

            wardId: null,
            wardNumber: null,
            wardCode: null,
            wardName: null
        };
    }


    if (
        role ===
        "sanitary_inspector"
    ) {
        const zoneId =
            positiveInteger(
                profile.zone_id
            );

        const wardId =
            positiveInteger(
                profile.ward_id
            );


        if (!zoneId || !wardId) {
            throw createScopeError(
                "Sanitary Inspector ward assignment is missing. Complete your profile first."
            );
        }


        if (
            !profile.zone_code ||
            !profile.zone_name ||
            !profile.ward_code ||
            !profile.ward_name
        ) {
            throw createScopeError(
                "Sanitary Inspector zone/ward assignment is invalid."
            );
        }


        return {
            role,
            scopeType: "ward",

            zoneId,

            zoneCode:
                profile.zone_code,

            zoneName:
                profile.zone_name,

            wardId,

            wardNumber:
                profile.ward_number === null
                    ? null
                    : Number(
                        profile.ward_number
                    ),

            wardCode:
                profile.ward_code,

            wardName:
                profile.ward_name
        };
    }


    throw createScopeError(
        "This account does not have administrative dashboard access."
    );
}


/*
 * Route scope filter.
 */
function routeScope(
    scope,
    alias = "r"
) {
    if (
        scope.scopeType ===
        "zone"
    ) {
        return {
            sql:
                `AND ${alias}.zone_id = ?`,
            params: [
                scope.zoneId
            ]
        };
    }


    if (
        scope.scopeType ===
        "ward"
    ) {
        return {
            sql:
                `AND ${alias}.ward_id = ?`,
            params: [
                scope.wardId
            ]
        };
    }


    return {
        sql: "",
        params: []
    };
}


/*
 * Ward scope filter.
 */
function wardScope(
    scope,
    alias = "w"
) {
    if (
        scope.scopeType ===
        "zone"
    ) {
        return {
            sql:
                `AND ${alias}.zone_id = ?`,
            params: [
                scope.zoneId
            ]
        };
    }


    if (
        scope.scopeType ===
        "ward"
    ) {
        return {
            sql:
                `AND ${alias}.id = ?`,
            params: [
                scope.wardId
            ]
        };
    }


    return {
        sql: "",
        params: []
    };
}


/*
 * Driver scope.
 *
 * Drivers are operationally associated with wards.
 * An unassigned driver (NULL ward) remains visible as a
 * common available resource.
 */
function driverScope(
    scope,
    alias = "d"
) {
    if (
        scope.scopeType ===
        "zone"
    ) {
        return {
            sql: `
                AND (
                    ${alias}.assigned_ward_id IS NULL
                    OR ${alias}.assigned_ward_id IN (
                        SELECT id
                        FROM wards
                        WHERE zone_id = ?
                    )
                )
            `,
            params: [
                scope.zoneId
            ]
        };
    }


    if (
        scope.scopeType ===
        "ward"
    ) {
        return {
            sql: `
                AND (
                    ${alias}.assigned_ward_id IS NULL
                    OR ${alias}.assigned_ward_id = ?
                )
            `,
            params: [
                scope.wardId
            ]
        };
    }


    return {
        sql: "",
        params: []
    };
}


/*
 * Vehicle scope.
 *
 * Vehicles do not have an assigned_ward_id.
 *
 * A vehicle's operational ward/zone is obtained through:
 *
 *     vehicle
 *        -> active route assignment
 *        -> route
 *        -> zone / ward
 *
 * Available unassigned vehicles are kept in the common fleet
 * pool so an authorized Inspector can assign one to a new route.
 */

/*
 * Vehicle management scope.
 *
 * Unlike the operational dashboard filter, fleet management must
 * also allow unassigned vehicles that are currently in maintenance
 * or another non-inactive state. Assigned vehicles are restricted
 * to the authenticated user's operational area.
 */
function vehicleManagementScope(
    scope,
    {
        routeAlias = "r",
        assignmentAlias = "ra"
    } = {}
) {
    if (scope.scopeType === "zone") {
        return {
            sql: `
                AND (
                    ${assignmentAlias}.id IS NULL
                    OR ${routeAlias}.zone_id = ?
                )
            `,
            params: [scope.zoneId]
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

    return {
        sql: "",
        params: []
    };
}


function vehicleScope(
    scope,
    {
        routeAlias = "r",
        assignmentAlias = "ra"
    } = {}
) {
    if (
        scope.scopeType ===
        "zone"
    ) {
        return {
            sql: `
                AND (
                    (
                        ${assignmentAlias}.id IS NOT NULL
                        AND ${routeAlias}.zone_id = ?
                    )
                    OR (
                        ${assignmentAlias}.id IS NULL
                        AND v.status = 'available'
                    )
                )
            `,
            params: [
                scope.zoneId
            ]
        };
    }


    if (
        scope.scopeType ===
        "ward"
    ) {
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
            params: [
                scope.wardId
            ]
        };
    }


    return {
        sql: "",
        params: []
    };
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
                    scope.wardName
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
    const routeCode =
        clean(
            req.body?.route_code
        );

    const routeName =
        clean(
            req.body?.route_name
        );

    const zoneId =
        positiveInteger(
            req.body?.zone_id
        );

    const wardId =
        positiveInteger(
            req.body?.ward_id
        );


    const vehicleId =
        req.body?.vehicle_id ===
            undefined ||
        req.body?.vehicle_id ===
            null ||
        req.body?.vehicle_id === ""
            ? null
            : positiveInteger(
                req.body.vehicle_id
            );


    const driverId =
        req.body?.driver_id ===
            undefined ||
        req.body?.driver_id ===
            null ||
        req.body?.driver_id === ""
            ? null
            : positiveInteger(
                req.body.driver_id
            );


    const totalStops =
        req.body?.total_stops ===
            undefined ||
        req.body?.total_stops ===
            null ||
        req.body?.total_stops === ""
            ? 0
            : Number(
                req.body.total_stops
            );


    if (
        !routeCode ||
        routeCode.length > 30 ||
        !routeName ||
        routeName.length > 150 ||
        !zoneId ||
        !wardId
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Valid route code, route name, zone and ward are required."
        });
    }


    if (
        !Number.isInteger(
            totalStops
        ) ||
        totalStops < 0
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Total stops must be a non-negative integer."
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
        const scope =
            await getScopeContext(req);


        /*
         * A new route must be inside the authenticated user's scope.
         */
        if (
            scope.scopeType ===
                "zone" &&
            zoneId !== scope.zoneId
        ) {
            throw createScopeError(
                "Route zone is outside the assigned zone."
            );
        }


        if (
            scope.scopeType ===
                "ward" &&
            (
                zoneId !==
                    scope.zoneId ||
                wardId !==
                    scope.wardId
            )
        ) {
            throw createScopeError(
                "Route ward is outside the assigned ward."
            );
        }


        connection =
            await db.getConnection();


        await connection.beginTransaction();


        /*
         * Ensure the selected ward belongs to the selected zone.
         */
        const [wardRows] =
            await connection.execute(
                `
                SELECT
                    w.id,
                    w.zone_id
                FROM wards w
                JOIN zones z
                    ON z.id = w.zone_id
                WHERE w.id = ?
                  AND w.zone_id = ?
                  AND w.status = 'active'
                  AND z.status = 'active'
                LIMIT 1
                FOR UPDATE
                `,
                [
                    wardId,
                    zoneId
                ]
            );


        if (!wardRows.length) {
            throw createScopeError(
                "Selected ward does not belong to the selected zone."
            );
        }


        /*
         * Vehicles are a common fleet resource.
         *
         * They have no assigned_ward_id.
         * An available vehicle is eligible for a new route,
         * then becomes associated with the route through the
         * route_assignments table.
         */
        if (vehicleId) {
            const [vehicleRows] =
                await connection.execute(
                    `
                    SELECT
                        v.id,
                        v.status
                    FROM vehicles v
                    WHERE v.id = ?
                      AND v.status = 'available'
                    FOR UPDATE
                    `,
                    [vehicleId]
                );


            if (!vehicleRows.length) {
                throw createConflictError(
                    "Selected vehicle is unavailable."
                );
            }
        }


        /*
         * Drivers may be assigned to a target ward or remain in
         * the common available pool until assigned.
         */
        if (driverId) {
            const [driverRows] =
                await connection.execute(
                    `
                    SELECT
                        d.id,
                        d.status,
                        d.assigned_ward_id
                    FROM drivers d
                    WHERE d.id = ?
                      AND d.status = 'available'
                      AND (
                          d.assigned_ward_id = ?
                          OR d.assigned_ward_id IS NULL
                      )
                    FOR UPDATE
                    `,
                    [
                        driverId,
                        wardId
                    ]
                );


            if (!driverRows.length) {
                throw createConflictError(
                    "Selected driver is unavailable or not assigned to the route ward."
                );
            }
        }


        const routeStatus =
            vehicleId &&
            driverId
                ? "starting"
                : "scheduled";


        const [routeResult] =
            await connection.execute(
                `
                INSERT INTO routes
                (
                    route_code,
                    route_name,
                    zone_id,
                    ward_id,
                    status,
                    total_stops,
                    completed_stops,
                    delay_minutes,
                    created_by
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    0,
                    0,
                    ?
                )
                `,
                [
                    routeCode,
                    routeName,
                    zoneId,
                    wardId,
                    routeStatus,
                    totalStops,
                    req.currentUser.id
                ]
            );


        if (
            vehicleId &&
            driverId
        ) {
            const assignmentCode =
                `ASG-${Date.now()}-${routeResult.insertId}`;


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
                    assigned_at
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'assigned',
                    NOW()
                )
                `,
                [
                    assignmentCode,
                    routeResult.insertId,
                    vehicleId,
                    driverId,
                    req.currentUser.id
                ]
            );


            await connection.execute(
                `
                UPDATE vehicles
                SET status = 'en_route'
                WHERE id = ?
                `,
                [vehicleId]
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


        await connection.commit();


        const route =
            await getRouteRecord(
                routeResult.insertId,
                scope
            );


        return res.status(201).json({
            success: true,
            message:
                "Route created successfully.",
            route
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }


        if (
            error.code ===
            "ER_DUP_ENTRY"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Route code already exists."
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
    const routeId =
        positiveInteger(
            req.params.id
        );


    if (!routeId) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid route ID."
        });
    }


    try {
        const scope =
            await getScopeContext(req);


        const scopeFilter =
            routeScope(
                scope,
                "r"
            );


        const [routeRows] =
            await db.execute(
                `
                SELECT
                    r.id,
                    r.route_name,
                    r.zone_id,
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
                  AND r.status <> 'cancelled'

                  ${scopeFilter.sql}

                LIMIT 1
                `,
                [
                    routeId,
                    ...scopeFilter.params
                ]
            );


        const existing =
            routeRows[0];


        if (!existing) {
            return res.status(404).json({
                success: false,
                message:
                    "Route not found in the current scope."
            });
        }


        const updates = [];
        const values = [];


        /*
         * Basic route fields.
         */
        if (
            req.body?.route_name !==
            undefined
        ) {
            const routeName =
                clean(
                    req.body.route_name
                );


            if (
                !routeName ||
                routeName.length > 150
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Route name must be between 1 and 150 characters."
                });
            }


            updates.push(
                "route_name = ?"
            );

            values.push(
                routeName
            );
        }


        /*
         * Route status.
         */
        let requestedStatus = null;

        if (
            req.body?.status !==
            undefined
        ) {
            requestedStatus =
                clean(
                    req.body.status
                );


            if (
                !VALID_ROUTE_STATUSES.includes(
                    requestedStatus
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid route status."
                });
            }


            updates.push(
                "status = ?"
            );

            values.push(
                requestedStatus
            );
        }


        /*
         * Zone + ward must always move together.
         */
        let nextZoneId =
            Number(
                existing.zone_id
            );

        let nextWardId =
            Number(
                existing.ward_id
            );


        if (
            req.body?.zone_id !==
                undefined ||
            req.body?.ward_id !==
                undefined
        ) {
            if (
                req.body.zone_id ===
                    undefined ||
                req.body.ward_id ===
                    undefined
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Zone and ward must be updated together."
                });
            }


            nextZoneId =
                positiveInteger(
                    req.body.zone_id
                );

            nextWardId =
                positiveInteger(
                    req.body.ward_id
                );


            if (
                !nextZoneId ||
                !nextWardId
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Zone and ward must be valid positive integers."
                });
            }


            if (
                scope.scopeType ===
                    "zone" &&
                nextZoneId !==
                    scope.zoneId
            ) {
                throw createScopeError(
                    "Route zone is outside the assigned zone."
                );
            }


            if (
                scope.scopeType ===
                    "ward" &&
                (
                    nextZoneId !==
                        scope.zoneId ||
                    nextWardId !==
                        scope.wardId
                )
            ) {
                throw createScopeError(
                    "Route ward is outside the assigned ward."
                );
            }


            const [wardRows] =
                await db.execute(
                    `
                    SELECT id
                    FROM wards
                    WHERE id = ?
                      AND zone_id = ?
                      AND status = 'active'
                    LIMIT 1
                    `,
                    [
                        nextWardId,
                        nextZoneId
                    ]
                );


            if (!wardRows.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Ward does not belong to the selected zone."
                });
            }


            /*
             * Moving a route with a live assignment can leave its
             * vehicle/driver associated with the wrong operational area.
             * Require the assignment to be removed first.
             */
            if (
                nextZoneId !==
                    Number(
                        existing.zone_id
                    ) ||
                nextWardId !==
                    Number(
                        existing.ward_id
                    )
            ) {
                const [
                    assignmentRows
                ] = await db.execute(
                    `
                    SELECT id
                    FROM route_assignments
                    WHERE route_id = ?
                      AND status IN (
                        '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                      )
                    LIMIT 1
                    `,
                    [routeId]
                );


                if (
                    assignmentRows.length
                ) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "Unassign the current vehicle and driver before changing the route area."
                    });
                }
            }


            updates.push(
                "zone_id = ?"
            );

            updates.push(
                "ward_id = ?"
            );

            values.push(
                nextZoneId,
                nextWardId
            );
        }


        /*
         * Numeric route fields.
         */
        const numericFields = [
            "estimated_distance_km",
            "estimated_duration_minutes",
            "total_stops",
            "completed_stops",
            "delay_minutes"
        ];


        const nextValues = {
            estimated_distance_km:
                existing.estimated_distance_km,

            estimated_duration_minutes:
                existing.estimated_duration_minutes,

            total_stops:
                Number(
                    existing.total_stops || 0
                ),

            completed_stops:
                Number(
                    existing.completed_stops || 0
                ),

            delay_minutes:
                Number(
                    existing.delay_minutes || 0
                )
        };


        for (
            const field
            of numericFields
        ) {
            if (
                req.body?.[field] ===
                undefined
            ) {
                continue;
            }


            const number =
                Number(
                    req.body[field]
                );


            if (
                !Number.isFinite(
                    number
                ) ||
                number < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be a non-negative number.`
                });
            }


            if (
                [
                    "estimated_duration_minutes",
                    "total_stops",
                    "completed_stops",
                    "delay_minutes"
                ].includes(field) &&
                !Number.isInteger(
                    number
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be an integer.`
                });
            }


            nextValues[field] =
                number;


            updates.push(
                `${field} = ?`
            );

            values.push(
                number
            );
        }


        if (
            nextValues.completed_stops >
            nextValues.total_stops
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Completed stops cannot exceed total stops."
            });
        }


        /*
         * Route text / schedule fields.
         */
        for (
            const field
            of [
                "start_point",
                "end_point",
                "scheduled_start_time",
                "scheduled_end_time"
            ]
        ) {
            if (
                req.body?.[field] ===
                undefined
            ) {
                continue;
            }


            const value =
                clean(
                    req.body[field]
                );


            if (
                [
                    "start_point",
                    "end_point"
                ].includes(field) &&
                value &&
                value.length > 200
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `${field} must be at most 200 characters.`
                });
            }


            updates.push(
                `${field} = ?`
            );

            values.push(
                value
            );
        }


        if (!updates.length) {
            return res.status(400).json({
                success: false,
                message:
                    "No supported route fields were provided."
            });
        }


        let connection;

        try {
            connection =
                await db.getConnection();

            await connection.beginTransaction();


            /*
             * Re-check the route under a lock before updating it.
             */
            const [
                lockedRows
            ] = await connection.execute(
                `
                SELECT
                    id,
                    status
                FROM routes
                WHERE id = ?
                LIMIT 1
                FOR UPDATE
                `,
                [routeId]
            );


            if (!lockedRows.length) {
                throw new Error(
                    "Route no longer exists."
                );
            }


            await connection.execute(
                `
                UPDATE routes
                SET
                    ${updates.join(", ")}
                WHERE id = ?
                `,
                [
                    ...values,
                    routeId
                ]
            );


            /*
             * Keep active assignment/asset states consistent with
             * route completion/cancellation.
             */
            if (
                requestedStatus ===
                    "completed" ||
                requestedStatus ===
                    "cancelled"
            ) {
                const newAssignmentStatus =
                    requestedStatus ===
                        "completed"
                        ? "completed"
                        : "cancelled";


                const [
                    assignmentRows
                ] = await connection.execute(
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
                        status = ?,
                        ${
                            requestedStatus ===
                            "completed"
                                ? "completed_at = NOW()"
                                : "unassigned_at = NOW()"
                        }
                    WHERE route_id = ?
                      AND status IN (
                        '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                      )
                    `,
                    [
                        newAssignmentStatus,
                        routeId
                    ]
                );


                for (
                    const assignment
                    of assignmentRows
                ) {
                    const [
                        otherVehicleRows
                    ] = await connection.execute(
                        `
                        SELECT id
                        FROM route_assignments
                        WHERE vehicle_id = ?
                          AND status IN (
                            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                          )
                        LIMIT 1
                        `,
                        [
                            assignment.vehicle_id
                        ]
                    );


                    if (
                        !otherVehicleRows.length
                    ) {
                        await connection.execute(
                            `
                            UPDATE vehicles
                            SET status = 'available'
                            WHERE id = ?
                            `,
                            [
                                assignment.vehicle_id
                            ]
                        );
                    }


                    const [
                        otherDriverRows
                    ] = await connection.execute(
                        `
                        SELECT id
                        FROM route_assignments
                        WHERE driver_id = ?
                          AND status IN (
                            '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                          )
                        LIMIT 1
                        `,
                        [
                            assignment.driver_id
                        ]
                    );


                    if (
                        !otherDriverRows.length
                    ) {
                        await connection.execute(
                            `
                            UPDATE drivers
                            SET status = 'available'
                            WHERE id = ?
                            `,
                            [
                                assignment.driver_id
                            ]
                        );
                    }
                }
            }


            await connection.commit();

        } catch (error) {
            await connection?.rollback();
            throw error;

        } finally {
            connection?.release();
        }


        const route =
            await getRouteRecord(
                routeId,
                scope
            );


        return res.json({
            success: true,
            message:
                "Route updated successfully.",
            route
        });

    } catch (error) {
        return sendServerError(
            res,
            "Unable to update route.",
            error
        );
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
    const routeId =
        positiveInteger(
            req.params.id
        );


    if (!routeId) {
        return res.status(400).json({
            success: false,
            message:
                "Invalid route ID."
        });
    }


    let connection;


    try {
        const scope =
            await getScopeContext(req);


        connection =
            await db.getConnection();


        await connection.beginTransaction();


        const scopeFilter =
            routeScope(
                scope,
                "r"
            );


        const [
            routeRows
        ] = await connection.execute(
            `
            SELECT
                r.id
            FROM routes r
            WHERE r.id = ?
              ${scopeFilter.sql}
            LIMIT 1
            FOR UPDATE
            `,
            [
                routeId,
                ...scopeFilter.params
            ]
        );


        if (!routeRows.length) {
            throw createScopeError(
                "Route not found in the current scope."
            );
        }


        const [
            assignmentRows
        ] = await connection.execute(
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


        for (
            const assignment
            of assignmentRows
        ) {
            const [
                vehicleAssignments
            ] = await connection.execute(
                `
                SELECT id
                FROM route_assignments
                WHERE vehicle_id = ?
                  AND status IN (
                    '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                  )
                LIMIT 1
                `,
                [
                    assignment.vehicle_id
                ]
            );


            if (
                !vehicleAssignments.length
            ) {
                await connection.execute(
                    `
                    UPDATE vehicles
                    SET status = 'available'
                    WHERE id = ?
                    `,
                    [
                        assignment.vehicle_id
                    ]
                );
            }


            const [
                driverAssignments
            ] = await connection.execute(
                `
                SELECT id
                FROM route_assignments
                WHERE driver_id = ?
                  AND status IN (
                    '${ACTIVE_ASSIGNMENT_STATUSES.join("','")}'
                  )
                LIMIT 1
                `,
                [
                    assignment.driver_id
                ]
            );


            if (
                !driverAssignments.length
            ) {
                await connection.execute(
                    `
                    UPDATE drivers
                    SET status = 'available'
                    WHERE id = ?
                    `,
                    [
                        assignment.driver_id
                    ]
                );
            }
        }


        await connection.commit();


        return res.json({
            success: true,
            message:
                "Route cancelled successfully."
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
                w.ward_number,
                z.zone_code,
                z.zone_name,
                w.ward_code,
                w.ward_name
            FROM wards w
            JOIN zones z
                ON z.id = w.zone_id
            WHERE w.id = ?
              AND w.status = 'active'
              AND z.status = 'active'
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
        scope.scopeType === "zone" &&
        Number(ward.zone_id) !== Number(scope.zoneId)
    ) {
        throw createScopeError(
            "Selected ward is outside the assigned zone."
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


        if (
            scope.scopeType ===
                "zone" ||
            scope.scopeType ===
                "ward"
        ) {
            scopeSql =
                "AND z.id = ?";

            params.push(
                scope.zoneId
            );
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


        if (
            scope.scopeType ===
            "zone"
        ) {
            scopeSql +=
                "AND w.zone_id = ?";

            params.push(
                scope.zoneId
            );
        }


        if (
            scope.scopeType ===
            "ward"
        ) {
            scopeSql +=
                "AND w.id = ?";

            params.push(
                scope.wardId
            );
        }


        if (requestedZoneId) {
            if (
                scope.scopeType ===
                    "zone" &&
                requestedZoneId !==
                    scope.zoneId
            ) {
                throw createScopeError(
                    "Requested zone is outside the assigned zone."
                );
            }


            if (
                scope.scopeType ===
                    "ward" &&
                requestedZoneId !==
                    scope.zoneId
            ) {
                throw createScopeError(
                    "Requested zone is outside the assigned ward."
                );
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

const db = require("../config/db");

/*
 * =========================================================
 * SWACHHITRA PROFILE CONTROLLER
 * =========================================================
 *
 * Scope rules for the current architecture:
 *
 * Deputy Commissioner
 *     -> city-wide
 *
 * Assistant Commissioner
 *     -> exactly one division
 *     -> division can be selected during first profile provisioning
 *     -> once a division is assigned, self-service profile edits cannot
 *        change it; a higher supervisory workflow will be used later.
 *
 * Sanitary Inspector
 *     -> exactly one division + one ward when assigned
 *     -> jurisdiction is assigned by Assistant Commissioner
 *     -> Inspector profile cannot create/change its own jurisdiction
 *
 * Driver / Citizen
 *     -> retain the existing legacy zone + ward profile flow for now
 *     -> division_id is derived from a mapped ward when available
 *
 * IMPORTANT:
 * - This controller expects Part 1 database migration to be applied.
 * - Existing zone/ward relationships are retained for compatibility.
 * - The Inspector's new authoritative scope is division_id + ward_id.
 */

const ROLE_RULES = {
    deputy_commissioner: {
        requiresEmployeeId: true,
        requiresDivision: false,
        requiresZone: false,
        requiresWard: false,
        driverFields: false
    },

    assistant_commissioner: {
        requiresEmployeeId: true,
        requiresDivision: true,
        requiresZone: false,
        requiresWard: false,
        driverFields: false
    },

    sanitary_inspector: {
        requiresEmployeeId: true,
        requiresDivision: false,
        requiresZone: false,
        requiresWard: false,
        requiresInspectorScope: true,
        driverFields: false
    },

    driver: {
        requiresEmployeeId: true,
        requiresDivision: false,
        requiresZone: true,
        requiresWard: true,
        driverFields: true
    },

    citizen: {
        requiresEmployeeId: false,
        requiresDivision: false,
        requiresZone: true,
        requiresWard: true,
        driverFields: false
    }
};


function clean(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}


function positiveInteger(value) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
        ? number
        : null;
}


function isValidMobile(value) {
    return /^[0-9]{10}$/.test(String(value || ""));
}


function createHttpError(message, statusCode = 400) {
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
 * Division resolver
 * ---------------------------------------------------------
 */
async function resolveDivision(
    connection,
    suppliedDivisionId
) {
    const divisionId = positiveInteger(
        suppliedDivisionId
    );

    if (!divisionId) {
        return null;
    }

    const [rows] = await connection.execute(
        `
        SELECT
            id,
            division_code,
            division_name,
            office_location,
            status
        FROM divisions
        WHERE id = ?
        LIMIT 1
        `,
        [divisionId]
    );

    if (!rows.length) {
        return {
            error: "Selected division could not be found."
        };
    }

    const division = rows[0];

    if (division.status !== "active") {
        return {
            error: "Selected division is inactive."
        };
    }

    return {
        id: Number(division.id),
        code: division.division_code,
        name: division.division_name,
        officeLocation: division.office_location
    };
}


/*
 * ---------------------------------------------------------
 * Legacy zone resolver
 * ---------------------------------------------------------
 */
async function resolveZone(
    connection,
    suppliedZoneId,
    zoneText
) {
    const zoneId = positiveInteger(suppliedZoneId);

    if (zoneId !== null) {
        const [rows] = await connection.execute(
            `
            SELECT
                id,
                zone_code,
                zone_name
            FROM zones
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
            `,
            [zoneId]
        );

        if (!rows.length) {
            return {
                error: "Selected zone is not active."
            };
        }

        return {
            id: Number(rows[0].id),
            code: rows[0].zone_code,
            name: rows[0].zone_name
        };
    }

    const text = clean(zoneText);

    if (!text) {
        return null;
    }

    const [rows] = await connection.execute(
        `
        SELECT
            id,
            zone_code,
            zone_name
        FROM zones
        WHERE status = 'active'
          AND (
                LOWER(zone_name) = LOWER(?)
                OR LOWER(zone_code) = LOWER(?)
          )
        LIMIT 1
        `,
        [text, text]
    );

    if (!rows.length) {
        return {
            error: "Selected zone could not be found."
        };
    }

    return {
        id: Number(rows[0].id),
        code: rows[0].zone_code,
        name: rows[0].zone_name
    };
}


/*
 * ---------------------------------------------------------
 * Legacy ward resolver
 * ---------------------------------------------------------
 */
async function resolveWard(
    connection,
    suppliedWardId,
    wardText,
    expectedZoneId
) {
    const wardId = positiveInteger(suppliedWardId);

    if (wardId !== null) {
        const [rows] = await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,

                z.zone_code,
                z.zone_name,

                d.division_code,
                d.division_name

            FROM wards w

            JOIN zones z
                ON z.id = w.zone_id

            LEFT JOIN divisions d
                ON d.id = w.division_id

            WHERE w.id = ?
              AND w.status = 'active'
              AND z.status = 'active'
            LIMIT 1
            `,
            [wardId]
        );

        if (!rows.length) {
            return {
                error: "Selected ward is not active."
            };
        }

        const ward = rows[0];

        if (
            expectedZoneId !== null &&
            expectedZoneId !== undefined &&
            Number(ward.zone_id) !== Number(expectedZoneId)
        ) {
            return {
                error: "Selected ward does not belong to the selected zone."
            };
        }

        return {
            id: Number(ward.id),
            zoneId: Number(ward.zone_id),
            divisionId: positiveInteger(ward.division_id),
            number: Number(ward.ward_number),
            code: ward.ward_code,
            name: ward.ward_name,
            zoneCode: ward.zone_code,
            zoneName: ward.zone_name,
            divisionCode: ward.division_code,
            divisionName: ward.division_name
        };
    }

    const text = clean(wardText);

    if (!text) {
        return null;
    }

    const numericMatch = text.match(
        /^ward[\s-]*(\d+)(?:\s|$)/i
    );

    const numericNumber = numericMatch
        ? Number(numericMatch[1])
        : null;

    let rows;

    if (numericNumber !== null) {
        [rows] = await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,

                z.zone_code,
                z.zone_name,

                d.division_code,
                d.division_name

            FROM wards w

            JOIN zones z
                ON z.id = w.zone_id

            LEFT JOIN divisions d
                ON d.id = w.division_id

            WHERE w.status = 'active'
              AND z.status = 'active'
              AND w.ward_number = ?
              AND (
                    ? IS NULL
                    OR w.zone_id = ?
              )
            ORDER BY
                CASE
                    WHEN w.zone_id = ? THEN 0
                    ELSE 1
                END,
                w.id
            LIMIT 1
            `,
            [
                numericNumber,
                expectedZoneId ?? null,
                expectedZoneId ?? null,
                expectedZoneId ?? null
            ]
        );
    } else {
        [rows] = await connection.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name,

                z.zone_code,
                z.zone_name,

                d.division_code,
                d.division_name

            FROM wards w

            JOIN zones z
                ON z.id = w.zone_id

            LEFT JOIN divisions d
                ON d.id = w.division_id

            WHERE w.status = 'active'
              AND z.status = 'active'
              AND (
                    LOWER(w.ward_name) = LOWER(?)
                    OR LOWER(w.ward_code) = LOWER(?)
              )
              AND (
                    ? IS NULL
                    OR w.zone_id = ?
              )
            ORDER BY w.id
            LIMIT 1
            `,
            [
                text,
                text,
                expectedZoneId ?? null,
                expectedZoneId ?? null
            ]
        );
    }

    if (!rows.length) {
        return {
            error: "Selected ward could not be found."
        };
    }

    const ward = rows[0];

    if (
        expectedZoneId !== null &&
        expectedZoneId !== undefined &&
        Number(ward.zone_id) !== Number(expectedZoneId)
    ) {
        return {
            error: "Selected ward does not belong to the selected zone."
        };
    }

    return {
        id: Number(ward.id),
        zoneId: Number(ward.zone_id),
        divisionId: positiveInteger(ward.division_id),
        number: Number(ward.ward_number),
        code: ward.ward_code,
        name: ward.ward_name,
        zoneCode: ward.zone_code,
        zoneName: ward.zone_name,
        divisionCode: ward.division_code,
        divisionName: ward.division_name
    };
}


/*
 * ---------------------------------------------------------
 * Role-aware profile completeness
 * ---------------------------------------------------------
 */
function isProfileCompleteForRole(role, profile) {
    if (!profile) {
        return false;
    }

    const hasFullName = Boolean(
        clean(profile.full_name)
    );

    if (!hasFullName) {
        return false;
    }

    const rules = ROLE_RULES[role];

    if (!rules) {
        return false;
    }

    if (
        rules.requiresEmployeeId &&
        !clean(profile.employee_id)
    ) {
        return false;
    }

    if (
        role === "assistant_commissioner" &&
        !positiveInteger(profile.division_id)
    ) {
        return false;
    }

    if (
        role === "sanitary_inspector" &&
        (
            !positiveInteger(profile.division_id) ||
            !positiveInteger(profile.ward_id)
        )
    ) {
        return false;
    }

    if (
        role === "driver" ||
        role === "citizen"
    ) {
        if (
            !positiveInteger(profile.zone_id) ||
            !positiveInteger(profile.ward_id)
        ) {
            return false;
        }
    }

    return true;
}


/*
 * ---------------------------------------------------------
 * GET /api/profile
 * ---------------------------------------------------------
 */
async function getProfile(req, res) {
    try {
        const [rows] = await db.execute(
            `
            SELECT
                u.id,
                u.email,
                u.role,

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

            LEFT JOIN zones z
                ON z.id = p.zone_id

            LEFT JOIN wards w
                ON w.id = p.ward_id

            WHERE u.id = ?

            LIMIT 1
            `,
            [req.currentUser.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const row = rows[0];

        const hasProfile =
            row.full_name !== null;

        const profile = hasProfile
            ? {
                full_name: row.full_name,
                mobile_number: row.mobile_number,
                official_email: row.official_email,
                employee_id: row.employee_id,
                department: row.department,
                designation: row.designation,
                office_location: row.office_location,
                working_shift: row.working_shift,
                official_contact_number:
                    row.official_contact_number,
                address: row.address,
                city: row.city,
                preferred_language:
                    row.preferred_language,
                notification_preference:
                    row.notification_preference,

                division_id:
                    row.division_id === null
                        ? null
                        : Number(row.division_id),

                zone_id:
                    row.zone_id === null
                        ? null
                        : Number(row.zone_id),

                ward_id:
                    row.ward_id === null
                        ? null
                        : Number(row.ward_id),

                division:
                    row.division_id === null
                        ? null
                        : {
                            id: Number(row.division_id),
                            code: row.division_code,
                            name: row.division_name,
                            office_location:
                                row.division_office_location
                        },

                zone:
                    row.zone_id === null
                        ? null
                        : row.zone_name,

                assigned_ward:
                    row.ward_id === null
                        ? null
                        : row.ward_name,

                scope_assigned_by:
                    row.scope_assigned_by === null
                        ? null
                        : Number(row.scope_assigned_by),

                scope_assigned_at:
                    row.scope_assigned_at,

                license_number: row.license_number,
                license_type: row.license_type,
                vehicle_number: row.vehicle_number,
                jurisdiction: row.jurisdiction
            }
            : null;

        return res.json({
            success: true,

            user: {
                id: Number(row.id),
                email: row.email,
                role: row.role
            },

            profileComplete:
                isProfileCompleteForRole(
                    row.role,
                    profile
                ),

            profile,

            scope: {
                division:
                    row.division_id === null
                        ? null
                        : {
                            id: Number(row.division_id),
                            code: row.division_code,
                            name: row.division_name
                        },

                zone:
                    row.zone_id === null
                        ? null
                        : {
                            id: Number(row.zone_id),
                            code: row.zone_code,
                            name: row.zone_name
                        },

                ward:
                    row.ward_id === null
                        ? null
                        : {
                            id: Number(row.ward_id),
                            number: Number(row.ward_number),
                            code: row.ward_code,
                            name: row.ward_name
                        },

                assigned_by:
                    row.scope_assigned_by === null
                        ? null
                        : Number(row.scope_assigned_by),

                assigned_at:
                    row.scope_assigned_at
            }
        });

    } catch (error) {
        console.error(
            "Profile read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load profile."
        });
    }
}


/*
 * ---------------------------------------------------------
 * GET /api/profile/reference-data
 * ---------------------------------------------------------
 *
 * Returns:
 * - divisions for Assistant Commissioner provisioning
 * - legacy zones/wards for Driver/Citizen compatibility
 *
 * Inspector scope is NOT offered as editable reference data.
 */
async function getReferenceData(req, res) {
    try {
        const [divisionRows] = await db.execute(
            `
            SELECT
                id,
                division_code,
                division_name,
                office_location
            FROM divisions
            WHERE status = 'active'
            ORDER BY division_name
            `
        );

        const [zoneRows] = await db.execute(
            `
            SELECT
                id,
                zone_code,
                zone_name
            FROM zones
            WHERE status = 'active'
            ORDER BY zone_name
            `
        );

        const [wardRows] = await db.execute(
            `
            SELECT
                w.id,
                w.zone_id,
                w.division_id,
                w.ward_number,
                w.ward_code,
                w.ward_name
            FROM wards w
            JOIN zones z
                ON z.id = w.zone_id
            WHERE w.status = 'active'
              AND z.status = 'active'
            ORDER BY
                w.division_id IS NULL,
                w.division_id,
                z.zone_name,
                w.ward_number
            `
        );

        return res.json({
            success: true,

            divisions: divisionRows.map(
                division => ({
                    id: Number(division.id),
                    code: division.division_code,
                    name: division.division_name,
                    office_location:
                        division.office_location
                })
            ),

            zones: zoneRows.map(zone => ({
                id: Number(zone.id),
                code: zone.zone_code,
                name: zone.zone_name
            })),

            wards: wardRows.map(ward => ({
                id: Number(ward.id),
                zone_id: Number(ward.zone_id),
                division_id:
                    ward.division_id === null
                        ? null
                        : Number(ward.division_id),
                number: Number(ward.ward_number),
                code: ward.ward_code,
                name: ward.ward_name
            }))
        });

    } catch (error) {
        console.error(
            "Profile reference-data error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load profile reference data."
        });
    }
}


/*
 * ---------------------------------------------------------
 * POST /api/profile
 * ---------------------------------------------------------
 *
 * Saves personal/official information.
 *
 * Important scope behavior:
 * - Assistant Commissioner: can select division only on initial
 *   provisioning. An existing division cannot be self-changed.
 * - Sanitary Inspector: zone/ward/division are NEVER accepted as a
 *   self-service assignment. Existing authoritative scope is preserved.
 * - Driver/Citizen: existing zone + ward behavior is retained.
 */
async function saveProfile(req, res) {
    const body = req.body || {};

    const fullName = clean(
        body.full_name ?? body.fullName
    );

    const mobileNumber = clean(
        body.mobile_number ?? body.mobileNumber
    );

    const employeeId = clean(
        body.employee_id ?? body.employeeId
    );

    const department = clean(body.department);
    const designation = clean(body.designation);

    const officeLocation = clean(
        body.office_location ?? body.officeLocation
    );

    const workingShift = clean(
        body.working_shift ?? body.workingShift
    );

    const officialContactNumber = clean(
        body.official_contact_number ??
        body.officialContactNumber
    );

    const address = clean(body.address);
    const city = clean(body.city);

    const preferredLanguage = clean(
        body.preferred_language ??
        body.preferredLanguage
    );

    const notificationPreference = clean(
        body.notification_preference ??
        body.notificationPreference
    );

    const licenseNumber = clean(
        body.license_number ?? body.licenseNumber
    );

    const licenseType = clean(
        body.license_type ?? body.licenseType
    );

    const vehicleNumber = clean(
        body.vehicle_number ?? body.vehicleNumber
    );

    const jurisdiction = clean(body.jurisdiction);

    const zoneIdInput =
        body.zone_id ?? body.zoneId;

    const wardIdInput =
        body.ward_id ?? body.wardId;

    const divisionIdInput =
        body.division_id ?? body.divisionId;

    const zoneText = clean(body.zone);

    const wardText = clean(
        body.assigned_ward ??
        body.assignedWard ??
        body.ward
    );

    try {
        const [userRows] = await db.execute(
            `
            SELECT
                id,
                email,
                role,
                status
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [req.currentUser.id]
        );

        const user = userRows[0];

        if (!user || user.status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const rules = ROLE_RULES[user.role];

        if (!rules) {
            return res.status(400).json({
                success: false,
                message: "Unsupported user role."
            });
        }

        if (!fullName || fullName.length > 120) {
            return res.status(400).json({
                success: false,
                message:
                    "Full name is required and must be at most 120 characters."
            });
        }

        if (
            !mobileNumber ||
            !isValidMobile(mobileNumber)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Mobile number must contain exactly 10 digits."
            });
        }

        if (
            officialContactNumber &&
            !isValidMobile(officialContactNumber)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Official contact number must contain exactly 10 digits."
            });
        }

        if (
            employeeId &&
            employeeId.length > 60
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Employee ID must be at most 60 characters."
            });
        }

        if (
            rules.requiresEmployeeId &&
            !employeeId
        ) {
            return res.status(400).json({
                success: false,
                message: "Employee ID is required."
            });
        }

        if (
            licenseNumber &&
            licenseNumber.length > 80
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "License number must be at most 80 characters."
            });
        }

        if (
            licenseType &&
            licenseType.length > 80
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "License type must be at most 80 characters."
            });
        }

        if (
            vehicleNumber &&
            vehicleNumber.length > 50
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vehicle number must be at most 50 characters."
            });
        }

        const suppliedZoneId =
            zoneIdInput === "" ||
            zoneIdInput === null ||
            zoneIdInput === undefined
                ? null
                : positiveInteger(zoneIdInput);

        const suppliedWardId =
            wardIdInput === "" ||
            wardIdInput === null ||
            wardIdInput === undefined
                ? null
                : positiveInteger(wardIdInput);

        const suppliedDivisionId =
            divisionIdInput === "" ||
            divisionIdInput === null ||
            divisionIdInput === undefined
                ? null
                : positiveInteger(divisionIdInput);

        if (
            (
                zoneIdInput !== "" &&
                zoneIdInput !== null &&
                zoneIdInput !== undefined &&
                suppliedZoneId === null
            ) ||
            (
                wardIdInput !== "" &&
                wardIdInput !== null &&
                wardIdInput !== undefined &&
                suppliedWardId === null
            ) ||
            (
                divisionIdInput !== "" &&
                divisionIdInput !== null &&
                divisionIdInput !== undefined &&
                suppliedDivisionId === null
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Division, zone and ward IDs must be valid positive integers."
            });
        }

        let connection;

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            /*
             * Lock the current profile row if one exists. This prevents two
             * simultaneous profile updates from making incompatible scope
             * decisions for the same account.
             */
            const [existingRows] = await connection.execute(
                `
                SELECT
                    user_id,
                    full_name,
                    employee_id,
                    division_id,
                    zone_id,
                    ward_id,
                    scope_assigned_by,
                    scope_assigned_at,
                    license_number,
                    license_type,
                    vehicle_number
                FROM user_profiles
                WHERE user_id = ?
                LIMIT 1
                FOR UPDATE
                `,
                [user.id]
            );

            const existingProfile =
                existingRows[0] || null;

            let divisionId = null;
            let zoneId = null;
            let wardId = null;

            /*
             * -----------------------------------------------------
             * Assistant Commissioner
             * -----------------------------------------------------
             */
            if (user.role === "assistant_commissioner") {
                if (
                    existingProfile &&
                    positiveInteger(
                        existingProfile.division_id
                    )
                ) {
                    divisionId = Number(
                        existingProfile.division_id
                    );

                    if (
                        suppliedDivisionId !== null &&
                        Number(suppliedDivisionId) !== divisionId
                    ) {
                        throw createHttpError(
                            "Your assigned division cannot be changed from the profile page. A higher supervisory account must reassign it.",
                            403
                        );
                    }
                } else {
                    if (!suppliedDivisionId) {
                        throw createHttpError(
                            "An assigned division is required for an Assistant Commissioner.",
                            400
                        );
                    }

                    const division = await resolveDivision(
                        connection,
                        suppliedDivisionId
                    );

                    if (division?.error) {
                        throw createHttpError(
                            division.error,
                            400
                        );
                    }

                    divisionId = division.id;
                }

                /*
                 * Assistant Commissioners are no longer represented as
                 * ward-scoped accounts. Legacy zone/ward values are cleared
                 * so they cannot accidentally restrict or expand access.
                 */
                zoneId = null;
                wardId = null;
            }

            /*
             * -----------------------------------------------------
             * Sanitary Inspector
             * -----------------------------------------------------
             *
             * Never accept scope from the Inspector's profile form.
             */
            else if (user.role === "sanitary_inspector") {
                const hasScopeInput =
                    suppliedDivisionId !== null ||
                    suppliedZoneId !== null ||
                    suppliedWardId !== null ||
                    Boolean(zoneText) ||
                    Boolean(wardText);

                if (hasScopeInput) {
                    throw createHttpError(
                        "Sanitary Inspector jurisdiction is assigned by the Assistant Commissioner and cannot be changed from this profile.",
                        403
                    );
                }

                if (existingProfile) {
                    divisionId = positiveInteger(
                        existingProfile.division_id
                    );

                    wardId = positiveInteger(
                        existingProfile.ward_id
                    );

                    zoneId = positiveInteger(
                        existingProfile.zone_id
                    );

                    if (divisionId && wardId) {
                        const [scopeRows] =
                            await connection.execute(
                                `
                                SELECT
                                    w.id,
                                    w.division_id,
                                    w.zone_id,
                                    d.status AS division_status,
                                    z.status AS zone_status,
                                    w.status AS ward_status
                                FROM wards w
                                JOIN divisions d
                                    ON d.id = w.division_id
                                JOIN zones z
                                    ON z.id = w.zone_id
                                WHERE w.id = ?
                                  AND w.division_id = ?
                                LIMIT 1
                                `,
                                [wardId, divisionId]
                            );

                        if (!scopeRows.length) {
                            throw createHttpError(
                                "The Inspector's assigned division and ward are inconsistent. Ask the Assistant Commissioner to correct the jurisdiction.",
                                409
                            );
                        }

                        const scope = scopeRows[0];

                        if (
                            scope.ward_status !== "active" ||
                            scope.division_status !== "active"
                        ) {
                            throw createHttpError(
                                "The Inspector's assigned division or ward is inactive.",
                                409
                            );
                        }

                        if (!zoneId) {
                            zoneId = Number(
                                scope.zone_id
                            );
                        }
                    }
                }
            }

            /*
             * -----------------------------------------------------
             * Driver / Citizen legacy scope
             * -----------------------------------------------------
             */
            else if (
                rules.requiresWard
            ) {
                if (!suppliedWardId && !wardText) {
                    throw createHttpError(
                        "Ward assignment is required.",
                        400
                    );
                }

                const resolvedWard = await resolveWard(
                    connection,
                    suppliedWardId,
                    wardText,
                    suppliedZoneId
                );

                if (resolvedWard?.error) {
                    throw createHttpError(
                        resolvedWard.error,
                        400
                    );
                }

                if (!resolvedWard) {
                    throw createHttpError(
                        "Ward assignment is required.",
                        400
                    );
                }

                wardId = resolvedWard.id;
                zoneId = resolvedWard.zoneId;
                divisionId = resolvedWard.divisionId;

                if (!zoneId) {
                    throw createHttpError(
                        "The selected ward does not have a valid zone mapping.",
                        400
                    );
                }
            }

            /*
             * Deputy Commissioner is city-wide.
             */
            else {
                divisionId = null;
                zoneId = null;
                wardId = null;
            }

            const profileEmployeeId =
                rules.requiresEmployeeId
                    ? employeeId
                    : null;

            const profileLicenseNumber =
                rules.driverFields
                    ? licenseNumber
                    : null;

            const profileLicenseType =
                rules.driverFields
                    ? licenseType
                    : null;

            const profileVehicleNumber =
                rules.driverFields
                    ? vehicleNumber
                    : null;

            /*
             * If the Inspector has not yet been assigned, keep all scope
             * columns NULL. This deliberately makes profileComplete false.
             * The Assistant Commissioner can assign the scope later.
             */
            if (
                user.role === "sanitary_inspector" &&
                (!divisionId || !wardId)
            ) {
                divisionId = null;
                zoneId = null;
                wardId = null;
            }

            /*
             * Scope audit fields are modified only by the supervisor
             * assignment controller, never by this self-service profile
             * endpoint.
             */
            const preservedScopeAssignedBy =
                existingProfile?.scope_assigned_by ?? null;

            const preservedScopeAssignedAt =
                existingProfile?.scope_assigned_at ?? null;

            await connection.execute(
                `
                INSERT INTO user_profiles
                (
                    user_id,
                    full_name,
                    mobile_number,
                    official_email,
                    employee_id,
                    department,
                    designation,
                    office_location,
                    working_shift,
                    official_contact_number,
                    address,
                    city,
                    preferred_language,
                    notification_preference,
                    division_id,
                    zone_id,
                    ward_id,
                    scope_assigned_by,
                    scope_assigned_at,
                    license_number,
                    license_type,
                    vehicle_number,
                    jurisdiction
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON DUPLICATE KEY UPDATE
                    full_name = VALUES(full_name),
                    mobile_number = VALUES(mobile_number),
                    official_email = VALUES(official_email),
                    employee_id = VALUES(employee_id),
                    department = VALUES(department),
                    designation = VALUES(designation),
                    office_location = VALUES(office_location),
                    working_shift = VALUES(working_shift),
                    official_contact_number = VALUES(official_contact_number),
                    address = VALUES(address),
                    city = VALUES(city),
                    preferred_language = VALUES(preferred_language),
                    notification_preference = VALUES(notification_preference),
                    division_id = VALUES(division_id),
                    zone_id = VALUES(zone_id),
                    ward_id = VALUES(ward_id),
                    scope_assigned_by = VALUES(scope_assigned_by),
                    scope_assigned_at = VALUES(scope_assigned_at),
                    license_number = VALUES(license_number),
                    license_type = VALUES(license_type),
                    vehicle_number = VALUES(vehicle_number),
                    jurisdiction = VALUES(jurisdiction)
                `,
                [
                    user.id,
                    fullName,
                    mobileNumber,
                    user.email,
                    profileEmployeeId,
                    department,
                    designation,
                    officeLocation,
                    workingShift,
                    officialContactNumber,
                    address,
                    city,
                    preferredLanguage,
                    notificationPreference,
                    divisionId,
                    zoneId,
                    wardId,
                    preservedScopeAssignedBy,
                    preservedScopeAssignedAt,
                    profileLicenseNumber,
                    profileLicenseType,
                    profileVehicleNumber,
                    jurisdiction
                ]
            );

            /*
             * Driver profile -> drivers table synchronization remains intact.
             */
            if (user.role === "driver") {
                if (!wardId) {
                    throw createHttpError(
                        "Driver ward assignment is required.",
                        400
                    );
                }

                await connection.execute(
                    `
                    INSERT INTO drivers
                    (
                        user_id,
                        employee_id,
                        full_name,
                        mobile_number,
                        email,
                        license_number,
                        license_type,
                        assigned_ward_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        employee_id = VALUES(employee_id),
                        full_name = VALUES(full_name),
                        mobile_number = VALUES(mobile_number),
                        email = VALUES(email),
                        license_number = VALUES(license_number),
                        license_type = VALUES(license_type),
                        assigned_ward_id = VALUES(assigned_ward_id)
                    `,
                    [
                        user.id,
                        profileEmployeeId,
                        fullName,
                        mobileNumber,
                        user.email,
                        profileLicenseNumber,
                        profileLicenseType,
                        wardId
                    ]
                );
            }

            await connection.commit();

            const responseProfile = {
                full_name: fullName,
                mobile_number: mobileNumber,
                official_email: user.email,
                employee_id: profileEmployeeId,
                department,
                designation,
                office_location: officeLocation,
                working_shift: workingShift,
                official_contact_number:
                    officialContactNumber,
                address,
                city,
                preferred_language: preferredLanguage,
                notification_preference:
                    notificationPreference,

                division_id: divisionId,
                zone_id: zoneId,
                ward_id: wardId,

                license_number: profileLicenseNumber,
                license_type: profileLicenseType,
                vehicle_number: profileVehicleNumber,
                jurisdiction,

                scope_assigned_by:
                    preservedScopeAssignedBy
                        ? Number(preservedScopeAssignedBy)
                        : null,
                scope_assigned_at:
                    preservedScopeAssignedAt
            };

            return res.json({
                success: true,
                message: "Profile saved successfully.",
                profileComplete:
                    isProfileCompleteForRole(
                        user.role,
                        responseProfile
                    ),
                profile: responseProfile
            });

        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }

    } catch (error) {
        return sendError(
            res,
            "Unable to save profile.",
            error
        );
    }
}


module.exports = {
    getProfile,
    getReferenceData,
    saveProfile,
    isProfileCompleteForRole
};

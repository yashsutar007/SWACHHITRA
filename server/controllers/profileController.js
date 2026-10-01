const db = require("../config/db");


/*
 * Profile requirements by role.
 *
 * The profile is entered by the authenticated user. It is never created
 * automatically by the login system.
 */
const ROLE_RULES = {
    deputy_commissioner: {
        requiresEmployeeId: true,
        requiresZone: false,
        requiresWard: false,
        driverFields: false
    },

    assistant_commissioner: {
        requiresEmployeeId: true,
        requiresZone: true,
        requiresWard: false,
        driverFields: false
    },

    sanitary_inspector: {
        requiresEmployeeId: true,
        requiresZone: true,
        requiresWard: true,
        driverFields: false
    },

    driver: {
        requiresEmployeeId: true,
        requiresZone: true,
        requiresWard: true,
        driverFields: true
    },

    citizen: {
        requiresEmployeeId: false,
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

    if (!Number.isInteger(number) || number <= 0) {
        return null;
    }

    return number;
}


function isValidMobile(value) {
    return /^[0-9]{10}$/.test(String(value || ""));
}


/*
 * Resolve a zone supplied by the old/current profile form.
 *
 * The preferred input is zone_id.
 * The text fallback keeps the existing profile page usable until its
 * frontend is replaced with the new relational zone/ward selectors.
 */
async function resolveZone(connection, suppliedZoneId, zoneText) {
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
 * Resolve a ward.
 *
 * The preferred input is ward_id.
 * The text fallback accepts values such as:
 *   "Ward 8"
 *   "Ward 8 (Market & Commercial)"
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
                w.ward_number,
                w.ward_code,
                w.ward_name,
                z.zone_code,
                z.zone_name
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
            number: Number(ward.ward_number),
            code: ward.ward_code,
            name: ward.ward_name,
            zoneCode: ward.zone_code,
            zoneName: ward.zone_name
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
              AND w.ward_number = ?
            ORDER BY
                CASE
                    WHEN ? IS NULL THEN 0
                    WHEN w.zone_id = ? THEN 0
                    ELSE 1
                END,
                w.id
            LIMIT 1
            `,
            [numericNumber, expectedZoneId, expectedZoneId]
        );
    } else {
        [rows] = await connection.execute(
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
              AND (
                  LOWER(w.ward_name) = LOWER(?)
                  OR LOWER(w.ward_code) = LOWER(?)
              )
            LIMIT 1
            `,
            [text, text]
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
        number: Number(ward.ward_number),
        code: ward.ward_code,
        name: ward.ward_name,
        zoneCode: ward.zone_code,
        zoneName: ward.zone_name
    };
}


/*
 * GET /api/profile
 *
 * Returns the logged-in user's profile.
 *
 * An authenticated user without a profile gets:
 *   profile: null
 *
 * This allows the frontend to show the manual profile-completion page.
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
                p.zone_id,
                p.ward_id,
                p.license_number,
                p.license_type,
                p.vehicle_number,
                p.jurisdiction,

                z.zone_code,
                z.zone_name,

                w.ward_number,
                w.ward_code,
                w.ward_name

            FROM users u

            LEFT JOIN user_profiles p
                ON p.user_id = u.id

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

        return res.json({
            success: true,

            user: {
                id: Number(row.id),
                email: row.email,
                role: row.role
            },

            profileComplete: hasProfile,

            profile: hasProfile
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

                    zone_id: row.zone_id === null
                        ? null
                        : Number(row.zone_id),

                    ward_id: row.ward_id === null
                        ? null
                        : Number(row.ward_id),

                    zone: row.zone_id === null
                        ? null
                        : row.zone_name,

                    assigned_ward: row.ward_id === null
                        ? null
                        : row.ward_name,

                    license_number: row.license_number,
                    license_type: row.license_type,
                    vehicle_number: row.vehicle_number,
                    jurisdiction: row.jurisdiction
                }
                : null,

            scope: {
                zone: row.zone_id === null
                    ? null
                    : {
                        id: Number(row.zone_id),
                        code: row.zone_code,
                        name: row.zone_name
                    },

                ward: row.ward_id === null
                    ? null
                    : {
                        id: Number(row.ward_id),
                        number: Number(row.ward_number),
                        code: row.ward_code,
                        name: row.ward_name
                    }
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
 * GET /api/profile/reference-data
 *
 * Supplies active zones and wards for the profile form.
 */
async function getReferenceData(req, res) {
    try {
        const [
            [zoneRows],
            [wardRows]
        ] = await Promise.all([
            db.execute(
                `
                SELECT
                    id,
                    zone_code,
                    zone_name
                FROM zones
                WHERE status = 'active'
                ORDER BY zone_name
                `
            ),

            db.execute(
                `
                SELECT
                    w.id,
                    w.zone_id,
                    w.ward_number,
                    w.ward_code,
                    w.ward_name
                FROM wards w
                JOIN zones z
                    ON z.id = w.zone_id
                WHERE w.status = 'active'
                  AND z.status = 'active'
                ORDER BY
                    z.zone_name,
                    w.ward_number
                `
            )
        ]);

        return res.json({
            success: true,

            zones: zoneRows.map(zone => ({
                id: Number(zone.id),
                code: zone.zone_code,
                name: zone.zone_name
            })),

            wards: wardRows.map(ward => ({
                id: Number(ward.id),
                zone_id: Number(ward.zone_id),
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
 * POST /api/profile
 *
 * Saves or updates the authenticated user's profile.
 *
 * The authenticated user's ID always comes from req.currentUser.
 * It is never accepted from the request body.
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

    const department = clean(
        body.department
    );

    const designation = clean(
        body.designation
    );

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

    const address = clean(
        body.address
    );

    const city = clean(
        body.city
    );

    const preferredLanguage = clean(
        body.preferred_language ??
        body.preferredLanguage
    );

    const notificationPreference = clean(
        body.notification_preference ??
        body.notificationPreference
    );

    const licenseNumber = clean(
        body.license_number ??
        body.licenseNumber
    );

    const licenseType = clean(
        body.license_type ??
        body.licenseType
    );

    const vehicleNumber = clean(
        body.vehicle_number ??
        body.vehicleNumber
    );

    const jurisdiction = clean(
        body.jurisdiction
    );

    const zoneIdInput =
        body.zone_id ??
        body.zoneId;

    const wardIdInput =
        body.ward_id ??
        body.wardId;

    /*
     * Compatibility with the current profile form:
     * it currently sends "zone" and "assignedWard" as text.
     */
    const zoneText = clean(
        body.zone
    );

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


        /*
         * Validate basic identity fields.
         */
        if (
            !fullName ||
            fullName.length > 120
        ) {
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
                message:
                    "Employee ID is required."
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


        /*
         * Validate request-supplied relational IDs.
         */
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
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Zone and ward IDs must be valid integers."
            });
        }


        const connection =
            await db.getConnection();

        try {
            await connection.beginTransaction();


            /*
             * Resolve the role's scope.
             *
             * Deputy Commissioner:
             *   Entire city → no zone / ward.
             *
             * Assistant Commissioner:
             *   Zone only.
             *
             * Sanitary Inspector / Driver / Citizen:
             *   Zone + ward.
             */
            let zone = null;
            let ward = null;

            if (
                rules.requiresWard
            ) {
                ward = await resolveWard(
                    connection,
                    suppliedWardId,
                    wardText,
                    suppliedZoneId
                );

                if (ward?.error) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message: ward.error
                    });
                }

                if (!ward) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "Ward assignment is required."
                    });
                }

                zone = await resolveZone(
                    connection,
                    suppliedZoneId,
                    zoneText
                );

                if (zone?.error) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message: zone.error
                    });
                }

                /*
                 * The ward is authoritative for its own zone.
                 * When a zone was explicitly supplied, it must match.
                 */
                if (
                    zone &&
                    Number(zone.id) !==
                        Number(ward.zoneId)
                ) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "Selected ward does not belong to the selected zone."
                    });
                }

                if (!zone) {
                    zone = {
                        id: ward.zoneId,
                        code: ward.zoneCode,
                        name: ward.zoneName
                    };
                }

            } else if (
                rules.requiresZone
            ) {
                zone = await resolveZone(
                    connection,
                    suppliedZoneId,
                    zoneText
                );

                if (zone?.error) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message: zone.error
                    });
                }

                if (!zone) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "Zone assignment is required."
                    });
                }

                ward = null;

            } else {
                zone = null;
                ward = null;
            }


            /*
             * Driver-specific information.
             *
             * For non-driver roles these fields are not stored.
             */
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
             * official_email always comes from the authenticated
             * users table. A client cannot change the login email
             * through profile editing.
             */
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
                    zone_id,
                    ward_id,
                    license_number,
                    license_type,
                    vehicle_number,
                    jurisdiction
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                ON DUPLICATE KEY UPDATE
                    full_name =
                        VALUES(full_name),

                    mobile_number =
                        VALUES(mobile_number),

                    official_email =
                        VALUES(official_email),

                    employee_id =
                        VALUES(employee_id),

                    department =
                        VALUES(department),

                    designation =
                        VALUES(designation),

                    office_location =
                        VALUES(office_location),

                    working_shift =
                        VALUES(working_shift),

                    official_contact_number =
                        VALUES(official_contact_number),

                    address =
                        VALUES(address),

                    city =
                        VALUES(city),

                    preferred_language =
                        VALUES(preferred_language),

                    notification_preference =
                        VALUES(notification_preference),

                    zone_id =
                        VALUES(zone_id),

                    ward_id =
                        VALUES(ward_id),

                    license_number =
                        VALUES(license_number),

                    license_type =
                        VALUES(license_type),

                    vehicle_number =
                        VALUES(vehicle_number),

                    jurisdiction =
                        VALUES(jurisdiction)
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
                    zone?.id ?? null,
                    ward?.id ?? null,
                    profileLicenseNumber,
                    profileLicenseType,
                    profileVehicleNumber,
                    jurisdiction
                ]
            );


            /*
             * Keep the separate drivers table synchronized when a
             * Driver completes or updates their profile.
             */
            if (
                user.role === "driver"
            ) {
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
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                    ON DUPLICATE KEY UPDATE
                        employee_id =
                            VALUES(employee_id),

                        full_name =
                            VALUES(full_name),

                        mobile_number =
                            VALUES(mobile_number),

                        email =
                            VALUES(email),

                        license_number =
                            VALUES(license_number),

                        license_type =
                            VALUES(license_type),

                        assigned_ward_id =
                            VALUES(assigned_ward_id)
                    `,
                    [
                        user.id,
                        profileEmployeeId,
                        fullName,
                        mobileNumber,
                        user.email,
                        profileLicenseNumber,
                        profileLicenseType,
                        ward?.id ?? null
                    ]
                );
            }


            await connection.commit();


            return res.json({
                success: true,

                message:
                    "Profile saved successfully.",

                profile: {
                    full_name: fullName,
                    mobile_number: mobileNumber,
                    official_email: user.email,
                    employee_id:
                        profileEmployeeId,
                    department,
                    designation,
                    office_location:
                        officeLocation,
                    working_shift:
                        workingShift,
                    official_contact_number:
                        officialContactNumber,
                    address,
                    city,
                    preferred_language:
                        preferredLanguage,
                    notification_preference:
                        notificationPreference,

                    zone_id:
                        zone?.id ?? null,

                    ward_id:
                        ward?.id ?? null,

                    zone:
                        zone?.name ?? null,

                    assigned_ward:
                        ward?.name ?? null,

                    license_number:
                        profileLicenseNumber,

                    license_type:
                        profileLicenseType,

                    vehicle_number:
                        profileVehicleNumber,

                    jurisdiction
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;

        } finally {
            connection.release();
        }

    } catch (error) {
        console.error(
            "Profile save error:",
            error
        );

        if (
            error.code === "ER_DUP_ENTRY"
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Employee ID is already in use."
            });
        }

        if (
            error.code === "ER_NO_REFERENCED_ROW_2" ||
            error.code === "ER_ROW_IS_REFERENCED_2"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "The selected zone or ward is no longer valid."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Unable to save profile."
        });
    }
}


module.exports = {
    getProfile,
    getReferenceData,
    saveProfile
};

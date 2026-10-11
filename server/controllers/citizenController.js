const db = require("../config/db");
const crypto = require("crypto");
const {
    pointInsidePolygon,
    getWardPlanningBoundary
} = require("../utils/geography");
const {
    isProfileCompleteForRole
} = require("./profileController");

function clean(value) {
    if (value === undefined || value === null) return null;
    const result = String(value).trim();
    return result || null;
}

function isValidMobile(value) {
    return /^[0-9]{10}$/.test(String(value || ""));
}

function toValidCoordinate(value, min, max) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max
        ? number
        : null;
}

function sendError(res, fallbackMessage, error) {
    const statusCode = Number(error?.statusCode) || 500;

    // Expected client responses (such as a complaint not belonging to the
    // signed-in Citizen) are not application failures. Avoid logging their
    // stack traces as server errors; unexpected 5xx errors remain visible.
    if (statusCode >= 500) {
        console.error(fallbackMessage, error);
    }

    return res.status(statusCode).json({
        success: false,
        message: error?.statusCode && statusCode < 500
            ? error.message
            : fallbackMessage
    });
}

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function sourceRank(source) {
    if (source === "official") return 3;
    if (source === "assistant_defined") return 2;
    if (source === "development") return 1;
    return 0;
}

async function getOperationalWardRows(connection) {
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
           AND z.status = 'active'
        JOIN divisions d
            ON d.id = w.division_id
           AND d.status = 'active'
        WHERE w.status = 'active'
        ORDER BY w.ward_number, w.ward_name, w.id
        `
    );

    return rows;
}

/*
 * Resolve a coordinate against the same saved ward planning boundaries used
 * by the Inspector route-planning model. Official geometry wins over an AC-
 * defined operational boundary, which wins over a development fallback.
 * If multiple polygons remain at the same best authority level, do not guess.
 */
async function findWardAtPoint(connection, latitude, longitude) {
    const wards = await getOperationalWardRows(connection);
    const matches = [];

    for (const ward of wards) {
        const boundary = await getWardPlanningBoundary(
            Number(ward.id),
            ward.ward_code,
            connection
        );

        if (!boundary || !Array.isArray(boundary.polygon)) {
            continue;
        }

        if (pointInsidePolygon([latitude, longitude], boundary.polygon)) {
            matches.push({
                id: Number(ward.id),
                zone_id: Number(ward.zone_id),
                division_id: Number(ward.division_id),
                number: Number(ward.ward_number),
                code: ward.ward_code,
                name: ward.ward_name,
                zone: {
                    id: Number(ward.zone_id),
                    code: ward.zone_code,
                    name: ward.zone_name
                },
                division: {
                    id: Number(ward.division_id),
                    code: ward.division_code,
                    name: ward.division_name
                },
                boundary_source: boundary.source,
                boundary_is_official: boundary.source === "official"
            });
        }
    }

    if (!matches.length) {
        return {
            state: "unmatched",
            ward: null,
            message: "The selected point is not inside any currently supported operational Ward boundary. Move the pin to the correct address or contact the municipal team to verify boundary coverage."
        };
    }

    const bestRank = Math.max(...matches.map(match => sourceRank(match.boundary_source)));
    const bestMatches = matches.filter(match => sourceRank(match.boundary_source) === bestRank);

    if (bestMatches.length !== 1) {
        return {
            state: "ambiguous",
            ward: null,
            message: "The selected point falls on overlapping or shared Ward boundaries. Please place the pin clearly inside one Ward."
        };
    }

    const match = bestMatches[0];
    return {
        state: "matched",
        ward: match,
        message: match.boundary_is_official
            ? "Ward matched using an official saved boundary."
            : match.boundary_source === "assistant_defined"
                ? "Ward matched using an Assistant Commissioner-defined operational boundary. This is an operational area, not a verified official KMC boundary."
                : "Ward matched using a development/demo boundary. This is not an official KMC Ward boundary."
    };
}

async function getCitizenProfile(req, res) {
    try {
        const [rows] = await db.execute(
            `
            SELECT
                u.id AS user_id,
                u.email,
                u.role,
                u.status AS user_status,
                p.full_name,
                p.mobile_number,
                p.official_email,
                p.address,
                p.city,
                p.postal_code,
                p.address_latitude,
                p.address_longitude,
                p.preferred_language,
                p.notification_preference,
                p.zone_id,
                p.ward_id,
                p.division_id,
                z.zone_code,
                z.zone_name,
                w.ward_number,
                w.ward_code,
                w.ward_name,
                d.division_code,
                d.division_name
            FROM users u
            LEFT JOIN user_profiles p
                ON p.user_id = u.id
            LEFT JOIN zones z
                ON z.id = p.zone_id
            LEFT JOIN wards w
                ON w.id = p.ward_id
            LEFT JOIN divisions d
                ON d.id = p.division_id
            WHERE u.id = ?
            LIMIT 1
            `,
            [req.currentUser.id]
        );

        const row = rows[0];
        if (!row || row.role !== "citizen" || row.user_status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Active Citizen account required."
            });
        }

        const profile = row.full_name === null ? null : {
            full_name: row.full_name,
            mobile_number: row.mobile_number,
            official_email: row.official_email || row.email,
            address: row.address,
            city: row.city,
            postal_code: row.postal_code,
            address_latitude: row.address_latitude === null
                ? null : Number(row.address_latitude),
            address_longitude: row.address_longitude === null
                ? null : Number(row.address_longitude),
            preferred_language: row.preferred_language,
            notification_preference: row.notification_preference,
            zone_id: row.zone_id === null ? null : Number(row.zone_id),
            ward_id: row.ward_id === null ? null : Number(row.ward_id),
            division_id: row.division_id === null ? null : Number(row.division_id),
            zone: row.zone_id === null ? null : {
                id: Number(row.zone_id), code: row.zone_code, name: row.zone_name
            },
            ward: row.ward_id === null ? null : {
                id: Number(row.ward_id),
                number: row.ward_number === null ? null : Number(row.ward_number),
                code: row.ward_code,
                name: row.ward_name
            },
            division: row.division_id === null ? null : {
                id: Number(row.division_id), code: row.division_code, name: row.division_name
            }
        };

        if (profile?.ward) {
            const savedBoundary = await getWardPlanningBoundary(
                Number(profile.ward.id),
                profile.ward.code,
                db
            );
            profile.ward.boundary_source = savedBoundary?.source || null;
        }

        return res.json({
            success: true,
            user: {
                id: Number(row.user_id),
                email: row.email,
                role: row.role
            },
            profile,
            profileComplete: isProfileCompleteForRole("citizen", profile),
            wardResolution: profile?.ward ? {
                matched: true,
                ward: profile.ward,
                division: profile.division,
                zone: profile.zone,
                message: "This is the Ward saved for your residential location."
            } : {
                matched: false,
                ward: null,
                message: "Your Ward has not been confirmed from a supported boundary yet."
            }
        });
    } catch (error) {
        return sendError(res, "Unable to load the Citizen profile.", error);
    }
}

async function getCitizenWardAreas(req, res) {
    try {
        const rows = await getOperationalWardRows(db);
        const areas = [];

        for (const ward of rows) {
            const boundary = await getWardPlanningBoundary(
                Number(ward.id),
                ward.ward_code,
                db
            );

            if (!boundary || boundary.polygon.length < 3) continue;

            areas.push({
                ward_id: Number(ward.id),
                ward_number: Number(ward.ward_number),
                ward_code: ward.ward_code,
                ward_name: ward.ward_name,
                zone_id: Number(ward.zone_id),
                zone_name: ward.zone_name,
                division_id: Number(ward.division_id),
                division_name: ward.division_name,
                boundary_source: boundary.source,
                boundary_is_official: boundary.source === "official",
                polygon: boundary.polygon
            });
        }

        return res.json({
            success: true,
            areas,
            guidance: "Ward identification uses saved operational polygons. Some existing development polygons are demonstrative and must not be treated as official KMC boundaries."
        });
    } catch (error) {
        return sendError(res, "Unable to load available Ward boundaries.", error);
    }
}

async function saveCitizenProfile(req, res) {
    const body = req.body || {};
    const fullName = clean(body.full_name);
    const mobileNumber = clean(body.mobile_number);
    const address = clean(body.address);
    const city = clean(body.city);
    const postalCode = clean(body.postal_code);
    const preferredLanguage = clean(body.preferred_language);
    const notificationPreference = clean(body.notification_preference);
    const latitude = toValidCoordinate(body.address_latitude, -90, 90);
    const longitude = toValidCoordinate(body.address_longitude, -180, 180);

    const forbiddenScopeFields = ["ward_id", "zone_id", "division_id", "ward", "zone"];
    if (forbiddenScopeFields.some(key => Object.prototype.hasOwnProperty.call(body, key))) {
        return res.status(400).json({
            success: false,
            code: "CLIENT_SCOPE_FORBIDDEN",
            message: "Do not submit a Ward, Zone or Division. SWACHHITRA derives jurisdiction from the selected location."
        });
    }

    if (!fullName || fullName.length > 120) {
        return res.status(400).json({ success: false, message: "Full name is required and must be at most 120 characters." });
    }
    if (!mobileNumber || !isValidMobile(mobileNumber)) {
        return res.status(400).json({ success: false, message: "Mobile number must contain exactly 10 digits." });
    }
    if (!address || address.length > 255) {
        return res.status(400).json({ success: false, message: "Enter an address of at most 255 characters." });
    }
    if (!city || city.length > 100) {
        return res.status(400).json({ success: false, message: "City is required and must be at most 100 characters." });
    }
    if (!/^\d{6}$/.test(String(postalCode || ""))) {
        return res.status(400).json({ success: false, message: "Enter a valid 6-digit Indian PIN code." });
    }
    if (latitude === null || longitude === null) {
        return res.status(400).json({ success: false, message: "Place a pin at your residential address on the map before saving." });
    }
    if (preferredLanguage && preferredLanguage.length > 40) {
        return res.status(400).json({ success: false, message: "Preferred language is too long." });
    }
    if (notificationPreference && notificationPreference.length > 40) {
        return res.status(400).json({ success: false, message: "Notification preference is too long." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            `SELECT id, email, role, status FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
            [req.currentUser.id]
        );
        const user = userRows[0];
        if (!user || user.role !== "citizen" || user.status !== "active") {
            throw createError("Active Citizen account required.", 403);
        }

        const resolution = await findWardAtPoint(connection, latitude, longitude);
        const ward = resolution.ward;

        await connection.execute(
            `
            INSERT INTO user_profiles
            (
                user_id,
                full_name,
                mobile_number,
                official_email,
                address,
                city,
                postal_code,
                address_latitude,
                address_longitude,
                preferred_language,
                notification_preference,
                division_id,
                zone_id,
                ward_id,
                scope_assigned_by,
                scope_assigned_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            ON DUPLICATE KEY UPDATE
                full_name = VALUES(full_name),
                mobile_number = VALUES(mobile_number),
                official_email = VALUES(official_email),
                address = VALUES(address),
                city = VALUES(city),
                postal_code = VALUES(postal_code),
                address_latitude = VALUES(address_latitude),
                address_longitude = VALUES(address_longitude),
                preferred_language = VALUES(preferred_language),
                notification_preference = VALUES(notification_preference),
                division_id = VALUES(division_id),
                zone_id = VALUES(zone_id),
                ward_id = VALUES(ward_id),
                scope_assigned_by = NULL,
                scope_assigned_at = NULL
            `,
            [
                Number(user.id),
                fullName,
                mobileNumber,
                user.email,
                address,
                city,
                postalCode,
                latitude,
                longitude,
                preferredLanguage,
                notificationPreference,
                ward?.division_id ?? null,
                ward?.zone_id ?? null,
                ward?.id ?? null
            ]
        );

        await connection.commit();

        const completeProfile = {
            full_name: fullName,
            mobile_number: mobileNumber,
            address,
            city,
            postal_code: postalCode,
            address_latitude: latitude,
            address_longitude: longitude,
            zone_id: ward?.zone_id ?? null,
            ward_id: ward?.id ?? null
        };
        const profileComplete = isProfileCompleteForRole("citizen", completeProfile);

        return res.json({
            success: true,
            message: profileComplete
                ? "Citizen profile saved and Ward identified."
                : "Your address was saved, but a supported Ward could not be confirmed. You cannot submit Ward-routed complaints until the location is inside a supported boundary.",
            profileComplete,
            wardResolution: {
                matched: Boolean(ward),
                state: resolution.state,
                ward: ward ? {
                    id: ward.id,
                    number: ward.number,
                    code: ward.code,
                    name: ward.name,
                    boundary_source: ward.boundary_source,
                    boundary_is_official: ward.boundary_is_official
                } : null,
                division: ward?.division || null,
                zone: ward?.zone || null,
                message: resolution.message
            }
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error("Citizen profile rollback failed:", rollbackError);
            }
        }
        return sendError(res, "Unable to save the Citizen profile.", error);
    } finally {
        if (connection) connection.release();
    }
}


/*
 * ---------------------------------------------------------
 * CITIZEN COMPLAINT SUBMISSION & TRACKING
 * ---------------------------------------------------------
 * Routing rule: complaints inherit the Ward saved on the Citizen profile.
 * The request body is never allowed to choose a Ward, Zone or Division.
 * The Inspector API already limits complaint visibility to that Inspector's
 * assigned Ward, so this uses the existing relational scope without changing
 * the database schema.
 */
const ALLOWED_CITIZEN_COMPLAINT_TYPES = new Set([
    "Missed Waste Collection",
    "Illegal Dumping",
    "Overflowing Public Bin",
    "Street Litter / Dirty Area",
    "Blocked Drain",
    "Bulk Waste",
    "Other"
]);

function complaintDateToIso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveComplaintId(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function forbiddenComplaintScope(body) {
    return ["ward_id", "zone_id", "division_id", "ward", "zone", "division"]
        .some(key => Object.prototype.hasOwnProperty.call(body, key));
}

async function getCitizenComplaintProfile(connection, userId, lock = false) {
    const [rows] = await connection.execute(
        `
        SELECT
            u.id AS user_id,
            u.email,
            u.role,
            u.status AS user_status,
            p.full_name,
            p.mobile_number,
            p.address,
            p.city,
            p.postal_code,
            p.address_latitude,
            p.address_longitude,
            p.zone_id,
            p.ward_id,
            p.division_id,
            w.ward_number,
            w.ward_code,
            w.ward_name,
            w.status AS ward_status,
            z.zone_name,
            z.status AS zone_status,
            d.division_name,
            d.status AS division_status
        FROM users u
        LEFT JOIN user_profiles p
            ON p.user_id = u.id
        LEFT JOIN wards w
            ON w.id = p.ward_id
           AND w.division_id = p.division_id
           AND w.zone_id = p.zone_id
        LEFT JOIN zones z
            ON z.id = w.zone_id
        LEFT JOIN divisions d
            ON d.id = w.division_id
        WHERE u.id = ?
        LIMIT 1
        ${lock ? "FOR UPDATE" : ""}
        `,
        [userId]
    );

    return rows[0] || null;
}

function citizenComplaintProfileIsReady(row) {
    if (!row || row.role !== "citizen" || row.user_status !== "active") return false;
    if (row.ward_status !== "active" || row.zone_status !== "active" || row.division_status !== "active") return false;
    return isProfileCompleteForRole("citizen", {
        full_name: row.full_name,
        mobile_number: row.mobile_number,
        address: row.address,
        city: row.city,
        postal_code: row.postal_code,
        address_latitude: row.address_latitude === null ? null : Number(row.address_latitude),
        address_longitude: row.address_longitude === null ? null : Number(row.address_longitude),
        zone_id: row.zone_id,
        ward_id: row.ward_id
    });
}

async function getMyComplaints(req, res) {
    try {
        const [rows] = await db.execute(
            `
            SELECT
                c.id,
                c.complaint_code,
                c.complaint_type,
                c.description,
                c.location_text,
                c.ward_id,
                c.latitude,
                c.longitude,
                c.priority,
                c.status,
                c.reported_at,
                c.resolved_at,
                c.created_at,
                c.updated_at,
                w.ward_number,
                w.ward_code,
                w.ward_name
            FROM complaints c
            LEFT JOIN wards w
                ON w.id = c.ward_id
            WHERE c.citizen_user_id = ?
            ORDER BY c.reported_at DESC, c.id DESC
            `,
            [req.currentUser.id]
        );

        return res.json({
            success: true,
            complaints: rows.map(row => ({
                id: Number(row.id),
                code: row.complaint_code,
                type: row.complaint_type,
                description: row.description,
                location: row.location_text,
                ward: row.ward_id === null ? null : {
                    id: Number(row.ward_id),
                    number: row.ward_number === null ? null : Number(row.ward_number),
                    code: row.ward_code,
                    name: row.ward_name
                },
                priority: row.priority,
                status: row.status,
                reportedAt: complaintDateToIso(row.reported_at),
                resolvedAt: complaintDateToIso(row.resolved_at),
                createdAt: complaintDateToIso(row.created_at),
                updatedAt: complaintDateToIso(row.updated_at),
                coordinates: row.latitude === null || row.longitude === null ? null : {
                    latitude: Number(row.latitude),
                    longitude: Number(row.longitude)
                }
            }))
        });
    } catch (error) {
        return sendError(res, "Unable to load your complaints.", error);
    }
}

async function createCitizenComplaint(req, res) {
    const body = req.body || {};

    if (forbiddenComplaintScope(body)) {
        return res.status(400).json({
            success: false,
            code: "CLIENT_SCOPE_FORBIDDEN",
            message: "Your service Ward is taken from your saved Citizen profile. Do not submit a Ward, Zone or Division."
        });
    }

    const complaintType = clean(body.complaint_type);
    const description = clean(body.description);
    const requestedLocation = clean(body.location_text);

    if (!complaintType || !ALLOWED_CITIZEN_COMPLAINT_TYPES.has(complaintType)) {
        return res.status(400).json({
            success: false,
            code: "INVALID_COMPLAINT_TYPE",
            message: "Choose a valid complaint category."
        });
    }

    if (!description || description.length < 15 || description.length > 2500) {
        return res.status(400).json({
            success: false,
            code: "INVALID_COMPLAINT_DESCRIPTION",
            message: "Describe the sanitation issue in at least 15 and at most 2,500 characters."
        });
    }

    if (requestedLocation && requestedLocation.length > 255) {
        return res.status(400).json({
            success: false,
            code: "INVALID_COMPLAINT_LOCATION",
            message: "The issue location must be 255 characters or fewer."
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const profile = await getCitizenComplaintProfile(
            connection,
            req.currentUser.id,
            true
        );

        if (!profile || profile.role !== "citizen" || profile.user_status !== "active") {
            throw createError("An active Citizen account is required.", 403);
        }

        if (!citizenComplaintProfileIsReady(profile)) {
            throw createError(
                "Complete your residential profile and confirm a supported Ward before submitting a complaint.",
                409
            );
        }

        const wardId = Number(profile.ward_id);
        const divisionId = Number(profile.division_id);

        const [inspectorRows] = await connection.execute(
            `
            SELECT u.id
            FROM users u
            JOIN user_profiles ip
                ON ip.user_id = u.id
            JOIN wards iw
                ON iw.id = ip.ward_id
               AND iw.division_id = ip.division_id
               AND iw.status = 'active'
            JOIN divisions idv
                ON idv.id = iw.division_id
               AND idv.status = 'active'
            WHERE u.role = 'sanitary_inspector'
              AND u.status = 'active'
              AND ip.ward_id = ?
              AND ip.division_id = ?
            LIMIT 1
            `,
            [wardId, divisionId]
        );

        if (!inspectorRows.length) {
            throw createError(
                "No active Sanitary Inspector is currently assigned to your Ward. Your complaint was not submitted. Please contact the municipal team to assign an Inspector first.",
                409
            );
        }

        const complaintCode = `SWC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
        const locationText = requestedLocation || [profile.address, profile.city].filter(Boolean).join(", ");
        const latitude = requestedLocation ? null : Number(profile.address_latitude);
        const longitude = requestedLocation ? null : Number(profile.address_longitude);

        const [insertResult] = await connection.execute(
            `
            INSERT INTO complaints
            (
                complaint_code,
                citizen_user_id,
                complaint_type,
                description,
                location_text,
                ward_id,
                latitude,
                longitude,
                priority,
                status,
                reported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'medium', 'open', NOW())
            `,
            [
                complaintCode,
                Number(profile.user_id),
                complaintType,
                description,
                locationText || null,
                wardId,
                latitude,
                longitude
            ]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Complaint submitted and added to the Inspector queue for your operational Ward.",
            complaint: {
                id: Number(insertResult.insertId),
                code: complaintCode,
                type: complaintType,
                description,
                location: locationText || null,
                ward: {
                    id: wardId,
                    number: profile.ward_number === null ? null : Number(profile.ward_number),
                    code: profile.ward_code,
                    name: profile.ward_name
                },
                priority: "medium",
                status: "open",
                reportedAt: new Date().toISOString()
            },
            routing: {
                method: "ward_scope",
                ward_id: wardId,
                inspectorAvailable: true,
                message: "Inspectors assigned to this same Ward can see the complaint in their Ward-scoped complaint queue."
            }
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error("Citizen complaint rollback failed:", rollbackError);
            }
        }
        return sendError(res, "Unable to submit your complaint.", error);
    } finally {
        if (connection) connection.release();
    }
}

async function cancelCitizenComplaint(req, res) {
    const complaintId = positiveComplaintId(req.params.id);
    if (!complaintId) {
        return res.status(400).json({
            success: false,
            code: "INVALID_COMPLAINT_ID",
            message: "Invalid complaint identifier."
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `
            SELECT id, status
            FROM complaints
            WHERE id = ? AND citizen_user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [complaintId, req.currentUser.id]
        );

        if (!rows.length) {
            throw createError("Complaint not found in your account.", 404);
        }

        if (rows[0].status !== "open") {
            throw createError("Only complaints that are still Open can be cancelled.", 409);
        }

        await connection.execute(
            `UPDATE complaints SET status = 'cancelled', resolved_at = NULL WHERE id = ? AND citizen_user_id = ?`,
            [complaintId, req.currentUser.id]
        );
        await connection.commit();

        return res.json({
            success: true,
            message: "Your complaint has been cancelled."
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error("Citizen complaint cancellation rollback failed:", rollbackError);
            }
        }
        return sendError(res, "Unable to cancel your complaint.", error);
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    getCitizenProfile,
    getCitizenWardAreas,
    saveCitizenProfile,
    findWardAtPoint,
    getMyComplaints,
    createCitizenComplaint,
    cancelCitizenComplaint
};

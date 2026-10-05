const DEVELOPMENT_DIVISION_OPERATIONAL_BOUNDARIES = {
    "DIV-1": {
        source: "development",
        name: "Divisional Office 1 - Gandhi Maidan",
        officeLocation: "Divisional Office No. 1, Gandhi Maidan, Shivaji Peth, Kolhapur",
        center: [16.6928000, 74.2226000],
        polygon: [
            [16.7160000, 74.2020000],
            [16.7200000, 74.2380000],
            [16.7080000, 74.2600000],
            [16.6840000, 74.2610000],
            [16.6660000, 74.2440000],
            [16.6660000, 74.2100000],
            [16.6870000, 74.1950000]
        ]
    }
};

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

const EPSILON = 1e-10;
const BOUNDARY_TOLERANCE = 1e-8;

function pointOnSegment(a, b, point, tolerance = BOUNDARY_TOLERANCE) {
    const ax = Number(a?.[0]);
    const ay = Number(a?.[1]);
    const bx = Number(b?.[0]);
    const by = Number(b?.[1]);
    const px = Number(point?.[0]);
    const py = Number(point?.[1]);

    if (![ax, ay, bx, by, px, py].every(Number.isFinite)) {
        return false;
    }

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared <= EPSILON) {
        return Math.hypot(px - ax, py - ay) <= tolerance;
    }

    const cross = (px - ax) * dy - (py - ay) * dx;

    if (Math.abs(cross) > tolerance) {
        return false;
    }

    const dot = (px - ax) * dx + (py - ay) * dy;

    return (
        dot >= -tolerance &&
        dot <= lengthSquared + tolerance
    );
}

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

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return false;
    }

    for (let i = 0; i < polygon.length; i++) {
        if (
            pointOnSegment(
                polygon[i],
                polygon[(i + 1) % polygon.length],
                [lat, lng]
            )
        ) {
            return true;
        }
    }

    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const yi = Number(polygon[i][0]);
        const xi = Number(polygon[i][1]);
        const yj = Number(polygon[j][0]);
        const xj = Number(polygon[j][1]);

        if (![yi, xi, yj, xj].every(Number.isFinite)) {
            return false;
        }

        if ((yi > lat) !== (yj > lat)) {
            const intersection =
                ((xj - xi) * (lat - yi)) /
                    (yj - yi) +
                xi;

            if (lng < intersection) {
                inside = !inside;
            }
        }
    }

    return inside;
}

function orientation(a, b, c) {
    return (
        (Number(b[0]) - Number(a[0])) *
            (Number(c[1]) - Number(a[1])) -
        (Number(b[1]) - Number(a[1])) *
            (Number(c[0]) - Number(a[0]))
    );
}

function segmentsStrictlyIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    return (
        ((o1 > EPSILON && o2 < -EPSILON) ||
            (o1 < -EPSILON && o2 > EPSILON)) &&
        ((o3 > EPSILON && o4 < -EPSILON) ||
            (o3 < -EPSILON && o4 > EPSILON))
    );
}

function segmentsIntersect(a, b, c, d) {
    if (segmentsStrictlyIntersect(a, b, c, d)) {
        return true;
    }

    return (
        pointOnSegment(a, b, c) ||
        pointOnSegment(a, b, d) ||
        pointOnSegment(c, d, a) ||
        pointOnSegment(c, d, b)
    );
}

function polygonArea(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
        return 0;
    }

    let sum = 0;

    for (let i = 0; i < polygon.length; i++) {
        const current = polygon[i];
        const next = polygon[(i + 1) % polygon.length];

        sum +=
            Number(current[1]) * Number(next[0]) -
            Number(next[1]) * Number(current[0]);
    }

    return Math.abs(sum) / 2;
}

function normalizePolygonPoints(value, maxPoints = 80) {
    if (!Array.isArray(value)) {
        return null;
    }

    const points = value
        .map(point => [
            Number(point?.[0]),
            Number(point?.[1])
        ])
        .filter(point =>
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1])
        );

    if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];

        if (
            Math.abs(first[0] - last[0]) <= BOUNDARY_TOLERANCE &&
            Math.abs(first[1] - last[1]) <= BOUNDARY_TOLERANCE
        ) {
            points.pop();
        }
    }

    if (points.length < 3 || points.length > maxPoints) {
        return null;
    }

    const seen = new Set();

    for (const point of points) {
        if (
            point[0] < -90 ||
            point[0] > 90 ||
            point[1] < -180 ||
            point[1] > 180
        ) {
            return null;
        }

        const key = `${point[0].toFixed(7)},${point[1].toFixed(7)}`;

        if (seen.has(key)) {
            return null;
        }

        seen.add(key);
    }

    if (polygonArea(points) <= 1e-12) {
        return null;
    }

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        for (let j = i + 1; j < points.length; j++) {
            if (
                j === i ||
                j === i + 1 ||
                (i === 0 && j === points.length - 1)
            ) {
                continue;
            }

            const c = points[j];
            const d = points[(j + 1) % points.length];

            if (segmentsStrictlyIntersect(a, b, c, d)) {
                return null;
            }
        }
    }

    return points;
}

function polygonContainedInPolygon(inner, outer) {
    if (
        !Array.isArray(inner) ||
        inner.length < 3 ||
        !Array.isArray(outer) ||
        outer.length < 3
    ) {
        return false;
    }

    for (const point of inner) {
        if (!pointInsidePolygon(point, outer)) {
            return false;
        }
    }

    for (let i = 0; i < inner.length; i++) {
        const a = inner[i];
        const b = inner[(i + 1) % inner.length];

        if (segmentsStrictlyIntersect(a, b, outer[0], outer[1])) {
            return false;
        }

        for (let j = 0; j < outer.length; j++) {
            const c = outer[j];
            const d = outer[(j + 1) % outer.length];

            if (segmentsStrictlyIntersect(a, b, c, d)) {
                return false;
            }
        }

        const fractions = [0.25, 0.5, 0.75];

        for (const fraction of fractions) {
            const sample = [
                Number(a[0]) +
                    (Number(b[0]) - Number(a[0])) * fraction,
                Number(a[1]) +
                    (Number(b[1]) - Number(a[1])) * fraction
            ];

            if (!pointInsidePolygon(sample, outer)) {
                return false;
            }
        }
    }

    return true;
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

    if (!parsed || typeof parsed !== "object") {
        return [];
    }

    if (parsed.type === "Feature") {
        return extractPolygonCoordinates(parsed.geometry);
    }

    if (parsed.type === "FeatureCollection") {
        for (const feature of parsed.features || []) {
            const polygon = extractPolygonCoordinates(feature);

            if (polygon.length >= 3) {
                return polygon;
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

function toGeoJsonPolygon(polygon) {
    const normalized = normalizePolygonPoints(polygon);

    if (!normalized) {
        return null;
    }

    const ring = normalized.map(point => [
        Number(point[1].toFixed(7)),
        Number(point[0].toFixed(7))
    ]);

    ring.push([...ring[0]]);

    return JSON.stringify({
        type: "Polygon",
        coordinates: [ring]
    });
}

async function getWardPlanningBoundary(wardId, wardCode, connection) {
    const [rows] = await connection.execute(
        `
        SELECT boundary_geojson
        FROM ward_boundaries
        WHERE ward_id = ?
          AND is_official = 1
        LIMIT 1
        `,
        [wardId]
    );

    const officialPolygon = extractPolygonCoordinates(
        rows[0]?.boundary_geojson
    );

    if (officialPolygon.length >= 3) {
        return {
            source: "official",
            polygon: officialPolygon
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

async function getOfficialWardBoundary(wardId, connection) {
    const [rows] = await connection.execute(
        `
        SELECT boundary_geojson
        FROM ward_boundaries
        WHERE ward_id = ?
          AND is_official = 1
        LIMIT 1
        `,
        [wardId]
    );

    const polygon = extractPolygonCoordinates(
        rows[0]?.boundary_geojson
    );

    return polygon.length >= 3
        ? {
            source: "official",
            polygon
        }
        : null;
}

function getDivisionPlanningBoundary(divisionId, divisionCode) {
    const key = String(
        divisionCode || divisionId || ""
    ).toUpperCase();

    const record =
        DEVELOPMENT_DIVISION_OPERATIONAL_BOUNDARIES[key] ||
        DEVELOPMENT_DIVISION_OPERATIONAL_BOUNDARIES[
            `DIV-${Number(divisionId)}`
        ];

    if (!record || record.polygon.length < 3) {
        return null;
    }

    return {
        source: record.source,
        name: record.name,
        officeLocation: record.officeLocation,
        center: [...record.center],
        polygon: record.polygon.map(point => [...point])
    };
}

module.exports = {
    DEVELOPMENT_OPERATIONAL_BOUNDARIES,
    DEVELOPMENT_DIVISION_OPERATIONAL_BOUNDARIES,
    pointInsidePolygon,
    pointOnSegment,
    segmentsIntersect,
    segmentsStrictlyIntersect,
    polygonArea,
    normalizePolygonPoints,
    polygonContainedInPolygon,
    extractPolygonCoordinates,
    toGeoJsonPolygon,
    getWardPlanningBoundary,
    getOfficialWardBoundary,
    getDivisionPlanningBoundary
};

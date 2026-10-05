#!/usr/bin/env node
"use strict";

/*
 * SWACHHITRA Part 24
 * Automated regression + security checks for the Inspector operational API.
 *
 * Non-destructive by design:
 * - Never inserts, updates, deletes, or changes application data.
 * - Uses the running local server and the existing MySQL database.
 * - Optional AC checks run only when AC credentials are supplied.
 *
 * Required environment variables:
 *   TEST_INSPECTOR_EMAIL
 *   TEST_INSPECTOR_PASSWORD
 *
 * Optional:
 *   BASE_URL=http://localhost:5000
 *   TEST_AC_EMAIL
 *   TEST_AC_PASSWORD
 *
 * Run from the server directory:
 *   node tests/inspector-regression.test.js
 */

const assert = require("assert");
const db = require("../config/db");

const BASE_URL = String(process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const INSPECTOR_EMAIL = String(process.env.TEST_INSPECTOR_EMAIL || "").trim();
const INSPECTOR_PASSWORD = String(process.env.TEST_INSPECTOR_PASSWORD || "");
const AC_EMAIL = String(process.env.TEST_AC_EMAIL || "").trim();
const AC_PASSWORD = String(process.env.TEST_AC_PASSWORD || "");

if (!INSPECTOR_EMAIL || !INSPECTOR_PASSWORD) {
    console.error("Missing TEST_INSPECTOR_EMAIL or TEST_INSPECTOR_PASSWORD.");
    process.exit(2);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function logPass(label, detail = "") {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` - ${detail}` : ""}`);
}

function logFail(label, detail = "") {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

function logSkip(label, detail = "") {
    skipped += 1;
    console.log(`SKIP  ${label}${detail ? ` - ${detail}` : ""}`);
}

function assertStatus(actual, expected, label) {
    const values = Array.isArray(expected) ? expected : [expected];
    assert.ok(values.includes(actual), `${label}: expected ${values.join("/")}, received ${actual}`);
}

function cookieFromResponse(response) {
    if (typeof response.headers.getSetCookie === "function") {
        const setCookies = response.headers.getSetCookie();
        if (Array.isArray(setCookies) && setCookies.length) {
            return setCookies.map(value => value.split(";", 1)[0]).join("; ");
        }
    }

    const raw = response.headers.get("set-cookie");
    if (!raw) return "";

    const first = raw.split(/,(?=[^;]+?=)/).map(value => value.trim());
    return first
        .map(value => value.split(";", 1)[0])
        .filter(Boolean)
        .join("; ");
}

async function request(path, options = {}, cookie = "") {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (options.body !== undefined && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (cookie) {
        headers.Cookie = cookie;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        redirect: "manual"
    });

    let body = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        body = await response.json().catch(() => null);
    } else {
        body = await response.text().catch(() => "");
    }

    return {
        response,
        status: response.status,
        body,
        cookie: cookieFromResponse(response)
    };
}

async function run(label, fn) {
    try {
        await fn();
        logPass(label);
    } catch (error) {
        logFail(label, error.message);
    }
}

async function dbOne(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows[0] || null;
}

async function dbRows(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

async function main() {
    console.log(`SWACHHITRA Part 24 regression suite`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log("");

    let unauthCookie = "";

    await run("Health endpoint is available", async () => {
        const r = await request("/api/health");
        assertStatus(r.status, 200, "health");
        assert.strictEqual(r.body?.success, true, "health success should be true");
        assert.strictEqual(r.body?.status, "ok", "health status should be ok");
    });

    await run("Unauthenticated Inspector overview is blocked", async () => {
        const r = await request("/api/inspector/overview");
        unauthCookie = r.cookie;
        assertStatus(r.status, 401, "unauthenticated overview");
    });

    await run("Unauthenticated Inspector routes are blocked", async () => {
        const r = await request("/api/inspector/routes");
        assertStatus(r.status, 401, "unauthenticated routes");
    });

    await run("Unauthenticated Inspector mutation is blocked", async () => {
        const r = await request("/api/inspector/routes", {
            method: "POST",
            body: JSON.stringify({})
        });
        assertStatus(r.status, 401, "unauthenticated route mutation");
    });

    let inspectorCookie = "";
    let inspectorCsrfToken = "";
    let inspectorScope = null;

    await run("Inspector login creates a session", async () => {
        const r = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: INSPECTOR_EMAIL,
                password: INSPECTOR_PASSWORD,
                role: "sanitary_inspector"
            })
        });

        assertStatus(r.status, 200, "inspector login");
        assert.strictEqual(r.body?.success, true, "inspector login should succeed");
        assert.strictEqual(r.body?.user?.role, "sanitary_inspector", "session role mismatch");
        assert.ok(r.cookie, "login must return a session cookie");
        inspectorCookie = r.cookie;
    });

    await run("/api/auth/me returns the Inspector identity", async () => {
        const r = await request("/api/auth/me", {}, inspectorCookie);
        assertStatus(r.status, 200, "auth me");
        assert.strictEqual(r.body?.success, true, "auth me should succeed");
        assert.strictEqual(r.body?.user?.role, "sanitary_inspector", "auth me role mismatch");
    });

    await run("Inspector security headers are present", async () => {
        const r = await request("/api/inspector/overview", {}, inspectorCookie);
        assertStatus(r.status, 200, "inspector overview");
        assert.strictEqual(r.response.headers.get("x-content-type-options"), "nosniff");
        assert.strictEqual(r.response.headers.get("x-frame-options"), "DENY");
        assert.strictEqual(
            r.response.headers.get("cache-control"),
            "no-store, no-cache, must-revalidate, private"
        );
    });

    await run("Inspector CSRF token endpoint loads", async () => {
        const r = await request("/api/inspector/security/csrf-token", {}, inspectorCookie);
        assertStatus(r.status, 200, "csrf token");
        assert.strictEqual(r.body?.success, true, "csrf token should succeed");
        assert.ok(r.body?.csrfToken, "csrf token must be returned");
        inspectorCsrfToken = String(r.body.csrfToken);
    });

    await run("Inspector mutation without CSRF is blocked", async () => {
        const r = await request("/api/inspector/routes/999999999", {
            method: "PUT",
            body: JSON.stringify({})
        }, inspectorCookie);
        assertStatus(r.status, 403, "missing csrf mutation");
        assert.ok(
            ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID"].includes(r.body?.code),
            "expected CSRF rejection"
        );
    });

    await run("Inspector mutation with CSRF reaches application authorization", async () => {
        const r = await request("/api/inspector/routes/999999999", {
            method: "PUT",
            headers: {
                "X-CSRF-Token": inspectorCsrfToken
            },
            body: JSON.stringify({})
        }, inspectorCookie);
        assert.ok(
            r.status >= 400 && r.status < 500,
            `expected controlled 4xx from safe unknown-route mutation, received ${r.status}`
        );
        assert.notStrictEqual(r.status, 403, "valid CSRF mutation should reach route validation");
    });

    const readEndpoints = [
        ["Inspector overview", "/api/inspector/overview"],
        ["Inspector routes", "/api/inspector/routes"],
        ["Inspector vehicles", "/api/inspector/vehicles"],
        ["Inspector drivers", "/api/inspector/drivers"],
        ["Inspector assignments", "/api/inspector/assignments"],
        ["Inspector collections", "/api/inspector/collections"],
        ["Inspector collection integrity", "/api/inspector/collections/integrity"],
        ["Inspector complaints", "/api/inspector/complaints"],
        ["Inspector notifications", "/api/inspector/notifications"],
        ["Inspector wards", "/api/inspector/wards"],
        ["Inspector zones compatibility endpoint", "/api/inspector/zones"]
    ];

    for (const [label, endpoint] of readEndpoints) {
        await run(`${label} loads`, async () => {
            const r = await request(endpoint, {}, inspectorCookie);
            assertStatus(r.status, 200, endpoint);
            assert.notStrictEqual(r.body?.success, false, `${endpoint} returned success=false`);
        });
    }

    await run("Inspector scope contains exactly one operational ward", async () => {
        const r = await request("/api/inspector/wards", {}, inspectorCookie);
        assertStatus(r.status, 200, "wards");
        assert.ok(Array.isArray(r.body?.wards), "wards response should contain wards[]");
        assert.strictEqual(r.body.wards.length, 1, "Inspector should have exactly one assigned ward");
        inspectorScope = r.body.wards[0];
        assert.ok(Number.isInteger(Number(inspectorScope.id)), "ward id should be numeric");
    });

    await run("Collection integrity endpoint reports zero invalid records", async () => {
        const r = await request("/api/inspector/collections/integrity", {}, inspectorCookie);
        assertStatus(r.status, 200, "collection integrity");
        assert.strictEqual(r.body?.success, true, "collection integrity should succeed");

        const invalid = Number(
            r.body?.summary?.invalidRecords ??
            r.body?.invalidRecords?.length ??
            0
        );

        assert.strictEqual(invalid, 0, `collection integrity reported ${invalid} invalid record(s)`);
    });

    await run("Unknown route stop endpoint never returns 500", async () => {
        const r = await request("/api/inspector/routes/999999999/stops", {}, inspectorCookie);
        assert.ok(r.status >= 400 && r.status < 500, `unknown route should return 4xx, received ${r.status}`);
    });

    await run("Malformed route id never returns 500", async () => {
        const r = await request("/api/inspector/routes/not-a-number/stops", {}, inspectorCookie);
        assert.ok(r.status >= 400 && r.status < 500, `malformed route id should return 4xx, received ${r.status}`);
    });

    await run("Current Inspector scope exists in the database", async () => {
        const row = await dbOne(
            `
            SELECT
                p.user_id,
                p.division_id,
                p.ward_id,
                d.division_code,
                d.division_name,
                w.ward_code,
                w.ward_number,
                w.ward_name
            FROM user_profiles p
            JOIN divisions d ON d.id = p.division_id
            JOIN wards w ON w.id = p.ward_id
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = (
                SELECT id FROM users WHERE email = ? LIMIT 1
            )
              AND u.role = 'sanitary_inspector'
              AND u.status = 'active'
            LIMIT 1
            `,
            [INSPECTOR_EMAIL.toLowerCase()]
        );

        assert.ok(row, "Inspector profile scope was not found");
        assert.ok(row.division_id, "Inspector division_id is missing");
        assert.ok(row.ward_id, "Inspector ward_id is missing");
    });

    await run("No duplicate active vehicle assignments exist", async () => {
        const rows = await dbRows(`
            SELECT vehicle_id
            FROM route_assignments
            WHERE status IN ('assigned', 'active', 'delayed')
            GROUP BY vehicle_id
            HAVING COUNT(*) > 1
        `);
        assert.strictEqual(rows.length, 0, `${rows.length} vehicle(s) have multiple active assignments`);
    });

    await run("No duplicate active driver assignments exist", async () => {
        const rows = await dbRows(`
            SELECT driver_id
            FROM route_assignments
            WHERE status IN ('assigned', 'active', 'delayed')
            GROUP BY driver_id
            HAVING COUNT(*) > 1
        `);
        assert.strictEqual(rows.length, 0, `${rows.length} driver(s) have multiple active assignments`);
    });

    await run("No route stop total mismatches exist", async () => {
        const rows = await dbRows(`
            SELECT r.id
            FROM routes r
            LEFT JOIN route_stops s ON s.route_id = r.id
            GROUP BY r.id, r.total_stops, r.completed_stops
            HAVING r.total_stops <> COUNT(s.id)
                OR r.completed_stops <> COALESCE(SUM(s.status = 'collected'), 0)
        `);
        assert.strictEqual(rows.length, 0, `${rows.length} route(s) have cached stop total mismatches`);
    });

    await run("No orphan route stops exist", async () => {
        const rows = await dbRows(`
            SELECT s.id
            FROM route_stops s
            LEFT JOIN routes r ON r.id = s.route_id
            WHERE r.id IS NULL
        `);
        assert.strictEqual(rows.length, 0, `${rows.length} orphan route stop(s) found`);
    });

    await run("Completed/cancelled routes have no active assignments", async () => {
        const rows = await dbRows(`
            SELECT r.id
            FROM routes r
            JOIN route_assignments ra ON ra.route_id = r.id
            WHERE r.status IN ('completed', 'cancelled')
              AND ra.status IN ('assigned', 'active', 'delayed')
        `);
        assert.strictEqual(rows.length, 0, `${rows.length} completed/cancelled route(s) retain active assignments`);
    });

    await run("Vehicle image_path is absent from the live schema", async () => {
        const rows = await dbRows("SHOW COLUMNS FROM vehicles LIKE 'image_path'");
        assert.strictEqual(rows.length, 0, "vehicles.image_path still exists");
    });

    if (inspectorScope?.id) {
        await run("Inspector cannot read stops belonging to another ward", async () => {
            const outside = await dbOne(
                `
                SELECT id
                FROM routes
                WHERE ward_id <> ?
                  AND status <> 'cancelled'
                ORDER BY id
                LIMIT 1
                `,
                [Number(inspectorScope.id)]
            );

            if (!outside) {
                logSkip("Inspector cross-scope route boundary", "No route outside the assigned ward exists");
                return;
            }

            const r = await request(`/api/inspector/routes/${outside.id}/stops`, {}, inspectorCookie);
            assert.ok(
                [403, 404].includes(r.status),
                `cross-scope route must be denied with 403/404, received ${r.status}`
            );
        });
    }

    if (AC_EMAIL && AC_PASSWORD) {
        let acCookie = "";

        await run("Assistant Commissioner login creates a session", async () => {
            const r = await request("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({
                    email: AC_EMAIL,
                    password: AC_PASSWORD,
                    role: "assistant_commissioner"
                })
            });

            assertStatus(r.status, 200, "AC login");
            assert.strictEqual(r.body?.user?.role, "assistant_commissioner", "AC role mismatch");
            assert.ok(r.cookie, "AC login must return a session cookie");
            acCookie = r.cookie;
        });

        await run("Assistant Commissioner can read Inspector operational routes", async () => {
            const r = await request("/api/inspector/routes", {}, acCookie);
            assertStatus(r.status, 200, "AC route read");
        });

        await run("Assistant Commissioner cannot use Inspector-only vehicle mutation", async () => {
            const r = await request("/api/inspector/vehicles", {
                method: "POST",
                body: JSON.stringify({})
            }, acCookie);
            assertStatus(r.status, 403, "AC vehicle mutation");
        });

        await run("Assistant Commissioner cannot use Inspector-only route mutation", async () => {
            const r = await request("/api/inspector/routes", {
                method: "POST",
                body: JSON.stringify({})
            }, acCookie);
            assertStatus(r.status, 403, "AC route mutation");
        });
    } else {
        logSkip("Assistant Commissioner authorization matrix", "Set TEST_AC_EMAIL and TEST_AC_PASSWORD to run AC checks");
    }

    await run("Inspector logout destroys the session", async () => {
        const r = await request("/api/auth/logout", {
            method: "POST"
        }, inspectorCookie);
        assertStatus(r.status, 200, "logout");
        assert.strictEqual(r.body?.success, true, "logout should succeed");
    });

    await run("Logged-out Inspector session is rejected", async () => {
        const r = await request("/api/auth/me", {}, inspectorCookie);
        assertStatus(r.status, 401, "auth me after logout");
    });

    try {
        await db.end();
    } catch (_) {
        // Keep the final test result authoritative even if pool shutdown fails.
    }

    console.log("");
    console.log(`Result: ${passed} passed, ${failed} failed, ${skipped} skipped`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch(async error => {
    console.error("FATAL  Part 24 test runner failed:", error);
    try {
        await db.end();
    } catch (_) {
        // Ignore shutdown errors after a fatal test runner error.
    }
    process.exit(1);
});

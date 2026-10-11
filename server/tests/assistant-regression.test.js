#!/usr/bin/env node
"use strict";

/*
 * SWACHHITRA Part 9
 * Assistant Commissioner regression, integration and security checks.
 *
 * Non-destructive by design:
 * - No INSERT / UPDATE / DELETE statements are issued by this suite.
 * - Unknown entity IDs are used for mutation-reachability checks.
 * - Database reads verify current scope/integrity only.
 *
 * Required:
 *   TEST_AC_EMAIL
 *   TEST_AC_PASSWORD
 *
 * Optional:
 *   BASE_URL=http://localhost:5000
 *
 * Run from server/:
 *   node tests/assistant-regression.test.js
 */

const assert = require("assert");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const BASE_URL = String(
    process.env.BASE_URL || "http://localhost:5000"
).replace(/\/$/, "");
const AC_EMAIL = String(
    process.env.TEST_AC_EMAIL || ""
).trim();
const AC_PASSWORD = String(
    process.env.TEST_AC_PASSWORD || ""
);

if (!AC_EMAIL || !AC_PASSWORD) {
    console.error(
        "Missing TEST_AC_EMAIL or TEST_AC_PASSWORD."
    );
    process.exit(2);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function logPass(label, detail = "") {
    passed += 1;
    console.log(
        `PASS  ${label}${detail ? ` - ${detail}` : ""}`
    );
}

function logFail(label, detail = "") {
    failed += 1;
    console.error(
        `FAIL  ${label}${detail ? ` - ${detail}` : ""}`
    );
}

function logSkip(label, detail = "") {
    skipped += 1;
    console.log(
        `SKIP  ${label}${detail ? ` - ${detail}` : ""}`
    );
}

function assertStatus(actual, expected, label) {
    const values = Array.isArray(expected)
        ? expected
        : [expected];

    assert.ok(
        values.includes(actual),
        `${label}: expected ${values.join("/")}, received ${actual}`
    );
}

function cookieFromResponse(response) {
    if (
        typeof response.headers.getSetCookie === "function"
    ) {
        const setCookies = response.headers.getSetCookie();

        if (
            Array.isArray(setCookies) &&
            setCookies.length
        ) {
            return setCookies
                .map(value => value.split(";", 1)[0])
                .join("; ");
        }
    }

    const raw = response.headers.get("set-cookie");

    if (!raw) {
        return "";
    }

    return raw
        .split(/,(?=[^;]+?=)/)
        .map(value => value.trim())
        .map(value => value.split(";", 1)[0])
        .filter(Boolean)
        .join("; ");
}

async function request(endpoint, options = {}, cookie = "") {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (
        options.body !== undefined &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] = "application/json";
    }

    if (cookie) {
        headers.Cookie = cookie;
    }

    const response = await fetch(
        `${BASE_URL}${endpoint}`,
        {
            ...options,
            headers,
            redirect: "manual"
        }
    );

    const contentType = String(
        response.headers.get("content-type") || ""
    );

    let body;

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
    console.log("SWACHHITRA Part 9 AC regression suite");
    console.log(`Base URL: ${BASE_URL}`);
    console.log("");

    let acCookie = "";
    let csrfToken = "";
    let acScope = null;

    await run(
        "Health endpoint is available",
        async () => {
            const r = await request("/api/health");
            assertStatus(r.status, 200, "health");
            assert.strictEqual(
                r.body?.success,
                true,
                "health success should be true"
            );
            assert.strictEqual(
                r.body?.status,
                "ok",
                "health status should be ok"
            );
        }
    );

    await run(
        "Unauthenticated AC overview is blocked",
        async () => {
            const r = await request(
                "/api/assistant/overview"
            );
            assertStatus(r.status, 401, "AC overview auth");
        }
    );

    await run(
        "Unauthenticated AC reports are blocked",
        async () => {
            const r = await request(
                "/api/assistant/reports"
            );
            assertStatus(r.status, 401, "AC reports auth");
        }
    );

    await run(
        "Unauthenticated AC mutation is blocked",
        async () => {
            const r = await request(
                "/api/assistant/division-area",
                {
                    method: "PUT",
                    body: JSON.stringify({})
                }
            );
            assertStatus(
                r.status,
                401,
                "unauthenticated AC mutation"
            );
        }
    );

    await run(
        "Assistant Commissioner login creates a session",
        async () => {
            const r = await request(
                "/api/auth/login",
                {
                    method: "POST",
                    body: JSON.stringify({
                        email: AC_EMAIL,
                        password: AC_PASSWORD,
                        role: "assistant_commissioner"
                    })
                }
            );

            assertStatus(r.status, 200, "AC login");
            assert.strictEqual(
                r.body?.user?.role,
                "assistant_commissioner",
                "AC role mismatch"
            );
            assert.ok(
                r.cookie,
                "AC login must return a session cookie"
            );
            acCookie = r.cookie;
        }
    );

    await run(
        "AC security headers are present",
        async () => {
            const r = await request(
                "/api/assistant/overview",
                {},
                acCookie
            );

            assertStatus(r.status, 200, "AC overview");
            assert.strictEqual(
                r.response.headers.get(
                    "x-content-type-options"
                ),
                "nosniff"
            );
            assert.strictEqual(
                r.response.headers.get("x-frame-options"),
                "DENY"
            );
            assert.strictEqual(
                r.response.headers.get("cache-control"),
                "no-store, no-cache, must-revalidate, private"
            );
        }
    );

    await run(
        "AC dashboard page sends a Content-Security-Policy",
        async () => {
            const response = await fetch(
                `${BASE_URL}/assistantDash/`,
                {
                    headers: {
                        Cookie: acCookie
                    },
                    redirect: "manual"
                }
            );

            assertStatus(
                response.status,
                200,
                "AC dashboard page"
            );

            const csp = response.headers.get(
                "content-security-policy"
            );

            assert.ok(csp, "CSP header should be present");
            assert.ok(
                csp.includes("frame-ancestors 'none'"),
                "CSP should block framing"
            );
            assert.ok(
                csp.includes("https://router.project-osrm.org"),
                "CSP should allow OSRM routing"
            );
        }
    );

    await run(
        "AC CSRF token endpoint loads",
        async () => {
            const r = await request(
                "/api/assistant/security/csrf-token",
                {},
                acCookie
            );

            assertStatus(r.status, 200, "AC CSRF endpoint");
            assert.strictEqual(
                r.body?.success,
                true,
                "CSRF request should succeed"
            );
            assert.ok(
                r.body?.csrfToken,
                "CSRF token must be returned"
            );
            csrfToken = String(r.body.csrfToken);
        }
    );

    const mutationEndpoints = [
        [
            "route review",
            "/api/assistant/route-change-requests/999999999/review",
            "PUT",
            { decision: "approved" }
        ],
        [
            "ward create",
            "/api/assistant/wards",
            "POST",
            {}
        ],
        [
            "ward boundary update",
            "/api/assistant/wards/999999999/boundary",
            "PUT",
            {}
        ],
        [
            "division area update",
            "/api/assistant/division-area",
            "PUT",
            {}
        ],
        [
            "Inspector scope assignment",
            "/api/assistant/inspectors/999999999/scope",
            "PUT",
            {}
        ]
    ];

    for (const [label, endpoint, method, body] of mutationEndpoints) {
        await run(
            `${label} without CSRF is blocked`,
            async () => {
                const r = await request(
                    endpoint,
                    {
                        method,
                        body: JSON.stringify(body)
                    },
                    acCookie
                );

                assertStatus(r.status, 403, `${label} no csrf`);
                assert.ok(
                    [
                        "CSRF_TOKEN_MISSING",
                        "CSRF_TOKEN_INVALID"
                    ].includes(r.body?.code),
                    "expected CSRF rejection"
                );
            }
        );
    }

    await run(
        "Valid CSRF reaches route-review validation",
        async () => {
            const r = await request(
                "/api/assistant/route-change-requests/not-a-number/review",
                {
                    method: "PUT",
                    headers: {
                        "X-CSRF-Token": csrfToken
                    },
                    body: JSON.stringify({
                        decision: "approved"
                    })
                },
                acCookie
            );

            assert.ok(
                r.status >= 400 && r.status < 500,
                `expected controlled 4xx, received ${r.status}`
            );
            assert.notStrictEqual(
                r.status,
                403,
                "valid CSRF should reach application validation"
            );
        }
    );

    await run(
        "AC overview loads",
        async () => {
            const r = await request(
                "/api/assistant/overview",
                {},
                acCookie
            );
            assertStatus(r.status, 200, "overview");
            assert.strictEqual(
                r.body?.success,
                true,
                "overview should succeed"
            );
            acScope = r.body?.scope || null;
            assert.ok(
                Number.isInteger(Number(acScope?.division_id)),
                "overview division scope missing"
            );
        }
    );

    const readEndpoints = [
        ["AC map", "/api/assistant/map"],
        ["AC supervision", "/api/assistant/supervision"],
        ["AC reports", "/api/assistant/reports"],
        ["AC wards", "/api/assistant/wards"],
        ["AC inspectors", "/api/assistant/inspectors"]
    ];

    for (const [label, endpoint] of readEndpoints) {
        await run(
            `${label} loads`,
            async () => {
                const r = await request(
                    endpoint,
                    {},
                    acCookie
                );
                assertStatus(r.status, 200, endpoint);
                assert.strictEqual(
                    r.body?.success,
                    true,
                    `${endpoint} returned success=false`
                );
            }
        );
    }

    await run(
        "Reports reject reversed date range",
        async () => {
            const r = await request(
                "/api/assistant/reports?from_date=2026-10-10&to_date=2026-10-01",
                {},
                acCookie
            );
            assertStatus(r.status, 400, "reversed report range");
        }
    );

    await run(
        "Reports reject a period longer than 366 days",
        async () => {
            const r = await request(
                "/api/assistant/reports?from_date=2024-01-01&to_date=2025-01-03",
                {},
                acCookie
            );
            assertStatus(r.status, 400, "long report range");
        }
    );

    await run(
        "AC ward response is restricted to the authenticated Division",
        async () => {
            const r = await request(
                "/api/assistant/wards",
                {},
                acCookie
            );

            assertStatus(r.status, 200, "wards");
            const rows = Array.isArray(r.body?.wards)
                ? r.body.wards
                : [];

            for (const ward of rows) {
                assert.strictEqual(
                    Number(ward.division_id),
                    Number(acScope.division_id),
                    `ward ${ward.id} leaked outside AC division`
                );
            }
        }
    );

    await run(
        "AC inspector response is restricted to the authenticated Division",
        async () => {
            const r = await request(
                "/api/assistant/inspectors",
                {},
                acCookie
            );

            assertStatus(r.status, 200, "inspectors");
            const rows = Array.isArray(r.body?.inspectors)
                ? r.body.inspectors
                : [];

            for (const inspector of rows) {
                const inspectorDivision =
                    inspector.scope?.division_id === null
                        ? null
                        : Number(inspector.scope?.division_id);

                if (inspectorDivision !== null) {
                    assert.strictEqual(
                        inspectorDivision,
                        Number(acScope.division_id),
                        `Inspector ${inspector.user_id} leaked outside AC division`
                    );
                }

                if (inspectorDivision === null) {
                    assert.strictEqual(
                        inspector.assignment_state,
                        "unassigned",
                        `Inspector ${inspector.user_id} has no division but is not marked unassigned`
                    );
                }
            }
        }
    );

    await run(
        "AC reports return a coherent reporting period",
        async () => {
            const r = await request(
                "/api/assistant/reports?from_date=2026-10-01&to_date=2026-10-08",
                {},
                acCookie
            );

            assertStatus(r.status, 200, "reports period");
            assert.strictEqual(
                Number(r.body?.scope?.division_id),
                Number(acScope.division_id),
                "reports division mismatch"
            );
            assert.strictEqual(
                r.body?.period?.from_date,
                "2026-10-01",
                "report period start mismatch"
            );
            assert.strictEqual(
                r.body?.period?.to_date,
                "2026-10-08",
                "report period end mismatch"
            );
        }
    );

    await run(
        "No active route is missing a valid ward relationship",
        async () => {
            const rows = await dbRows(`
                SELECT r.id
                FROM routes r
                LEFT JOIN wards w ON w.id = r.ward_id
                WHERE r.status <> 'cancelled'
                  AND w.id IS NULL
            `);

            assert.strictEqual(
                rows.length,
                0,
                `${rows.length} active route(s) reference missing wards`
            );
        }
    );

    await run(
        "No ward has a conflicting division relationship",
        async () => {
            const rows = await dbRows(`
                SELECT w.id
                FROM wards w
                LEFT JOIN divisions d ON d.id = w.division_id
                WHERE w.division_id IS NOT NULL
                  AND d.id IS NULL
            `);

            assert.strictEqual(
                rows.length,
                0,
                `${rows.length} ward(s) reference missing divisions`
            );
        }
    );

    await run(
        "Current AC profile scope exists in the database",
        async () => {
            const row = await dbOne(
                `
                SELECT
                    p.user_id,
                    p.division_id,
                    d.division_code,
                    d.status
                FROM user_profiles p
                JOIN users u ON u.id = p.user_id
                JOIN divisions d ON d.id = p.division_id
                WHERE u.email = ?
                  AND u.role = 'assistant_commissioner'
                  AND u.status = 'active'
                LIMIT 1
                `,
                [AC_EMAIL.toLowerCase()]
            );

            assert.ok(row, "AC profile scope was not found");
            assert.ok(
                row.division_id,
                "AC division_id is missing"
            );
            assert.strictEqual(
                row.status,
                "active",
                "AC division is not active"
            );
        }
    );

    await run(
        "AC cannot use Inspector-only vehicle mutation",
        async () => {
            const r = await request(
                "/api/inspector/vehicles",
                {
                    method: "POST",
                    body: JSON.stringify({})
                },
                acCookie
            );

            assertStatus(
                r.status,
                403,
                "AC Inspector vehicle mutation"
            );
        }
    );

    await run(
        "AC cannot use Inspector-only route mutation",
        async () => {
            const r = await request(
                "/api/inspector/routes",
                {
                    method: "POST",
                    body: JSON.stringify({})
                },
                acCookie
            );

            assertStatus(
                r.status,
                403,
                "AC Inspector route mutation"
            );
        }
    );

    await run(
        "Unknown Inspector scope target returns controlled validation",
        async () => {
            const r = await request(
                "/api/assistant/inspectors/999999999/scope",
                {
                    method: "PUT",
                    headers: {
                        "X-CSRF-Token": csrfToken
                    },
                    body: JSON.stringify({})
                },
                acCookie
            );

            assert.ok(
                r.status >= 400 && r.status < 500,
                `expected controlled 4xx, received ${r.status}`
            );
        }
    );

    await run(
        "Assistant Commissioner logout destroys the session",
        async () => {
            const r = await request(
                "/api/auth/logout",
                {
                    method: "POST"
                },
                acCookie
            );
            assertStatus(r.status, 200, "AC logout");
            assert.strictEqual(
                r.body?.success,
                true,
                "AC logout should succeed"
            );
        }
    );

    await run(
        "Logged-out AC session is rejected",
        async () => {
            const r = await request(
                "/api/auth/me",
                {},
                acCookie
            );
            assertStatus(r.status, 401, "AC auth me after logout");
        }
    );

    // Static contract checks supplement runtime checks.
    await run(
        "Assistant route/controller security contract is present",
        async () => {
            const routes = fs.readFileSync(
                path.join(__dirname, "../routes/assistantRoutes.js"),
                "utf8"
            );
            const security = fs.readFileSync(
                path.join(__dirname, "../middleware/assistantSecurityMiddleware.js"),
                "utf8"
            );
            const controller = fs.readFileSync(
                path.join(__dirname, "../controllers/assistantController.js"),
                "utf8"
            );

            assert.ok(
                routes.includes("ensureAssistantCsrfToken"),
                "CSRF route contract missing"
            );
            assert.ok(
                routes.includes("requireAssistantMutationSecurity"),
                "mutation security middleware missing"
            );
            assert.ok(
                security.includes("CSRF_TOKEN_INVALID"),
                "CSRF rejection path missing"
            );
            assert.ok(
                controller.includes("getReportsAnalytics"),
                "reports controller missing"
            );
        }
    );

    try {
        await db.end();
    } catch (_) {
        // Keep the test result authoritative if pool shutdown fails.
    }

    console.log("");
    console.log(
        `Result: ${passed} passed, ${failed} failed, ${skipped} skipped`
    );

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch(async error => {
    console.error(
        "FATAL  Part 9 test runner failed:",
        error
    );

    try {
        await db.end();
    } catch (_) {
        // Ignore shutdown errors after a fatal test-runner error.
    }

    process.exit(1);
});

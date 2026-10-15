const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const BASE_URL = String(process.env.TEST_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const CITIZEN_EMAIL = String(process.env.TEST_CITIZEN_EMAIL || "").trim().toLowerCase();
const CITIZEN_PASSWORD = String(process.env.TEST_CITIZEN_PASSWORD || "");
const INSPECTOR_EMAIL = String(process.env.TEST_INSPECTOR_EMAIL || "").trim().toLowerCase();
const INSPECTOR_PASSWORD = String(process.env.TEST_INSPECTOR_PASSWORD || "");

let passed = 0;
let failed = 0;
let skipped = 0;
let citizenCookie = "";
let inspectorCookie = "";
let inspectorCsrfToken = "";
let csrfToken = "";
let citizenUserId = null;
let citizenWardId = null;
let citizenProfileComplete = false;
let integrationComplaintId = null;
let integrationComplaintCode = "";

function pass(label) {
    passed += 1;
    console.log(`PASS  ${label}`);
}

function fail(label, error) {
    failed += 1;
    console.error(`FAIL  ${label} - ${error?.message || error}`);
}

function skip(label, reason) {
    skipped += 1;
    console.log(`SKIP  ${label} - ${reason}`);
}

function isLocalServerUnavailable(error) {
    const localBase = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL);
    const code = error?.cause?.code || error?.code;
    return localBase && (
        ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code) ||
        (error instanceof TypeError && /fetch failed/i.test(error.message))
    );
}

async function test(label, fn) {
    try {
        await fn();
        pass(label);
    } catch (error) {
        if (error?.code === "LOCAL_TEST_SERVER_UNAVAILABLE") skip(label, error.message);
        else fail(label, error);
    }
}

function assertStatus(actual, expected, label) {
    assert.equal(actual, expected, `${label}: expected ${expected}, received ${actual}`);
}

function cookieFrom(response) {
    const header = response.headers.get("set-cookie") || "";
    return header.split(";")[0];
}

async function request(path, options = {}, cookie = "") {
    const headers = { ...(options.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            redirect: "manual",
            ...options,
            headers
        });
    } catch (error) {
        if (isLocalServerUnavailable(error)) {
            const unavailable = new Error(`Local test server is unavailable at ${BASE_URL}; start server.js to run live integration checks.`);
            unavailable.code = "LOCAL_TEST_SERVER_UNAVAILABLE";
            throw unavailable;
        }
        throw error;
    }
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* HTML page or empty body */ }
    return { status: response.status, body, response, raw };
}

async function main() {
    console.log("SWACHHITRA Citizen Part 1–5 regression suite");
    console.log(`Base URL: ${BASE_URL}`);
    console.log("");

    await test("Complaint search has accessible live suggestions and remains client-side only", async () => {
        const html = fs.readFileSync(path.join(PROJECT_ROOT, "client/citizenDash/citizenDash.html"), "utf8");
        const js = fs.readFileSync(path.join(PROJECT_ROOT, "client/citizenDash/citizenDash.js"), "utf8");
        const css = fs.readFileSync(path.join(PROJECT_ROOT, "client/citizenDash/citizenDash.css"), "utf8");
        assert.match(html, /id="complaintSearchSuggestions"/);
        assert.match(html, /aria-autocomplete="list"/);
        assert.match(js, /function handleComplaintSearchInput\(event\)/);
        const handler = js.match(/function handleComplaintSearchInput\(event\)\s*\{([\s\S]*?)\n    \}/);
        assert.ok(handler, "search input handler should be present");
        assert.doesNotMatch(handler[1], /\b(?:api|mutate|fetch)\s*\(/i, "typing should not call a backend mutation or network endpoint");
        assert.doesNotMatch(handler[1], /cancel/i, "typing should not trigger complaint cancellation");
        assert.match(css, /\.complaint-search-suggestions/);
        assert.match(css, /\.search-match-focus/);
    });

    await test("Inspector complaint status update route is registered for Sanitary Inspectors", async () => {
        const routes = fs.readFileSync(path.join(PROJECT_ROOT, "server/routes/inspectorRoutes.js"), "utf8");
        // The route must retain both role authorization and CSRF/origin/rate-limit
        // middleware before reaching the mutation controller.
        assert.match(
            routes,
            /router\.put\(\s*["']\/complaints\/:id["']\s*,\s*requireInspectorWrite\s*,\s*requireInspectorMutationSecurity\s*,\s*updateComplaint\s*\)/s
        );
    });

    await test("Citizen live tracking page contract keeps the map scoped and avoids driver identity", async () => {
        const routes = fs.readFileSync(path.join(PROJECT_ROOT, "server/routes/citizenRoutes.js"), "utf8");
        const controller = fs.readFileSync(path.join(PROJECT_ROOT, "server/controllers/citizenController.js"), "utf8");
        const html = fs.readFileSync(path.join(PROJECT_ROOT, "client/citizenDash/citizenDash.html"), "utf8");
        const js = fs.readFileSync(path.join(PROJECT_ROOT, "client/citizenDash/citizenDash.js"), "utf8");
        assert.match(routes, /router\.use\(requireRole\("citizen"\)\)/);
        assert.match(routes, /router\.get\("\/live-tracking", getCitizenLiveTracking\)/);
        assert.match(controller, /WHERE r\.ward_id = \?/);
        assert.doesNotMatch(controller.match(/async function getCitizenLiveTracking\(req, res\)[\s\S]*?\n\}/)?.[0] || "", /driver_name|phone|mobile_number/);
        assert.match(html, /id="citizenLiveTrackingMap"/);
        assert.match(js, /\/api\/citizen\/live-tracking/);
    });

    await test("Health endpoint is available", async () => {
        const r = await request("/api/health");
        assertStatus(r.status, 200, "health");
        assert.equal(r.body?.success, true);
    });

    await test("Citizen live tracking endpoint requires Citizen authentication", async () => {
        const r = await request("/api/citizen/live-tracking");
        assert.ok([302, 401, 403].includes(r.status), `anonymous live-tracking request should be rejected, received ${r.status}`);
    });

    await test("API responses include no-store cache protection and baseline security headers", async () => {
        const r = await request("/api/health");
        assertStatus(r.status, 200, "security headers");
        assert.match(String(r.response.headers.get("cache-control") || ""), /no-store/i);
        assert.equal(r.response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(r.response.headers.get("x-frame-options"), "DENY");
        assert.match(String(r.response.headers.get("referrer-policy") || ""), /strict-origin-when-cross-origin/i);
    });

    await test("Citizen dashboard and profile page entry points require a Citizen session", async () => {
        for (const page of ["/citizenDash", "/citizenDash/citizenDash.html", "/citizenDash/profile", "/citizenDash/citizenProfile.html"]) {
            const r = await request(page);
            assertStatus(r.status, 302, `protected page ${page}`);
            assert.equal(r.response.headers.get("location"), "/login");
        }
    });

    await test("Public registration rejects malformed email before database access", async () => {
        const r = await request("/api/auth/register-citizen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "invalid-email", password: "LongEnoughPassword123", confirm_password: "LongEnoughPassword123" })
        });
        assertStatus(r.status, 400, "invalid email");
        assert.equal(r.body?.code, "INVALID_EMAIL");
    });

    await test("Public registration rejects weak password before database access", async () => {
        const r = await request("/api/auth/register-citizen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "test-citizen-part1@example.invalid", password: "short", confirm_password: "short" })
        });
        assertStatus(r.status, 400, "weak password");
        assert.equal(r.body?.code, "INVALID_PASSWORD");
    });

    await test("Unauthenticated Citizen profile API is blocked", async () => {
        const r = await request("/api/citizen/profile");
        assertStatus(r.status, 401, "citizen profile auth");
    });

    await test("Unauthenticated Citizen Ward-boundary API is blocked", async () => {
        const r = await request("/api/citizen/ward-areas");
        assertStatus(r.status, 401, "ward areas auth");
    });

    await test("Unauthenticated Citizen complaint list is blocked", async () => {
        const r = await request("/api/citizen/complaints");
        assertStatus(r.status, 401, "complaint list auth");
    });

    await test("Unauthenticated Citizen complaint submission is blocked", async () => {
        const r = await request("/api/citizen/complaints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complaint_type: "Other", description: "There is a waste issue near the road." })
        });
        assertStatus(r.status, 401, "complaint submission auth");
    });

    if (!CITIZEN_EMAIL || !CITIZEN_PASSWORD) {
        skip("Citizen session/profile/CSRF tests", "Set TEST_CITIZEN_EMAIL and TEST_CITIZEN_PASSWORD to an account created through /citizenRegister.");
    } else {
        await test("Citizen login creates a session", async () => {
            const r = await request("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: CITIZEN_EMAIL, password: CITIZEN_PASSWORD, role: "citizen" })
            });
            assertStatus(r.status, 200, "citizen login");
            assert.equal(r.body?.user?.role, "citizen");
            citizenUserId = Number(r.body?.user?.id || 0) || null;
            citizenWardId = Number(r.body?.profile?.ward_id || r.body?.scope?.ward?.id || 0) || null;
            citizenCookie = cookieFrom(r.response);
            assert.ok(citizenCookie, "login response should include a session cookie");
        });

        await test("Citizen Ward-boundary API returns a scoped response", async () => {
            const r = await request("/api/citizen/ward-areas", {}, citizenCookie);
            assertStatus(r.status, 200, "ward areas");
            assert.equal(r.body?.success, true);
            assert.ok(Array.isArray(r.body?.areas));
        });

        await test("Citizen profile API loads", async () => {
            const r = await request("/api/citizen/profile", {}, citizenCookie);
            assertStatus(r.status, 200, "citizen profile");
            assert.equal(r.body?.success, true);
            assert.equal(r.body?.user?.role, "citizen");
            assert.equal(typeof r.body?.profileComplete, "boolean");
            citizenProfileComplete = r.body.profileComplete === true;
            citizenWardId = Number(r.body?.profile?.ward_id || r.body?.profile?.ward?.id || 0) || citizenWardId;
        });

        await test("Citizen profile map page has protected CSP, OSM tile access and no-store headers", async () => {
            const r = await request("/citizenDash/profile", {}, citizenCookie);
            assertStatus(r.status, 200, "Citizen profile page");
            const csp = String(r.response.headers.get("content-security-policy") || "");
            assert.match(csp, /frame-ancestors 'none'/i);
            assert.match(csp, /https:\/\/\*\.tile\.openstreetmap\.org/i);
            assert.match(String(r.response.headers.get("cache-control") || ""), /no-store/i);
        });

        await test("Citizen profile mutation without CSRF is blocked", async () => {
            const r = await request("/api/citizen/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            }, citizenCookie);
            assertStatus(r.status, 403, "missing citizen CSRF");
            assert.ok(["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID"].includes(r.body?.code));
        });

        await test("Citizen CSRF token endpoint works", async () => {
            const r = await request("/api/citizen/security/csrf-token", {}, citizenCookie);
            assertStatus(r.status, 200, "citizen CSRF token");
            assert.equal(r.body?.success, true);
            csrfToken = String(r.body?.csrfToken || "");
            assert.ok(csrfToken.length >= 32);
        });

        await test("Citizen profile mutation rejects a hostile Origin even with a valid CSRF token", async () => {
            const r = await request("/api/citizen/profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                    "Origin": "https://hostile.example.invalid"
                },
                body: JSON.stringify({})
            }, citizenCookie);
            assertStatus(r.status, 403, "hostile Origin");
            assert.equal(r.body?.code, "ORIGIN_REJECTED");
        });

        await test("Citizen rejects manually supplied Ward/Zone/Division scope", async () => {
            const r = await request("/api/citizen/profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify({ ward_id: 13, zone_id: 1, division_id: 1 })
            }, citizenCookie);
            assertStatus(r.status, 400, "client scope injection");
            assert.equal(r.body?.code, "CLIENT_SCOPE_FORBIDDEN");
        });

        await test("Citizen live tracking returns only the saved Ward's active vehicles", async () => {
            const r = await request("/api/citizen/live-tracking", {}, citizenCookie);
            assertStatus(r.status, 200, "Citizen live tracking");
            assert.equal(r.body?.success, true);
            assert.ok(Array.isArray(r.body?.vehicles));
            if (citizenWardId) {
                assert.equal(Number(r.body?.ward?.id), Number(citizenWardId));
                for (const vehicle of r.body.vehicles) {
                    assert.equal(Number(vehicle?.assignment?.ward?.id), Number(citizenWardId));
                    assert.equal(Object.prototype.hasOwnProperty.call(vehicle, "driver"), false);
                }
            } else {
                assert.equal(r.body?.ward, null);
                assert.equal(r.body?.vehicles?.length, 0);
            }
            assert.match(String(r.response.headers.get("cache-control") || ""), /no-store/i);
        });

        await test("Citizen can load only the complaint list API for their session", async () => {
            const r = await request("/api/citizen/complaints", {}, citizenCookie);
            assertStatus(r.status, 200, "my complaints");
            assert.equal(r.body?.success, true);
            assert.ok(Array.isArray(r.body?.complaints));
        });

        await test("Citizen complaint writes require CSRF protection", async () => {
            const r = await request("/api/citizen/complaints", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ complaint_type: "Other", description: "There is a waste issue near the road." })
            }, citizenCookie);
            assertStatus(r.status, 403, "complaint missing CSRF");
            assert.ok(["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID"].includes(r.body?.code));
        });

        await test("Citizen complaint rejects a browser-supplied Ward", async () => {
            const r = await request("/api/citizen/complaints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify({
                    complaint_type: "Other",
                    description: "A public sanitation issue needs inspection.",
                    ward_id: 13
                })
            }, citizenCookie);
            assertStatus(r.status, 400, "complaint Ward injection");
            assert.equal(r.body?.code, "CLIENT_SCOPE_FORBIDDEN");
        });

        await test("Citizen complaint rejects an unsupported category without writing data", async () => {
            const r = await request("/api/citizen/complaints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify({
                    complaint_type: "Not a supported category",
                    description: "A public sanitation issue needs inspection."
                })
            }, citizenCookie);
            assertStatus(r.status, 400, "invalid complaint type");
            assert.equal(r.body?.code, "INVALID_COMPLAINT_TYPE");
        });

        await test("Citizen complaint rejects descriptions that are too short", async () => {
            const r = await request("/api/citizen/complaints", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                body: JSON.stringify({ complaint_type: "Other", description: "Too short" })
            }, citizenCookie);
            assertStatus(r.status, 400, "short complaint description");
            assert.equal(r.body?.code, "INVALID_COMPLAINT_DESCRIPTION");
        });

        await test("Citizen complaint rejects descriptions beyond the server limit", async () => {
            const r = await request("/api/citizen/complaints", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                body: JSON.stringify({ complaint_type: "Other", description: "x".repeat(2501) })
            }, citizenCookie);
            assertStatus(r.status, 400, "oversized complaint description");
            assert.equal(r.body?.code, "INVALID_COMPLAINT_DESCRIPTION");
        });

        if (!INSPECTOR_EMAIL || !INSPECTOR_PASSWORD) {
            skip(
                "Same-Ward Citizen-to-Inspector complaint handoff",
                "Set TEST_INSPECTOR_EMAIL and TEST_INSPECTOR_PASSWORD for an active Inspector assigned to the Citizen's Ward."
            );
        } else if (!citizenProfileComplete || !citizenWardId) {
            skip(
                "Same-Ward Citizen-to-Inspector complaint handoff",
                "Complete the Citizen residential profile and confirm its Ward before running the cross-role integration test."
            );
        } else {
            await test("Citizen complaint reaches its same-Ward Inspector and status updates return to Citizen tracking", async () => {
                if (!citizenUserId || !citizenWardId) {
                    throw new Error("The Citizen account must have a completed profile with a confirmed Ward before this integration test.");
                }

                try {
                    const inspectorLogin = await request("/api/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: INSPECTOR_EMAIL,
                            password: INSPECTOR_PASSWORD,
                            role: "sanitary_inspector"
                        })
                    });
                    assertStatus(inspectorLogin.status, 200, "same-Ward Inspector login");
                    assert.equal(inspectorLogin.body?.user?.role, "sanitary_inspector");
                    inspectorCookie = cookieFrom(inspectorLogin.response);
                    assert.ok(inspectorCookie, "Inspector login response should include a session cookie");

                    const inspectorWardId = Number(inspectorLogin.body?.scope?.ward?.id || 0);
                    assert.equal(
                        inspectorWardId,
                        citizenWardId,
                        "Integration test requires an Inspector assigned to the Citizen's exact Ward"
                    );

                    // Inspector writes require a session-bound CSRF token. Fetch a token using
                    // the Inspector's own authenticated session; do not reuse the Citizen token.
                    const inspectorCsrfResponse = await request(
                        "/api/inspector/security/csrf-token",
                        {},
                        inspectorCookie
                    );
                    assertStatus(inspectorCsrfResponse.status, 200, "Inspector CSRF token");
                    inspectorCsrfToken = String(inspectorCsrfResponse.body?.csrfToken || "");
                    assert.ok(inspectorCsrfToken.length >= 32, "Inspector CSRF token should be present");

                    const marker = `SWACHHITRA regression handoff ${Date.now()} ${Math.random().toString(16).slice(2)}`;
                    const createResponse = await request("/api/citizen/complaints", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRF-Token": csrfToken
                        },
                        body: JSON.stringify({
                            complaint_type: "Other",
                            description: `Automated temporary test complaint: ${marker}. This record must be removed by cleanup.`,
                            location_text: "Automated regression test location"
                        })
                    }, citizenCookie);

                    assertStatus(createResponse.status, 201, "temporary Citizen complaint creation");
                    integrationComplaintId = Number(createResponse.body?.complaint?.id || 0) || null;
                    integrationComplaintCode = String(createResponse.body?.complaint?.code || "");
                    assert.ok(integrationComplaintId, "the response should contain a database complaint id");
                    assert.ok(integrationComplaintCode.startsWith("SWC-"), "the response should contain an SWC reference");
                    assert.equal(Number(createResponse.body?.complaint?.ward?.id), citizenWardId);

                    const inspectorComplaints = await request("/api/inspector/complaints", {}, inspectorCookie);
                    assertStatus(inspectorComplaints.status, 200, "Inspector complaint queue");
                    assert.equal(inspectorComplaints.body?.success, true);
                    assert.ok(Array.isArray(inspectorComplaints.body?.complaints));
                    assert.ok(
                        inspectorComplaints.body.complaints.some(item =>
                            String(item?.id || "") === integrationComplaintCode ||
                            Number(item?.databaseId || 0) === integrationComplaintId
                        ),
                        "the exact temporary complaint should appear in the same-Ward Inspector queue"
                    );

                    const statusUpdate = await request(`/api/inspector/complaints/${integrationComplaintId}`, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRF-Token": inspectorCsrfToken
                        },
                        body: JSON.stringify({ status: "in_progress" })
                    }, inspectorCookie);
                    assertStatus(statusUpdate.status, 200, "Inspector complaint status update");
                    assert.equal(statusUpdate.body?.success, true);

                    const citizenTracking = await request("/api/citizen/complaints", {}, citizenCookie);
                    assertStatus(citizenTracking.status, 200, "Citizen complaint refresh after Inspector update");
                    const tracked = citizenTracking.body?.complaints?.find(item =>
                        String(item?.code || "") === integrationComplaintCode
                    );
                    assert.ok(tracked, "the Citizen should still see the exact complaint after the Inspector updates it");
                    assert.equal(tracked.status, "in_progress", "the Inspector's status must be reflected in Citizen tracking");
                } finally {
                    // Remove only the temporary record created above. Match all three identifiers
                    // so cleanup can never target an existing user's unrelated complaint.
                    if (integrationComplaintId && integrationComplaintCode && citizenUserId) {
                        const db = require("../config/db");
                        try {
                            const [cleanupResult] = await db.execute(
                                "DELETE FROM complaints WHERE id = ? AND complaint_code = ? AND citizen_user_id = ?",
                                [integrationComplaintId, integrationComplaintCode, citizenUserId]
                            );
                            if (cleanupResult.affectedRows !== 1) {
                                throw new Error("Temporary complaint cleanup did not remove exactly one test record.");
                            }
                            console.log(`CLEANUP  Removed temporary complaint ${integrationComplaintCode}`);
                            integrationComplaintId = null;
                            integrationComplaintCode = "";
                        } finally {
                            await db.end();
                        }
                    }

                    if (inspectorCookie) {
                        await request("/api/auth/logout", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: "{}"
                        }, inspectorCookie);
                        inspectorCookie = "";
                    }
                }
            });
        }

        await test("Citizen cannot cancel an invalid complaint identifier", async () => {
            const r = await request("/api/citizen/complaints/not-a-number/cancel", {
                method: "PUT",
                headers: { "X-CSRF-Token": csrfToken }
            }, citizenCookie);
            assertStatus(r.status, 400, "invalid cancel identifier");
            assert.equal(r.body?.code, "INVALID_COMPLAINT_ID");
        });

        await test("Citizen cannot cancel a complaint that does not exist in their account", async () => {
            const r = await request("/api/citizen/complaints/2147483647/cancel", {
                method: "PUT",
                headers: { "X-CSRF-Token": csrfToken }
            }, citizenCookie);
            assertStatus(r.status, 404, "non-owned/non-existent complaint");
        });

        await test("Citizen can log out and loses API access", async () => {
            const r = await request("/api/auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            }, citizenCookie);
            assertStatus(r.status, 200, "citizen logout");
            const after = await request("/api/citizen/profile", {}, citizenCookie);
            assertStatus(after.status, 401, "logged out citizen profile");
        });
    }

    console.log("");
    console.log(`Result: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

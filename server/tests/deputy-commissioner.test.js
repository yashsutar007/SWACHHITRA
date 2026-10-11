"use strict";

const allResults = { passed: 0, failed: 0 };

function addResult(label, result) {
    allResults.passed += result.passed;
    allResults.failed += result.failed;
    console.log(`\n${label}: ${result.passed} passed, ${result.failed} failed`);
}

function runStaticPart2() {
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const serverDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(serverDir, "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n?/g, "\n")
let passed = 0;
let failed = 0;

function test(name, callback) {
    try { callback(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

const route = read("server/routes/deputyCommissionerRoutes.js");
const controller = read("server/controllers/deputyCommissionerController.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");

test("Division and Ward API routes are protected by the DC role middleware", () => {
    assert.match(route, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(route, /router\.get\("\/divisions", getDivisionSupervision\)/);
    assert.match(route, /router\.get\("\/divisions\/:divisionId\/wards", getDivisionWards\)/);
});

test("Division comparisons use existing schema and subqueries to avoid join fan-out", () => {
    assert.match(controller, /FROM wards w WHERE w\.division_id = d\.id[\s\S]*FROM divisions d/);
    assert.match(controller, /FROM routes r WHERE r\.division_id = d\.id/);
    assert.match(controller, /FROM complaints c[\s\S]*INNER JOIN wards w ON w\.id = c\.ward_id/);
    assert.match(controller, /FROM collections col[\s\S]*col\.collection_date >= DATE_SUB\(CURRENT_DATE\(\), INTERVAL 6 DAY\)/);
    assert.match(controller, /AS delayed_count/);
});

test("Ward endpoint validates ID, uses parameterized SQL and performs SELECT-only reads", () => {
    assert.match(controller, /Number\.isSafeInteger\(divisionId\)/);
    assert.match(controller, /WHERE id = \?[\s\S]*\[divisionId\]/);
    assert.match(controller, /WHERE w\.division_id = \?[\s\S]*\[divisionId\]/);
    const wardStart = controller.indexOf("async function getDivisionWards");
    const wardEnd = controller.indexOf("async function getComplaintOversight");
    assert.ok(wardStart >= 0 && wardEnd > wardStart, "Ward handler boundaries must exist");
    const wardHandler = controller.slice(wardStart, wardEnd);
    assert.doesNotMatch(wardHandler, /INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM/i);
});

test("Division navigation target and Ward detail table exist in the page", () => {
    assert.match(html, /href="#division-supervision"/);
    assert.match(html, /id="division-supervision"/);
    assert.match(html, /id="divisionGrid"/);
    assert.match(html, /id="wardTableBody"/);
    assert.match(html, /do not certify official municipal boundaries/);
});

test("Front end fetches Division and Ward data same-origin and renders text safely", () => {
    assert.match(js, /fetch\("\/api\/deputy\/divisions"/);
    assert.match(js, /fetch\(`\/api\/deputy\/divisions\/\$\{id\}\/wards`/);
    assert.match(js, /credentials:\s*"same-origin"/);
    assert.match(js, /textContent\s*=/);
    assert.doesNotMatch(js, /(?:divisionGrid|wardTableBody|wardDetailSummary)\.innerHTML\s*=/);
});

test("Responsive styles cover Division cards and scrollable Ward table", () => {
    assert.match(css, /\.division-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media \(max-width:\s*560px\)/);
});
    return { passed, failed };
}

function runStaticSharedRegression() {
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const serverDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(serverDir, "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n?/g, "\n")
let passed = 0;
let failed = 0;

function test(name, callback) {
    try {
        callback();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${name}: ${error.message}`);
    }
}

const server = read("server/server.js");
const route = read("server/routes/deputyCommissionerRoutes.js");
const controller = read("server/controllers/deputyCommissionerController.js");
const login = read("client/login/login.js");
const profile = read("client/profile/profile.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const clientJs = read("client/deputyCommissionerDash/deputyCommissionerDash.js");

 test("DC page routes are protected and served from the dedicated client folder", () => {
    assert.match(server, /requirePageRole\("deputy_commissioner"\)/);
    assert.match(server, /deputyCommissionerDash\/deputyCommissionerDash\.html/);
    assert.match(server, /Cache-Control[\s\S]{0,100}no-store|no-store, no-cache, must-revalidate, private/);
});

test("DC API is mounted and role-guarded", () => {
    assert.match(server, /app\.use\("\/api\/deputy", deputyCommissionerRoutes\)/);
    assert.match(route, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(route, /router\.get\("\/overview", getCityOverview\)/);
});

test("Overview API is read-only and does not accept client scope IDs", () => {
    const overviewStart = controller.indexOf("async function getCityOverview");
    const overviewEnd = controller.indexOf("async function executeSupervisionQuery", overviewStart);
    assert.ok(overviewStart >= 0 && overviewEnd > overviewStart, "City overview handler boundaries must exist");
    const overviewHandler = controller.slice(overviewStart, overviewEnd);
    assert.match(overviewHandler, /FROM divisions/);
    assert.match(overviewHandler, /FROM wards/);
    assert.match(overviewHandler, /FROM routes/);
    assert.match(overviewHandler, /FROM complaints/);
    assert.match(overviewHandler, /FROM collections/);
    assert.doesNotMatch(overviewHandler, /req\.body|req\.query|INSERT INTO|UPDATE [a-z_]+|DELETE FROM/i);
});

test("Login routes a completed Deputy Commissioner to the DC dashboard", () => {
    assert.match(login, /case "deputy_commissioner":\s*return "\/deputyCommissionerDash"/);
});

test("Profile completion redirects Deputy Commissioner to the DC dashboard", () => {
    assert.match(profile, /deputy_commissioner:\s*"\/deputyCommissionerDash\/"/);
});

test("DC dashboard uses same-origin assets and overview API", () => {
    assert.match(html, /href="\/deputyCommissionerDash\/deputyCommissionerDash\.css"/);
    assert.match(html, /src="\/deputyCommissionerDash\/deputyCommissionerDash\.js"/);
    assert.match(clientJs, /fetch\("\/api\/deputy\/overview"/);
    assert.match(clientJs, /credentials:\s*"same-origin"/);
});

test("Dashboard layout has responsive cards and bounded chart containers", () => {
    assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /overflow:\s*hidden/);
    assert.match(css, /@media \(max-width:\s*560px\)/);
});
    return { passed, failed };
}

function runStaticPart3() {
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const rootDir = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n?/g, "\n")
let passed = 0;
let failed = 0;
function test(name, callback) {
    try { callback(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

const controller = read("server/controllers/deputyCommissionerController.js");
const routes = read("server/routes/deputyCommissionerRoutes.js");
const security = read("server/middleware/deputyCommissionerSecurityMiddleware.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");

test("Complaint queue and escalation endpoints are DC-role protected", () => {
    assert.match(routes, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(routes, /router\.get\("\/complaints", getComplaintOversight\)/);
    assert.match(routes, /router\.post\("\/complaints\/:complaintId\/escalate", requireDeputyCommissionerMutationSecurity, escalateComplaint\)/);
});

test("Complaint query uses existing tables, parameterized filters, safe cap and 48-hour ageing", () => {
    assert.match(controller, /async function getComplaintOversight/);
    assert.match(controller, /c\.status = \?/);
    assert.match(controller, /c\.priority = \?/);
    assert.match(controller, /LIMIT 250/);
    assert.match(controller, /TIMESTAMPDIFF\(HOUR, c\.reported_at, NOW\(\)\) >= 48/);
    assert.match(controller, /activeInspectorNames/);
});

test("Complaint oversight validates and parameterizes Division, Ward, and reported-date filters", () => {
    assert.match(controller, /rawDivisionId/);
    assert.match(controller, /rawWardId/);
    assert.match(controller, /dateFrom/);
    assert.match(controller, /dateTo/);
    assert.match(controller, /w\.division_id = \?/);
    assert.match(controller, /c\.ward_id = \?/);
    assert.match(controller, /c\.reported_at >= \?/);
    assert.match(controller, /c\.reported_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
    assert.match(controller, /The start date cannot be later than the end date/);
});

test("Escalation only changes notifications, derives recipients from saved assignments and preserves complaint status", () => {
    assert.match(controller, /async function escalateComplaint/);
    assert.match(controller, /BEGIN|beginTransaction/);
    assert.match(controller, /INSERT INTO notifications/);
    assert.match(controller, /notification_type = 'dc_escalation'/);
    assert.match(controller, /p\.ward_id = \? AND p\.division_id = \?/);
    assert.match(controller, /u\.role = 'assistant_commissioner' AND p\.division_id = \?/);
    assert.doesNotMatch(controller, /UPDATE complaints SET status|DELETE FROM complaints/i);
});

test("DC escalation mutation uses a session-bound timing-safe CSRF token, origin check and rate limit", () => {
    assert.match(routes, /ensureDeputyCommissionerCsrfToken/);
    assert.match(security, /crypto\.randomBytes\(32\)/);
    assert.match(security, /timingSafeEqual/);
    assert.match(security, /requireSameOrigin/);
    assert.match(security, /requireRateLimit/);
});

test("Dashboard exposes Complaint Oversight, filtering, accessible table and escalation dialog", () => {
    assert.match(html, /href="#complaint-oversight"/);
    assert.match(html, /id="complaint-oversight"/);
    assert.match(html, /id="complaintStatusFilter"/);
    assert.match(html, /id="complaintPriorityFilter"/);
    assert.match(html, /id="complaintDivisionFilter"/);
    assert.match(html, /id="complaintWardFilter"/);
    assert.match(html, /id="complaintDateFrom"/);
    assert.match(html, /id="complaintDateTo"/);
    assert.match(html, /id="complaintTableBody"/);
    assert.match(html, /id="escalationDialog"/);
    assert.match(html, /status is not changed|does not change complaint status/i);
});

test("Frontend uses same-origin APIs, sends CSRF token, renders untrusted strings with textContent", () => {
    assert.match(js, /fetch\(`\/api\/deputy\/complaints\?/);
    assert.match(js, /params\.set\("divisionId"/);
    assert.match(js, /params\.set\("wardId"/);
    assert.match(js, /params\.set\("dateFrom"/);
    assert.match(js, /params\.set\("dateTo"/);
    assert.match(js, /fetch\("\/api\/deputy\/security\/csrf-token"/);
    assert.match(js, /X-CSRF-Token/);
    assert.match(js, /textContent\s*=/);
    assert.doesNotMatch(js, /complaintTableBody\.innerHTML\s*=/);
});

test("Inspector-comparable text sizes and responsive complaint table styles exist", () => {
    assert.match(css, /body\s*\{\s*font-size:\s*16px/);
    assert.match(css, /\.metric-label\s*\{\s*font-size:\s*14\.5px/);
    assert.match(css, /\.complaint-filter-bar input, \.complaint-filter-bar select \{[^}]*font-size:\s*15px/s);
    assert.match(css, /\.complaint-table\s*\{[^}]*min-width:\s*1230px/s);
    assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media \(max-width:\s*560px\)/);
});
    return { passed, failed };
}

function runStaticPart4() {
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const rootDir = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n?/g, "\n")
let passed = 0;
let failed = 0;

function test(name, callback) {
    try { callback(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

const route = read("server/routes/deputyCommissionerRoutes.js");
const controller = read("server/controllers/deputyCommissionerController.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");

 test("Fleet API is registered under the DC role-protected router", () => {
    assert.match(route, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(route, /router\.get\("\/fleet", getFleetOperations\)/);
    assert.match(route, /getFleetOperations/);
});

test("Fleet queries use existing relationships and parameterized filters", () => {
    const start = controller.indexOf("async function getFleetOperations");
    const end = controller.indexOf("async function executeReportQuery", start);
    assert.ok(start >= 0 && end > start, "Fleet handler must be defined before exports");
    const handler = controller.slice(start, end);
    assert.match(handler, /FROM vehicles v/);
    assert.match(handler, /FROM route_assignments ra2/);
    assert.match(handler, /FROM routes r/);
    assert.match(handler, /LEFT JOIN wards w/);
    assert.match(handler, /LEFT JOIN zones z/);
    assert.match(handler, /LEFT JOIN drivers d/);
    assert.match(handler, /v\.status = \?/);
    assert.match(handler, /r\.status = \?/);
    assert.match(handler, /LIMIT 250/);
    assert.doesNotMatch(handler, /assigned_ward_id|current_latitude|current_longitude/i);
    assert.doesNotMatch(handler, /INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM/i);
});

test("Fleet endpoint validates role and status filters and returns non-cacheable data", () => {
    const start = controller.indexOf("async function getFleetOperations");
    const end = controller.indexOf("async function executeReportQuery", start);
    const handler = controller.slice(start, end);
    assert.match(handler, /req\.currentUser\?\.role !== "deputy_commissioner"/);
    assert.match(handler, /Invalid vehicle status filter/);
    assert.match(handler, /Invalid route status filter/);
    assert.match(handler, /Cache-Control[\s\S]{0,100}no-store, no-cache, must-revalidate, private/);
    assert.match(handler, /COUNT\(DISTINCT v\.id\)/);
    assert.match(handler, /COUNT\(DISTINCT r\.id\)/);
});

test("Fleet section exposes accessible filters, summary cards and scrollable tables", () => {
    assert.match(html, /href="#fleet-operations"/);
    assert.match(html, /id="fleet-operations"/);
    assert.match(html, /id="fleetVehicleStatusFilter"/);
    assert.match(html, /id="fleetRouteStatusFilter"/);
    assert.match(html, /id="fleetSearchInput"/);
    assert.match(html, /id="fleetVehicleTableBody"/);
    assert.match(html, /id="fleetRouteTableBody"/);
    assert.match(html, /does not provide live GPS tracking/i);
    assert.match(css, /\.fleet-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media \(max-width:\s*560px\)/);
});

test("Frontend fetches the DC fleet API and safely builds table text", () => {
    assert.match(js, /fetch\(`\/api\/deputy\/fleet\?/);
    assert.match(js, /credentials:\s*"same-origin"/);
    assert.match(js, /fleetVehicleTableBody\.replaceChildren\(\)/);
    assert.match(js, /fleetRouteTableBody\.replaceChildren\(\)/);
    assert.match(js, /textContent\s*=/);
    assert.doesNotMatch(js, /fleetVehicleTableBody\.innerHTML\s*=|fleetRouteTableBody\.innerHTML\s*=/);
    assert.match(js, /loadFleetOperations\(\);/);
});
    return { passed, failed };
}

function runStaticPart5() {
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const rootDir = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n?/g, "\n")
let passed = 0;
let failed = 0;
function test(name, callback) {
    try { callback(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

const route = read("server/routes/deputyCommissionerRoutes.js");
const controller = read("server/controllers/deputyCommissionerController.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");

test("Reports API is mounted under the DC-only router", () => {
    assert.match(route, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(route, /router\.get\("\/reports", getReportsAnalytics\)/);
    assert.match(route, /getReportsAnalytics/);
});

test("Reports handler validates date range and caps the range at 366 days", () => {
    const start = controller.indexOf("async function getReportsAnalytics");
    const end = controller.indexOf("/**\n * Part 6: DC security centre", start);
    assert.ok(start >= 0 && end > start);
    const handler = controller.slice(start, end);
    assert.match(handler, /req\.currentUser\?\.role !== "deputy_commissioner"/);
    assert.match(handler, /isValidReportDateOnly/);
    assert.match(handler, /dateFrom > dateTo/);
    assert.match(handler, /days > 366/);
    assert.match(handler, /Cache-Control[\s\S]{0,100}no-store, no-cache, must-revalidate, private/);
});

test("Report SQL uses parameterized date filters and existing operational relationships", () => {
    const start = controller.indexOf("async function getReportsAnalytics");
    const end = controller.indexOf("/**\n * Part 6: DC security centre", start);
    const handler = controller.slice(start, end);
    assert.match(handler, /collections[\s\S]*collection_date BETWEEN \? AND \?/);
    assert.match(handler, /complaints[\s\S]*reported_at >= \? AND reported_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
    assert.match(handler, /COALESCE\(scheduled_start_time, created_at\)/);
    assert.match(handler, /INNER JOIN wards w ON w\.id = col\.ward_id/);
    assert.match(handler, /INNER JOIN wards w ON w\.id = c\.ward_id/);
    assert.match(handler, /INNER JOIN wards w ON w\.id = r\.ward_id/);
    assert.match(handler, /GROUP BY w\.division_id/);
    assert.doesNotMatch(handler, /\b(INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM|DROP TABLE|TRUNCATE)\b/i);
});

test("Reports UI contains date filters, status summaries, Division comparison and export", () => {
    assert.match(html, /href="#reports-analytics"/);
    assert.match(html, /id="reports-analytics"/);
    assert.match(html, /id="reportDateFrom"/);
    assert.match(html, /id="reportDateTo"/);
    assert.match(html, /id="reportCollectionTrend"/);
    assert.match(html, /id="reportCollectionStatuses"/);
    assert.match(html, /id="reportComplaintStatuses"/);
    assert.match(html, /id="reportRouteStatuses"/);
    assert.match(html, /id="reportDivisionTableBody"/);
    assert.match(html, /id="exportReportsButton"/);
    assert.match(css, /\.report-trend-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /\.report-division-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media \(max-width:\s*560px\)/);
});

test("Frontend fetches reports same-origin, builds DOM safely and exports CSV defensively", () => {
    assert.match(js, /fetch\(`\/api\/deputy\/reports\?/);
    assert.match(js, /credentials:\s*"same-origin"/);
    assert.match(js, /cache:\s*"no-store"/);
    assert.match(js, /container\.replaceChildren\(\)/);
    assert.match(js, /cell\.textContent\s*=/);
    assert.match(js, /csvSafeValue/);
    assert.match(js, /text\.replace\(\/"\/g, '""'\)/);
    assert.match(js, /URL\.createObjectURL/);
    assert.match(js, /loadReports\(\);/);
    assert.doesNotMatch(js, /reportDivisionTableBody\.innerHTML\s*=/);
});

test("Report SQL CASE expressions retain required whitespace and stay read-only", () => {
    assert.doesNotMatch(controller, /waste_tonsELSE|ELSE0/);
    assert.match(controller, /THEN waste_tons ELSE 0 END/);
    assert.match(controller, /THEN 1 ELSE 0 END/);
    const reportStart = controller.indexOf("async function getReportsAnalytics");
    const reportEnd = controller.indexOf("/**\n * Part 6: DC security centre", reportStart);
    assert.ok(reportStart >= 0 && reportEnd > reportStart, "Reports handler boundaries must be located after CRLF normalization");
    const reportHandler = controller.slice(reportStart, reportEnd);
    assert.doesNotMatch(reportHandler, /\b(INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM|DROP TABLE|TRUNCATE)\b/i);
});

    return { passed, failed };
}

function runStaticPart6() {
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(rootDir, p), "utf8").replace(/\r\n?/g, "\n")
const controller = read("server/controllers/deputyCommissionerController.js");
const routes = read("server/routes/deputyCommissionerRoutes.js");
const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");
const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
const audit = read("server/utils/deputyCommissionerAuditLog.js");
let passed = 0;
let failed = 0;
function test(name, fn) {
    try { fn(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

test("Security centre routes are behind the DC-only role middleware", () => {
    assert.match(routes, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
    assert.match(routes, /router\.get\("\/security", getSecurityCenter\)/);
    assert.match(routes, /router\.post\("\/security\/accounts\/:userId\/status", requireDeputyCommissionerMutationSecurity, updateStaffAccountStatus\)/);
});

test("Account listing validates filters, excludes Citizens/DC accounts and returns bounded staff metadata", () => {
    const start = controller.indexOf("async function getSecurityCenter");
    const end = controller.indexOf("async function updateStaffAccountStatus", start);
    assert.ok(start >= 0 && end > start);
    const handler = controller.slice(start, end);
    assert.match(handler, /req\.currentUser\?\.role !== "deputy_commissioner"/);
    assert.match(handler, /DC_SECURITY_STATUS_FILTERS/);
    assert.match(handler, /DC_SECURITY_ROLE_FILTERS/);
    assert.match(handler, /u\.role IN \('assistant_commissioner', 'sanitary_inspector'\)/);
    assert.match(handler, /LIMIT 250/);
    assert.match(handler, /Cache-Control[\s\S]{0,100}no-store, no-cache, must-revalidate, private/);
    assert.doesNotMatch(handler, /password_hash|token_hash|session_id|data AS session/i);
});

test("Status mutations require reasons, prevent self/DC/Citizen changes and preserve the last active AC", () => {
    const start = controller.indexOf("async function updateStaffAccountStatus");
    const end = controller.indexOf("module.exports", start);
    assert.ok(start >= 0 && end > start);
    const handler = controller.slice(start, end);
    assert.match(handler, /targetUserId === Number\(req\.currentUser\.id\)/);
    assert.match(handler, /reason\.length < 10 \|\| reason\.length > 300/);
    assert.match(handler, /DC_MANAGED_STAFF_ROLES\.has/);
    assert.match(handler, /final active Assistant Commissioner cannot be deactivated/i);
    assert.match(handler, /ORDER BY id ASC[\s\S]*FOR UPDATE/);
    assert.match(handler, /UPDATE users[\s\S]*SET status = \?/);
    assert.match(handler, /DELETE FROM sessions[\s\S]*JSON_EXTRACT/);
});

test("Mutation is protected by CSRF/origin/rate-limit middleware and audit events are written", () => {
    assert.match(routes, /requireDeputyCommissionerMutationSecurity, updateStaffAccountStatus/);
    assert.match(controller, /appendAuditRecord\(\{ \.\.\.auditBase, outcome: "requested"/);
    assert.match(controller, /outcome: "completed"/);
    assert.match(controller, /outcome: "failed"/);
    assert.match(audit, /handle\.sync\(\)/);
    assert.match(audit, /deputy-commissioner-admin-audit\.jsonl/);
});

test("Security UI includes scoped account controls, confirmation dialog and audit table", () => {
    assert.match(html, /href="#security-administration"/);
    assert.match(html, /id="security-administration"/);
    assert.match(html, /id="securityAccountTableBody"/);
    assert.match(html, /id="securityAuditTableBody"/);
    assert.match(html, /id="staffAccountDialog"/);
    assert.match(html, /id="staffAccountReason"[^>]*minlength="10"[^>]*maxlength="300"/);
    assert.match(html, /Citizen accounts, Deputy Commissioner accounts, your own account/);
});

test("Frontend uses same-origin protected API and safe text DOM rendering", () => {
    assert.match(js, /fetch\(`\/api\/deputy\/security/);
    assert.match(js, /X-CSRF-Token/);
    assert.match(js, /container\.replaceChildren\(\)/);
    assert.match(js, /reasonCell\.textContent = event\.reason/);
    assert.match(js, /button\.addEventListener\("click", \(\) => openStaffAccountDialog/);
    const start = js.indexOf("function renderSecurityAccounts");
    const end = js.indexOf("function renderSecurityAudit", start);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(js.slice(start, end), /\.innerHTML\s*=/);
});

test("Security layout stays scrollable and responsive", () => {
    assert.match(css, /\.security-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.security-summary-grid/);
    assert.match(css, /\.security-action-dialog::backdrop/);
});
    return { passed, failed };
}

async function runBehaviorPart3() {
// Behavior-focused controller tests with a mock database. These tests never
// connect to MySQL and never mutate a real project database.
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const controllerPath = path.resolve(__dirname, "../controllers/deputyCommissionerController.js");
const db = { execute: async () => [[], []], getConnection: async () => { throw new Error("Unexpected DB connection request"); } };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "../config/db" && parent && path.resolve(parent.filename) === controllerPath) return db;
    return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[controllerPath];
const controller = require(controllerPath);
Module._load = originalLoad;

let passed = 0;
let failed = 0;
async function test(name, callback) {
    try {
        await callback();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${name}: ${error.stack || error.message || error}`);
    }
}
function responseMock() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        json(body) { this.body = body; return this; }
    };
}


    let queryCalls = [];
    db.execute = async (sql, values = []) => {
        queryCalls.push({ sql, values: [...values] });
        if (sql.includes("AS criticalActive")) {
            return [[{ total: 12, active: 4, criticalActive: 1, overdue48h: 2, needsWardMapping: 0 }], []];
        }
        if (sql.includes("SELECT COUNT(*) AS total")) return [[{ total: 1 }], []];
        if (sql.includes("SELECT c.id")) {
            return [[{
                id: 91, complaintCode: "CMP-091", complaintType: "Missed collection",
                description: "Collection was missed", locationText: "Sample Road", priority: "high",
                status: "open", reportedAt: new Date("2026-10-04T10:00:00.000Z"), ageHours: 36,
                wardId: 13, wardCode: "WARD-10", wardName: "Sample Ward", divisionId: 1,
                divisionCode: "DIV-01", divisionName: "Division 1", assignedVehicleNumber: null,
                assignedDriverName: null, activeInspectorNames: "Inspector Example", isOverdue: 0
            }], []];
        }
        throw new Error(`Unexpected query in test: ${sql.slice(0, 100)}`);
    };

    await test("Complaint filters are parameterized and the end date includes the full day", async () => {
        queryCalls = [];
        const res = responseMock();
        await controller.getComplaintOversight({
            currentUser: { id: 3, role: "deputy_commissioner" },
            query: {
                status: "open", priority: "high", divisionId: "1", wardId: "13",
                dateFrom: "2026-10-01", dateTo: "2026-10-10", q: "missed"
            }
        }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.summary.total, 12);
        assert.equal(res.body.data.totalMatched, 1);
        assert.equal(res.body.data.complaints[0].status, "open");
        const filteredCalls = queryCalls.filter((call) => call.sql.includes("WHERE c.status = ?"));
        assert.equal(filteredCalls.length, 2, "count and queue queries should use the same filters");
        for (const call of filteredCalls) {
            assert.match(call.sql, /w\.division_id = \?/);
            assert.match(call.sql, /c\.ward_id = \?/);
            assert.match(call.sql, /c\.reported_at >= \?/);
            assert.match(call.sql, /c\.reported_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
            assert.deepEqual(call.values.slice(0, 6), ["open", "high", 1, 13, "2026-10-01 00:00:00", "2026-10-10"]);
            assert.equal(call.values.length, 13, "the search adds seven placeholders after the six structured filters");
        }
    });

    await test("Invalid dates and reversed date ranges are rejected before database access", async () => {
        queryCalls = [];
        const invalidDateRes = responseMock();
        await controller.getComplaintOversight({
            currentUser: { role: "deputy_commissioner" },
            query: { dateFrom: "2026-02-30" }
        }, invalidDateRes);
        assert.equal(invalidDateRes.statusCode, 400);
        assert.equal(queryCalls.length, 0);

        const reversedRes = responseMock();
        await controller.getComplaintOversight({
            currentUser: { role: "deputy_commissioner" },
            query: { dateFrom: "2026-10-11", dateTo: "2026-10-10" }
        }, reversedRes);
        assert.equal(reversedRes.statusCode, 400);
        assert.equal(queryCalls.length, 0);
    });

    await test("Escalation writes notifications only and commits without changing complaint status", async () => {
        const transaction = { began: false, committed: false, rolledBack: false, queries: [], inserted: [] };
        const connection = {
            async beginTransaction() { transaction.began = true; },
            async commit() { transaction.committed = true; },
            async rollback() { transaction.rolledBack = true; },
            release() {},
            async execute(sql, values = []) {
                transaction.queries.push(sql);
                if (sql.includes("SELECT c.id")) return [[{
                    id: 91, complaintCode: "CMP-091", complaintType: "Missed collection",
                    priority: "high", status: "open", wardId: 13
                }], []];
                if (sql.includes("SELECT w.ward_code")) return [[{
                    wardCode: "WARD-10", divisionId: 1, divisionName: "Division 1"
                }], []];
                if (sql.includes("SELECT DISTINCT u.id AS userId")) return [[
                    { userId: 1, role: "sanitary_inspector" },
                    { userId: 3, role: "assistant_commissioner" }
                ], []];
                if (sql.includes("SELECT recipient_user_id")) return [[], []];
                if (sql.includes("INSERT INTO notifications")) {
                    transaction.inserted.push({ sql, values: [...values] });
                    return [{ affectedRows: 1 }, []];
                }
                throw new Error(`Unexpected transaction query: ${sql.slice(0, 100)}`);
            }
        };
        db.getConnection = async () => connection;
        const res = responseMock();
        await controller.escalateComplaint({
            currentUser: { id: 3, role: "deputy_commissioner" },
            params: { complaintId: "91" },
            body: { note: "Please review this ageing service issue." }
        }, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.recipientCount, 2);
        assert.equal(transaction.began, true);
        assert.equal(transaction.committed, true);
        assert.equal(transaction.rolledBack, false);
        assert.equal(transaction.inserted.length, 2);
        assert.ok(transaction.queries.every((sql) => !/UPDATE\s+complaints|DELETE\s+FROM\s+complaints/i.test(sql)));
        assert.ok(transaction.inserted.every((item) => item.sql.includes("'dc_escalation'")));
    });
    return { passed, failed };

}

async function runBehaviorPart4() {
const assert = require("assert");
const Module = require("module");
const path = require("path");

const controllerPath = path.resolve(__dirname, "../controllers/deputyCommissionerController.js");
const calls = [];
const fakeDb = {
    async execute(sql, params = []) {
        calls.push({ sql, params });
        if (/SELECT COUNT\(DISTINCT v\.id\)/i.test(sql)) return [[{ totalMatched: 1 }], []];
        if (/SELECT COUNT\(DISTINCT r\.id\)/i.test(sql)) return [[{ totalMatched: 1 }], []];
        if (/SELECT v\.id,[\s\S]*FROM vehicles v/i.test(sql)) {
            return [[{
                id: 12, vehicleNumber: "TRUCK-12", registrationNumber: "MH-XX-1234",
                vehicleType: "Compactor", make: "Test Make", capacityTons: "8.00",
                currentLoadTons: "3.25", currentLoadPercent: "40.63", etaMinutes: 25,
                vehicleStatus: "delayed", assignmentCode: "ASG-12", assignmentStatus: "delayed",
                routeId: 4, routeCode: "R-004", routeName: "Market Route", routeStatus: "delayed",
                delayMinutes: 12, wardCode: "WARD-10", wardName: "Market Ward",
                zoneCode: "ZONE-1", zoneName: "Central Zone", driverEmployeeId: "DRV-12",
                driverName: "Test Driver"
            }], []];
        }
        if (/SELECT r\.id,[\s\S]*FROM routes r/i.test(sql)) {
            return [[{
                id: 4, routeCode: "R-004", routeName: "Market Route", routeStatus: "active",
                estimatedDistanceKm: "7.50", estimatedDurationMinutes: 70, totalStops: 9,
                completedStops: 4, delayMinutes: 0, scheduledStartTime: "2026-10-10 08:00:00",
                scheduledEndTime: "2026-10-10 10:00:00", wardCode: "WARD-10",
                wardName: "Market Ward", zoneCode: "ZONE-1", zoneName: "Central Zone",
                assignmentCode: "ASG-12", assignmentStatus: "active", vehicleNumber: "TRUCK-12",
                driverEmployeeId: "DRV-12", driverName: "Test Driver"
            }], []];
        }
        if (/FROM vehicles\s*$/i.test(sql.trim())) return [[{
            total: 3, operational: 2, available: 1, enRoute: 1, collecting: 0,
            delayed_count: 0, maintenance: 1, inactive: 0
        }], []];
        if (/FROM drivers\s*$/i.test(sql.trim())) return [[{
            total: 4, available: 2, assigned: 1, onBreak: 1, inactive: 0
        }], []];
        if (/FROM routes\s*$/i.test(sql.trim())) return [[{
            total: 5, scheduled: 1, starting: 0, active: 2, delayed_count: 1,
            completed: 1, cancelled: 0
        }], []];
        if (/FROM route_assignments\s+WHERE status IN/i.test(sql)) return [[{
            currentAssignments: 2, vehiclesWithCurrentAssignments: 2, driversWithCurrentAssignments: 2
        }], []];
        throw new Error(`Unexpected SQL in behavior test: ${sql.slice(0, 100)}`);
    }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "../config/db" && parent && parent.filename === controllerPath) return fakeDb;
    return originalLoad.call(this, request, parent, isMain);
};
let controller;
try {
    delete require.cache[controllerPath];
controller = require(controllerPath);
} finally {
    Module._load = originalLoad;
}

function responseHarness() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        json(body) { this.body = body; return this; }
    };
}

async function run() {
    let passed = 0;
    let failed = 0;
    async function test(name, callback) {
        try { await callback(); passed += 1; console.log(`PASS ${name}`); }
        catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
    }

    await test("Wrong role is rejected before database access", async () => {
        const before = calls.length;
        const res = responseHarness();
        await controller.getFleetOperations({ currentUser: { role: "sanitary_inspector" }, query: {} }, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(calls.length, before);
    });

    await test("Invalid vehicle and route filters are rejected without SQL", async () => {
        const before = calls.length;
        const vehicleRes = responseHarness();
        await controller.getFleetOperations({ currentUser: { role: "deputy_commissioner" }, query: { vehicleStatus: "teleporting" } }, vehicleRes);
        assert.strictEqual(vehicleRes.statusCode, 400);
        const routeRes = responseHarness();
        await controller.getFleetOperations({ currentUser: { role: "deputy_commissioner" }, query: { routeStatus: "unknown-status" } }, routeRes);
        assert.strictEqual(routeRes.statusCode, 400);
        assert.strictEqual(calls.length, before);
    });

    await test("Valid filters use bound SQL parameters and return summary plus fleet records", async () => {
        calls.length = 0;
        const res = responseHarness();
        await controller.getFleetOperations({
            currentUser: { role: "deputy_commissioner" },
            query: { vehicleStatus: "delayed", routeStatus: "active", q: "truck" }
        }, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.summary.vehicles.total, 3);
        assert.strictEqual(res.body.data.summary.routes.delayed, 1);
        assert.strictEqual(res.body.data.summary.assignments.current, 2);
        assert.strictEqual(res.body.data.vehicles[0].vehicleNumber, "TRUCK-12");
        assert.strictEqual(res.body.data.routes[0].completedStops, 4);
        assert.strictEqual(res.body.data.vehicles[0].currentLoadTons, 3.25);
        assert.match(res.headers["Cache-Control"], /no-store/);
        const vehicleFilterCall = calls.find((call) => /SELECT v\.id,[\s\S]*FROM vehicles v/i.test(call.sql));
        const routeFilterCall = calls.find((call) => /SELECT r\.id,[\s\S]*FROM routes r/i.test(call.sql));
        assert.ok(vehicleFilterCall.params.includes("delayed"));
        assert.ok(vehicleFilterCall.params.includes("%truck%"));
        assert.ok(routeFilterCall.params.includes("active"));
        assert.ok(routeFilterCall.params.includes("%truck%"));
        assert.ok(calls.every((call) => !/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(call.sql)));
        assert.ok(calls.every((call) => !/current_latitude|current_longitude/i.test(call.sql)));
    });

    console.log(`\nBehavior test result: ${passed} passed, ${failed} failed`);
        return { passed, failed };
    }

return await run();

}

async function runBehaviorPart5() {
const assert = require("assert");
const Module = require("module");
const path = require("path");
const controllerPath = path.resolve(__dirname, "../controllers/deputyCommissionerController.js");
const calls = [];
const fakeDb = {
    async execute(sql, params = []) {
        calls.push({ sql, params });
        if (/SELECT status, COUNT\(\*\) AS recordCount,[\s\S]*FROM collections/i.test(sql)) {
            return [[
                { status: "collected", recordCount: 7, collectedTons: "12.50" },
                { status: "in_progress", recordCount: 2, collectedTons: "0.00" },
                { status: "skipped", recordCount: 1, collectedTons: "0.00" }
            ], []];
        }
        if (/DATE_FORMAT\(collection_date/i.test(sql)) {
            return [[
                { day: "2026-10-01", records: 4, collectedRecords: 3, collectedTons: "5.50" },
                { day: "2026-10-02", records: 6, collectedRecords: 4, collectedTons: "7.00" }
            ], []];
        }
        if (/FROM complaints[\s\S]*GROUP BY status/i.test(sql)) {
            return [[
                { status: "open", recordCount: 2, criticalActive: 1 },
                { status: "in_progress", recordCount: 1, criticalActive: 1 },
                { status: "resolved", recordCount: 4, criticalActive: 0 }
            ], []];
        }
        if (/FROM routes[\s\S]*GROUP BY status/i.test(sql)) {
            return [[
                { status: "scheduled", recordCount: 2 },
                { status: "completed", recordCount: 5 },
                { status: "delayed", recordCount: 1 }
            ], []];
        }
        if (/FROM divisions d[\s\S]*LEFT JOIN/i.test(sql)) {
            return [[
                { divisionId: 1, divisionCode: "DIV-1", divisionName: "Central", collectionRecords: 6, collectedRecords: 4,
                    wasteTons: "7.00", complaintsReported: 3, activeComplaints: 2, resolvedComplaints: 1,
                    criticalActiveComplaints: 1, routesInPeriod: 4, completedRoutes: 3, delayedRoutes: 1 }
            ], []];
        }
        throw new Error(`Unexpected SQL in behavior test: ${sql.slice(0, 130)}`);
    }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "../config/db" && parent && parent.filename === controllerPath) return fakeDb;
    return originalLoad.call(this, request, parent, isMain);
};
let controller;
try { delete require.cache[controllerPath];
controller = require(controllerPath); }
finally { Module._load = originalLoad; }

function responseHarness() {
    return {
        statusCode: 200, headers: {}, body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        json(body) { this.body = body; return this; }
    };
}

async function run() {
    let passed = 0;
    let failed = 0;
    async function test(name, callback) {
        try { await callback(); passed += 1; console.log(`PASS ${name}`); }
        catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
    }

    await test("Wrong role is rejected before database access", async () => {
        const before = calls.length;
        const res = responseHarness();
        await controller.getReportsAnalytics({ currentUser: { role: "sanitary_inspector" }, query: {} }, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(calls.length, before);
    });

    await test("Invalid, reversed and overlong report ranges are rejected before database access", async () => {
        const before = calls.length;
        const invalid = responseHarness();
        await controller.getReportsAnalytics({ currentUser: { role: "deputy_commissioner" }, query: { dateFrom: "2026-02-30", dateTo: "2026-03-01" } }, invalid);
        assert.strictEqual(invalid.statusCode, 400);
        const invalidEndOnly = responseHarness();
        await controller.getReportsAnalytics({ currentUser: { role: "deputy_commissioner" }, query: { dateTo: "not-a-date" } }, invalidEndOnly);
        assert.strictEqual(invalidEndOnly.statusCode, 400);
        const reversed = responseHarness();
        await controller.getReportsAnalytics({ currentUser: { role: "deputy_commissioner" }, query: { dateFrom: "2026-10-10", dateTo: "2026-10-01" } }, reversed);
        assert.strictEqual(reversed.statusCode, 400);
        const tooLong = responseHarness();
        await controller.getReportsAnalytics({ currentUser: { role: "deputy_commissioner" }, query: { dateFrom: "2025-01-01", dateTo: "2026-10-01" } }, tooLong);
        assert.strictEqual(tooLong.statusCode, 400);
        assert.strictEqual(calls.length, before);
    });

    await test("Valid reports use bound period parameters and aggregate recorded metrics", async () => {
        calls.length = 0;
        const res = responseHarness();
        await controller.getReportsAnalytics({
            currentUser: { role: "deputy_commissioner" },
            query: { dateFrom: "2026-10-01", dateTo: "2026-10-02" }
        }, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.deepStrictEqual(res.body.data.period, { dateFrom: "2026-10-01", dateTo: "2026-10-02", days: 2 });
        assert.strictEqual(res.body.data.summary.collections.records, 10);
        assert.strictEqual(res.body.data.summary.collections.collected, 7);
        assert.strictEqual(res.body.data.summary.collections.wasteTons, 12.5);
        assert.strictEqual(res.body.data.summary.complaints.reported, 7);
        assert.strictEqual(res.body.data.summary.complaints.criticalActive, 2);
        assert.strictEqual(res.body.data.summary.routes.completed, 5);
        assert.strictEqual(res.body.data.collectionTrend.length, 2);
        assert.strictEqual(res.body.data.divisions[0].divisionName, "Central");
        assert.match(res.headers["Cache-Control"], /no-store/);
        assert.ok(calls.every((call) => Array.isArray(call.params)));
        assert.ok(calls.every((call) => !/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(call.sql)));
        assert.ok(calls.some((call) => call.params.includes("2026-10-01") && call.params.includes("2026-10-02")));
    });

    console.log(`\nBehavior test result: ${passed} passed, ${failed} failed`);
        return { passed, failed };
    }
return await run();

}

async function runBehaviorPart6() {
const assert = require("assert");
const Module = require("module");
const path = require("path");
const controllerPath = path.resolve(__dirname, "../controllers/deputyCommissionerController.js");
const calls = [];
const auditRecords = [];
let targetUser = { userId: 42, role: "sanitary_inspector", status: "active" };
let activeAcCount = 2;
let sessionDeleteCount = 3;
let throwUpdate = false;

function record(sql, params = []) { calls.push({ sql: String(sql), params: Array.isArray(params) ? params : [] }); }
const fakeDb = {
    async execute(sql, params = []) {
        record(sql, params);
        throw new Error(`Unexpected pool query: ${String(sql).slice(0, 120)}`);
    },
    async getConnection() {
        return {
            async beginTransaction() { record("BEGIN"); },
            async commit() { record("COMMIT"); },
            async rollback() { record("ROLLBACK"); },
            release() { record("RELEASE"); },
            async execute(sql, params = []) {
                record(sql, params);
                if (/SELECT id[\s\S]*FROM users[\s\S]*role = 'assistant_commissioner'[\s\S]*FOR UPDATE/i.test(sql) && !/AS userId/i.test(sql)) {
                    return [[{ id: 3 }, { id: 4 }], []];
                }
                if (/SELECT id AS userId, role, status[\s\S]*FOR UPDATE/i.test(sql)) {
                    return [[{ ...targetUser }], []];
                }
                if (/SELECT COUNT\(\*\) AS activeCount[\s\S]*assistant_commissioner/i.test(sql)) {
                    return [[{ activeCount: activeAcCount }], []];
                }
                if (/UPDATE users[\s\S]*SET status = \?/i.test(sql)) {
                    if (throwUpdate) throw new Error("MOCK_UPDATE_FAILURE");
                    targetUser.status = params[0];
                    return [{ affectedRows: 1 }, []];
                }
                if (/DELETE FROM sessions[\s\S]*JSON_EXTRACT/i.test(sql)) {
                    return [{ affectedRows: sessionDeleteCount }, []];
                }
                throw new Error(`Unexpected connection query: ${String(sql).slice(0, 120)}`);
            }
        };
    }
};
const fakeAudit = {
    async appendAuditRecord(event) { auditRecords.push({ ...event }); },
    async readRecentAuditRecords() { return auditRecords.slice(-20).reverse(); }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath && request === "../config/db") return fakeDb;
    if (parent && parent.filename === controllerPath && request === "../utils/deputyCommissionerAuditLog") return fakeAudit;
    return originalLoad.call(this, request, parent, isMain);
};
let controller;
try { delete require.cache[controllerPath];
controller = require(controllerPath); }
finally { Module._load = originalLoad; }

function responseHarness() {
    return { statusCode: 200, headers: {}, body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        json(body) { this.body = body; return this; }
    };
}

async function run() {
    let passed = 0; let failed = 0;
    async function test(name, fn) {
        try { await fn(); passed += 1; console.log(`PASS ${name}`); }
        catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
    }

    await test("Wrong role and invalid account filters are rejected before database access", async () => {
        calls.length = 0;
        const wrong = responseHarness();
        await controller.getSecurityCenter({ currentUser: { id: 1, role: "sanitary_inspector" }, query: {} }, wrong);
        assert.strictEqual(wrong.statusCode, 403);
        assert.strictEqual(calls.length, 0);
        const badFilter = responseHarness();
        await controller.getSecurityCenter({ currentUser: { id: 1, role: "deputy_commissioner" }, query: { status: "deleted" } }, badFilter);
        assert.strictEqual(badFilter.statusCode, 400);
        assert.strictEqual(calls.length, 0);
    });

    await test("Security overview uses parameterized filters and returns capped account metadata", async () => {
        fakeDb.execute = async (sql, params = []) => {
            record(sql, params);
            if (/AS totalManagedAccounts/i.test(sql)) return [[{ totalManagedAccounts: 4, activeManagedAccounts: 3, inactiveManagedAccounts: 1, activeAssistantCommissioners: 2, activeInspectors: 1, incompleteScopeAccounts: 1 }], []];
            if (/SELECT COUNT\(\*\) AS total/i.test(sql)) return [[{ total: 1 }], []];
            if (/SELECT[\s\S]*u\.id AS userId/i.test(sql)) return [[{ userId: 42, email: "inspector@example.test", role: "sanitary_inspector", status: "active", fullName: "Inspector Test", divisionId: 1, divisionName: "Central", wardId: 13, wardCode: "WARD-10", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }], []];
            throw new Error(`Unexpected GET query: ${String(sql).slice(0, 100)}`);
        };
        calls.length = 0;
        const res = responseHarness();
        await controller.getSecurityCenter({ currentUser: { id: 3, role: "deputy_commissioner" }, query: { q: "inspector", role: "sanitary_inspector", status: "active" } }, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.accounts[0].wardCode, "WARD-10");
        assert.strictEqual(res.body.data.summary.activeInspectors, 1);
        assert.match(res.headers["Cache-Control"], /no-store/);
        const countCall = calls.find((call) => /SELECT COUNT\(\*\) AS total/i.test(call.sql));
        assert.deepStrictEqual(countCall.params, ["active", "sanitary_inspector", "%inspector%", "%inspector%", "%inspector%"]);
        assert.ok(calls.every((call) => !/password_hash|token_hash/i.test(call.sql)));
    });

    await test("Invalid status, missing reason and self-target changes are rejected before opening a transaction", async () => {
        calls.length = 0;
        let res = responseHarness();
        await controller.updateStaffAccountStatus({ currentUser: { id: 3, role: "deputy_commissioner" }, params: { userId: "42" }, body: { status: "suspended", reason: "Valid enough reason" } }, res);
        assert.strictEqual(res.statusCode, 400);
        res = responseHarness();
        await controller.updateStaffAccountStatus({ currentUser: { id: 3, role: "deputy_commissioner" }, params: { userId: "42" }, body: { status: "inactive", reason: "too short" } }, res);
        assert.strictEqual(res.statusCode, 400);
        res = responseHarness();
        await controller.updateStaffAccountStatus({ currentUser: { id: 42, role: "deputy_commissioner" }, params: { userId: "42" }, body: { status: "inactive", reason: "An administrative reason" } }, res);
        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(calls.length, 0);
    });

    await test("Citizen or Deputy Commissioner account status cannot be changed", async () => {
        const originalTarget = targetUser;
        for (const role of ["citizen", "deputy_commissioner"]) {
            targetUser = { userId: 77, role, status: "active" };
            const res = responseHarness();
            await controller.updateStaffAccountStatus({ currentUser: { id: 3, role: "deputy_commissioner" }, params: { userId: "77" }, body: { status: "inactive", reason: "Approved access review" } }, res);
            assert.strictEqual(res.statusCode, 403);
        }
        targetUser = originalTarget;
        assert.strictEqual(auditRecords.length, 0);
    });

    await test("Deactivating staff invalidates saved sessions and records requested plus completed audit events", async () => {
        targetUser = { userId: 42, role: "sanitary_inspector", status: "active" };
        auditRecords.length = 0; calls.length = 0;
        const res = responseHarness();
        await controller.updateStaffAccountStatus({ currentUser: { id: 3, role: "deputy_commissioner" }, params: { userId: "42" }, body: { status: "inactive", reason: "Access removed after staffing review." } }, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.status, "inactive");
        assert.strictEqual(res.body.data.sessionsInvalidated, 3);
        assert.ok(calls.some((call) => /UPDATE users[\s\S]*SET status = \?/i.test(call.sql) && call.params[0] === "inactive"));
        assert.ok(calls.some((call) => /DELETE FROM sessions[\s\S]*JSON_EXTRACT/i.test(call.sql)));
        assert.ok(calls.some((call) => call.sql === "COMMIT"));
        assert.deepStrictEqual(auditRecords.map((entry) => entry.outcome), ["requested", "completed"]);
    });

    await test("Final active Assistant Commissioner cannot be deactivated", async () => {
        targetUser = { userId: 51, role: "assistant_commissioner", status: "active" };
        activeAcCount = 1; auditRecords.length = 0; calls.length = 0;
        const res = responseHarness();
        await controller.updateStaffAccountStatus({ currentUser: { id: 3, role: "deputy_commissioner" }, params: { userId: "51" }, body: { status: "inactive", reason: "Administrative deactivation request" } }, res);
        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(auditRecords.length, 0);
        assert.ok(!calls.some((call) => /UPDATE users[\s\S]*SET status = \?/i.test(call.sql)));
        activeAcCount = 2;
    });

    console.log(`\nBehavior test result: ${passed} passed, ${failed} failed`);
        return { passed, failed };
    }
return await run();

}


function runStaticPart7() {
    const fs = require("fs");
    const path = require("path");
    const assert = require("assert").strict;
    const projectRoot = path.resolve(__dirname, "../..");
    const read = (relativePath) =>
        fs.readFileSync(path.join(projectRoot, relativePath), "utf8").replace(/\r\n?/g, "\n");

    const html = read("client/deputyCommissionerDash/deputyCommissionerDash.html");
    const css = read("client/deputyCommissionerDash/deputyCommissionerDash.css");
    const js = read("client/deputyCommissionerDash/deputyCommissionerDash.js");
    const controller = read("server/controllers/deputyCommissionerController.js");
    const routes = read("server/routes/deputyCommissionerRoutes.js");

    let passed = 0;
    let failed = 0;
    function test(name, callback) {
        try {
            callback();
            passed += 1;
            console.log(`PASS ${name}`);
        } catch (error) {
            failed += 1;
            console.error(`FAIL ${name}: ${error.message}`);
        }
    }

    const expected = [
        ["overview", "nav-overview"],
        ["operational-pulse", "nav-operational-pulse"],
        ["daily-collections", "nav-daily-collections"],
        ["division-supervision", "nav-division-supervision"],
        ["complaint-oversight", "nav-complaint-oversight"],
        ["fleet-operations", "nav-fleet-operations"],
        ["reports-analytics", "nav-reports-analytics"],
        ["security-administration", "nav-security-administration"]
    ];

    test("Each DC navigation item points to its own isolated dashboard panel", () => {
        for (const [panelId, navId] of expected) {
            const navRegex = new RegExp(`<a class="nav-item(?: active)?" href="#${panelId}" id="${navId}" aria-controls="${panelId}"`);
            assert.match(html, navRegex, `Missing navigation control for ${panelId}`);
            const panelOpening = html.match(new RegExp(`<section\\b[^>]*\\bid="${panelId}"[^>]*>`));
            assert.ok(panelOpening, `Missing panel ${panelId}`);
            assert.match(panelOpening[0], /dashboard-tab-panel/, `${panelId} must be a tab panel`);
            if (panelId === "overview") {
                assert.doesNotMatch(panelOpening[0], /\shidden(?:\s|>)/, "Overview is the initial visible panel");
            } else {
                assert.match(panelOpening[0], /\shidden(?:\s|>)/, `${panelId} must start hidden`);
            }
            assert.match(panelOpening[0], new RegExp(`aria-labelledby="${navId}"`));
        }
        assert.equal((html.match(/\bdashboard-tab-panel\b/g) || []).length, expected.length);
    });

    test("Section navigation switches panels and supports direct links and browser history", () => {
        assert.match(js, /function activateNavigation\(link\)/);
        assert.match(js, /panel\.hidden = !active/);
        assert.match(js, /window\.addEventListener\("hashchange"/);
        assert.match(js, /function activateNavigationFromHash\(\)/);
        assert.match(js, /activateNavigationFromHash\(\);/);
        assert.match(js, /aria-current", "page"/);
    });

    test("Topbar title and description reflect the selected tab", () => {
        assert.match(html, /id="pageTitle"/);
        assert.match(html, /id="pageDescription"/);
        assert.match(js, /const NAVIGATION_META = \{/);
        assert.match(js, /pageTitle\.textContent = meta\.title/);
        assert.match(js, /pageDescription\.textContent = meta\.description/);
        assert.match(js, /document\.title = `\$\{meta\.title\} \| SWACHHITRA`/);
    });

    test("Single-panel visibility is styled accessibly and respects reduced-motion settings", () => {
        assert.match(css, /\.dashboard-tab-panel\[hidden\]\s*\{\s*display:\s*none\s*!important/s);
        assert.match(css, /\.dashboard-tab-panel\.is-active\s*\{\s*animation:/s);
        assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        assert.match(css, /\.main-nav \.nav-item:focus-visible/);
    });

    test("Existing protected DC feature APIs and security middleware remain registered", () => {
        assert.match(routes, /router\.use\(requireRole\("deputy_commissioner"\)\)/);
        for (const [endpoint, handler] of [
            ["/overview", "getCityOverview"],
            ["/divisions", "getDivisionSupervision"],
            ["/complaints", "getComplaintOversight"],
            ["/fleet", "getFleetOperations"],
            ["/reports", "getReportsAnalytics"],
            ["/security", "getSecurityCenter"]
        ]) {
            assert.ok(routes.includes(`"${endpoint}"`) && routes.includes(handler), `Missing route ${endpoint}`);
        }
        assert.match(routes, /requireDeputyCommissionerMutationSecurity, updateStaffAccountStatus/);
        assert.match(routes, /requireDeputyCommissionerMutationSecurity, escalateComplaint/);
        assert.doesNotMatch(controller, /waste_tonsELSE|ELSE0/);
        assert.match(controller, /THEN col\.waste_tons ELSE 0 END/);
        assert.match(controller, /THEN 1 ELSE 0 END/);
    });

    console.log(`\nFinal integration / Part 7: ${passed} passed, ${failed} failed`);
    return { passed, failed };
}

async function main() {
    const staticSuites = [
        ["Foundation / Part 2", runStaticPart2],
        ["Shared DC regression", runStaticSharedRegression],
        ["Complaint oversight / Part 3", runStaticPart3],
        ["Fleet operations / Part 4", runStaticPart4],
        ["Reports / Part 5", runStaticPart5],
        ["Security administration / Part 6", runStaticPart6],
        ["Final integration / Part 7", runStaticPart7]
    ];
    for (const [label, runSuite] of staticSuites) addResult(label, runSuite());
    addResult("Complaint escalation behavior", await runBehaviorPart3());
    addResult("Fleet behavior", await runBehaviorPart4());
    addResult("Reports behavior", await runBehaviorPart5());
    addResult("Security administration behavior", await runBehaviorPart6());
    console.log(`\nDEPUTY COMMISSIONER TOTAL: ${allResults.passed} passed, ${allResults.failed} failed`);
    if (allResults.failed > 0) process.exitCode = 1;
}
main().catch((error) => { console.error("Unexpected consolidated test runner failure:", error); process.exitCode = 1; });

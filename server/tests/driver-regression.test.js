"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
let passed = 0;
let failed = 0;

test("Inspector map visually highlights only fresh live GPS markers with a pulsing green halo", () => {
    const client = read("client/inspectorDash/inspectorDash.js");
    const css = read("client/inspectorDash/inspectorDash.css");
    assert.match(client, /gps-\$\{escapeHTML\(gpsState\)\}/);
    assert.match(client, /ageSeconds <= 30/);
    assert.match(css, /\.custom-truck-marker\.gps-live::before/);
    assert.match(css, /@keyframes truck-live-pulse/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(client, /data-gps-state="\$\{escapeHTML\(gpsState\)\}"/);
    assert.match(client, /aria-label="\$\{escapeHTML\(markerLabel\)\}"/);
});

test("Part 7 live truck highlight uses a vivid green filled bloom rather than a faint outline", () => {
    const css = read("client/inspectorDash/inspectorDash.css");
    assert.match(css, /background:\s*rgba\(52, 211, 85, 0\.48\)/);
    assert.match(css, /background:\s*rgba\(38, 198, 75, 0\.40\)/);
    assert.match(css, /transform:\s*scale\(1\.9\)/);
    assert.match(css, /border:\s*2px solid rgba\(20, 139, 53, 0\.90\)/);
    assert.match(css, /opacity:\s*0/);
    assert.match(css, /z-index:\s*-1/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Driver routes and collection stops use richer colors and accessible hover states", () => {
    const css = read("client/driverDash/driverDash.css");
    const client = read("client/driverDash/driverDash.js");
    assert.match(css, /\.route-card:hover/);
    assert.match(css, /\.stop-row:hover/);
    assert.match(css, /\.driver-map-stop-marker:hover/);
    assert.match(css, /\.driver-map-stop-marker:focus-visible/);
    assert.match(client, /"line-color": "#2f8a43"/);
    assert.match(client, /"line-color": "#9bcf39"/);
});

test("Assistant Commissioner truck markers receive a vivid highlight only for fresh GPS", () => {
    const client = read("client/assistantDash/assistantDash.js");
    const css = read("client/assistantDash/assistantDash.css");
    assert.match(client, /function getOverviewVehicleGpsState\(vehicle/);
    assert.match(client, /gps-live/);
    assert.match(client, /last_location_at/);
    assert.match(css, /\.overview-map-card \.custom-truck-marker\.gps-live::before/);
    assert.match(css, /background:\s*rgba\(52, 211, 85, 0\.48\)/);
    assert.match(css, /@keyframes ac-truck-live-pulse/);
});

test("Driver GPS footer reflects successful sharing, approximate fixes, and upload failures", () => {
    const client = read("client/driverDash/driverDash.js");
    const page = read("client/driverDash/driverDash.html");
    const css = read("client/driverDash/driverDash.css");
    assert.match(page, /id="driverMapHudFootnote" data-state="pending"/);
    assert.match(client, /Live GPS confirmed · location shared with Inspector/);
    assert.match(client, /\$\{latitude\.toFixed\(6\)\}, \$\{longitude\.toFixed\(6\)\}/);
    assert.match(client, /Approximate GPS shared with Inspector/);
    assert.match(client, /GPS upload failed · will retry on the next location update/);
    assert.match(css, /driver-map-hud-footnote\[data-state="live"\]/);
    assert.match(css, /driver-map-hud-footnote\[data-state="error"\]/);
});

test("Inspector live tracking retains HTTP status and stops polling on authorization failures", () => {
    const client = read("client/inspectorDash/inspectorDash.js");
    const routes = read("server/routes/inspectorRoutes.js");
    const auth = read("server/middleware/authMiddleware.js");
    assert.match(client, /error\.status = response\.status/);
    assert.match(client, /liveTrackingPollingStopped = true/);
    assert.match(client, /Live tracking access denied/);
    assert.match(client, /Math\.min\(Math\.max\(10000, liveTrackingRetryDelayMs \* 2\), 60000\)/);
    assert.match(client, /setTimeout\(\(\) =>/);
    assert.match(routes, /router\.use\(requireRole\(\.\.\.OPERATIONAL_VIEW_ROLES\)\)/);
    assert.match(routes, /"sanitary_inspector"/);
    assert.match(auth, /return res\.status\(403\)\.json/);
});

function read(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function test(name, callback) {
    try {
        callback();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${name} - ${error.message}`);
    }
}

test("Driver API is mounted and requires the Driver role", () => {
    const server = read("server/server.js");
    const routes = read("server/routes/driverRoutes.js");
    assert.match(server, /app\.use\("\/api\/driver", driverRoutes\)/);
    assert.match(routes, /router\.use\(requireRole\("driver"\)\)/);
    assert.match(routes, /router\.get\("\/me", getMyDriver\)/);
    assert.match(routes, /router\.get\("\/assignments", getMyAssignments\)/);
});

test("Driver identity is derived from the authenticated user, not request IDs", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /WHERE d\.user_id = \?/);
    assert.match(controller, /req\.currentUser\?\.id/);
    assert.doesNotMatch(controller, /req\.(?:query|body|params)\.driverId/);
});

test("Assignment and stop queries are restricted to the linked Driver record", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /WHERE ra\.driver_id = \?/);
    assert.match(controller, /ra\.unassigned_at IS NULL/);
    assert.match(controller, /owned_ra\.driver_id = \?/);
    assert.match(controller, /const placeholders = routeIds\.map\(\(\) => "\?"\)/);
});

test("Inspector account provisioning requires role and mutation security", () => {
    const routes = read("server/routes/inspectorRoutes.js");
    assert.match(routes, /router\.post\("\/drivers\/:id\/account", requireInspectorWrite, requireInspectorMutationSecurity, createDriverLoginAccount\)/);
});

test("New Driver account gets a random undisclosed password and hashed storage", () => {
    const controller = read("server/controllers/driverAccountController.js");
    assert.match(controller, /crypto\.randomBytes\(32\)/);
    assert.match(controller, /bcrypt\.hash\(undisclosedPassword, 12\)/);
    assert.match(controller, /The Driver must use Forgot Password to set a password/);
    assert.doesNotMatch(controller, /password:\s*undisclosedPassword/);
});

test("Account provisioning accepts the Inspector-assigned email and persists it with the Driver link", () => {
    const controller = read("server/controllers/driverAccountController.js");
    assert.match(controller, /INNER JOIN user_profiles inspector_scope/);
    assert.match(controller, /inspector_scope\.ward_id = w\.id/);
    assert.match(controller, /const emailWasProvided = Object\.prototype\.hasOwnProperty\.call\(\s*req\.body \|\| \{\},\s*"email"\s*\)/);
    assert.match(controller, /const requestedEmail = emailWasProvided\s*\? req\.body\.email\s*: driver\.email/);
    assert.match(controller, /UPDATE drivers\s+SET email = \?/);
    assert.match(controller, /const employeeId = String\(driver\.employee_id/);
    assert.match(controller, /driver\.assigned_ward_id/);
    assert.match(controller, /UPDATE drivers\s+SET user_id = \?/);
});

test("Driver self-service cannot change official identity or jurisdiction", () => {
    const controller = read("server/controllers/profileController.js");
    assert.match(controller, /if \(user\.role === "driver"\)\s*\{\s*return res\.status\(403\)/);
    assert.match(controller, /Driver identity, licence details and assigned Ward are managed through the Inspector's Driver Registry/);
});

test("Linked Driver login email cannot be changed independently in the Registry", () => {
    const controller = read("server/controllers/inspectorController.js");
    assert.match(controller, /if \(existing\.user_id && currentEmail !== nextEmail\)/);
    assert.match(controller, /Registry email cannot be changed independently/);
});

test("Driver has a dedicated read-only profile page backed by the Driver Registry API", () => {
    const html = read("client/driverProfile/driverProfile.html");
    const client = read("client/driverProfile/driverProfile.js");
    assert.match(html, /driverProfileDetails/);
    assert.match(client, /fetch\("\/api\/driver\/me"/);
    assert.match(client, /textContent/);
    assert.match(client, /window\.location\.replace\("\/login"\)/);
});

test("Inspector fleet registry lets an eligible unlinked Driver receive an email and login", () => {
    const client = read("client/inspectorDash/inspectorDash.js");
    assert.match(client, /data-fleet-action="create-driver-account"/);
    assert.match(client, /driver\.userId/);
    const html = read("client/inspectorDash/inspectorDash.html");
    assert.match(client, /Assign Email & Create Login/);
    assert.match(client, /driverAccountForm/);
    assert.match(client, /driverAccountEmail/);
    assert.match(client, /body: JSON\.stringify\(\{ email \}\)/);
    assert.match(client, /\/api\/inspector\/drivers\/\$\{driverId\}\/account/);
    assert.match(html, /id="driverAccountModal"/);
    assert.match(html, /name="email"[^>]*required|type="email"[\s\S]*?required/);
});

test("Driver can set an initial password through the existing single-use reset flow", () => {
    const lifecycle = read("server/controllers/accountLifecycleController.js");
    const approvedRoles = /\["citizen", "driver", "sanitary_inspector", "assistant_commissioner", "deputy_commissioner"\]/;
    assert.match(lifecycle, /function findEligiblePasswordResetTarget\(/);
    assert.match(lifecycle, /AND u\.status = 'active'/);
    assert.match(lifecycle, new RegExp(approvedRoles.source + "\\.includes\\(row\\.role\\)"));
    assert.match(lifecycle, /INSERT INTO citizen_account_security \(user_id, email_verified_at, session_version\)[\s\S]*VALUES \(\?, NULL, 1\)[\s\S]*ON DUPLICATE KEY UPDATE[\s\S]*session_version = session_version \+ 1/);
    assert.match(lifecycle, /used_at IS NULL AND t\.expires_at > UTC_TIMESTAMP\(3\)/);
    assert.match(lifecycle, /UPDATE citizen_account_tokens SET used_at = COALESCE\(used_at, UTC_TIMESTAMP\(3\)\) WHERE user_id = \? AND used_at IS NULL/);
});

test("Driver Part 2 dashboard is protected and fetches only the authenticated Driver's data", () => {
    const server = read("server/server.js");
    const html = read("client/driverDash/driverDash.html");
    const js = read("client/driverDash/driverDash.js");
    const css = read("client/driverDash/driverDash.css");
    assert.match(server, /requirePageRole\("driver"\)[\s\S]{0,500}driverDash\.html/);
    assert.match(html, /\/driverDash\/driverDash\.css/);
    assert.match(html, /\/driverDash\/driverDash\.js/);
    assert.match(js, /\/api\/driver\/me/);
    assert.match(js, /\/api\/driver\/assignments/);
    assert.match(js, /textContent/);
    assert.match(css, /\/inspectorDash\/inspectorDash\.css/);
    assert.match(js, /navigator\.geolocation/);
});

test("Each staff role has a protected role-specific profile entry page", () => {
    const server = read("server/server.js");
    for (const [path, role] of [
        ["inspectorProfile", "sanitary_inspector"],
        ["assistantProfile", "assistant_commissioner"],
        ["deputyCommissionerProfile", "deputy_commissioner"],
        ["driverProfile", "driver"]
    ]) {
        assert.ok(server.includes(`/${path}`), `Missing page route ${path}`);
        assert.ok(server.includes(`requirePageRole("${role}")`), `Missing role guard for ${role}`);
        assert.ok(read(`client/${path}/${path}.html`).length > 0, `Missing ${path} HTML`);
        assert.ok(read(`client/${path}/${path}.css`).length > 0, `Missing ${path} CSS`);
        assert.ok(read(`client/${path}/${path}.js`).length > 0, `Missing ${path} JS`);
    }
    const login = read("client/login/login.js");
    assert.match(login, /case "driver":\s*return "\/driverDash"/);
});


test("Driver route mutations are registered behind CSRF/origin/rate-limit protection", () => {
    const routes = read("server/routes/driverRoutes.js");
    const middleware = read("server/middleware/driverSecurityMiddleware.js");
    assert.match(routes, /router\.post\([\s\S]*?\/assignments\/:assignmentId\/start/);
    assert.match(routes, /\/stops\/:stopId\/status/);
    assert.match(routes, /\/assignments\/:assignmentId\/delay/);
    assert.match(routes, /\/assignments\/:assignmentId\/complete/);
    assert.match(routes, /requireDriverMutationSecurity/);
    assert.match(middleware, /timingSafeEqual/);
    assert.match(middleware, /Retry-After/);
});

test("Driver route workflow verifies ownership and uses database transactions", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /beginTransaction\(\)/);
    assert.match(controller, /ra\.driver_id = \?/);
    assert.match(controller, /STOPS_REMAINING/);
    assert.match(controller, /UPDATE route_stops SET status = \?/);
    assert.match(controller, /INSERT INTO notifications/);
    assert.match(controller, /connection\.rollback\(\)/);
});

test("Driver dashboard exposes route and stop actions with CSRF protection", () => {
    const page = read("client/driverDash/driverDash.html");
    const client = read("client/driverDash/driverDash.js");
    const css = read("client/driverDash/driverDash.css");
    assert.match(page, /Driver Dashboard/);
    assert.match(client, /\/api\/driver\/security\/csrf-token/);
    assert.match(client, /Mark collected/);
    assert.match(client, /Report delay/);
    assert.match(client, /Complete route/);
    assert.match(client, /X-CSRF-Token/);
    assert.match(css, /\.driver-route-actions/);
});

test("Readiness checks include the Driver module's core tables", () => {
    const server = read("server/server.js");
    for (const table of ["drivers", "vehicles", "route_assignments", "route_stops", "inspector_operational_areas"]) {
        assert.ok(server.includes(`"${table}"`), `Missing readiness dependency: ${table}`);
    }
});

test("Driver map loads MapLibre assets before the dashboard controller", () => {
    const page = read("client/driverDash/driverDash.html");
    assert.match(page, /maplibre-gl@5\.12\.0\/dist\/maplibre-gl\.css/);
    assert.match(page, /maplibre-gl@5\.12\.0\/dist\/maplibre-gl\.js/);
    assert.match(page, /id="driverRouteMap"/);
    assert.match(page, /id="driverMapRouteSelector"/);
});

test("Map route choices are populated only from authenticated Driver assignments", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /fetchJSON\("\/api\/driver\/assignments"\)/);
    assert.match(client, /assignments\.forEach\(assignment => \{/);
    assert.match(client, /selectedNavigationAssignmentId/);
    assert.match(client, /function selectedAssignment\(\)/);
});

test("Map requires real stop coordinates and never guesses missing collection locations", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /function coordinateForStop\(stop\)/);
    assert.match(client, /stop\.latitude === null/);
    assert.match(client, /stop\.longitude === null/);
    assert.match(client, /if \(missing > 0\)/);
    assert.match(client, /The map will not guess these locations/);
});

test("Map uses OpenFreeMap vector tiles with a 3D building extrusion layer", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/);
    assert.match(client, /fill-extrusion/);
    assert.match(client, /driver-3d-buildings/);
    assert.match(client, /render_height/);
});

test("Map requests street route geometry and falls back without inventing locations", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//);
    assert.match(client, /geometries=geojson/);
    assert.match(client, /using the stop-to-stop preview line/);
    assert.match(client, /coordinates = stops\.map\(coordinateForStop\)\.filter\(Boolean\)/);
});

test("Truck marker animates along the computed route geometry using the top-down waste-truck asset", () => {
    const client = read("client/driverDash/driverDash.js");
    const css = read("client/driverDash/driverDash.css");
    assert.match(client, /function createTruckElement\(\)/);
    assert.match(client, /\/assets\/waste-truck-top\.png/);
    assert.match(client, /function pointAtDistance\(/);
    assert.match(client, /navigator\.geolocation\.watchPosition/);
    assert.match(client, /truckMarker\.setLngLat\(coord\)/);
    assert.match(client, /driver-route-progress/);
    assert.match(client, /const delta = \(\(target - currentNormalized \+ 540\) % 360\) - 180/);
    assert.match(client, /truckWorldHeadingDegrees - mapBearing/);
    assert.match(css, /border:\s*0/);
    assert.match(css, /background:\s*transparent/);
    assert.match(css, /driver-truck-marker-image/);
});

test("Optional missing map style icons have a transparent fallback instead of repeated warnings", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /styleimagemissing/);
    assert.match(client, /driverMap\.addImage\(imageId/);
});

test("Navigation preview follows the truck with a pitched map camera", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /pitch: is3DView \? 58 : 0/);
    assert.match(client, /driverMap\.easeTo\(camera\)/);
    const page = read("client/driverDash/driverDash.html");
    assert.match(page, /GPS|location/i);
    assert.match(client, /Live GPS/);
    assert.match(client, /\/api\/driver\/location/);
});

test("Driver dashboard server policy allows only the required map and routing hosts", () => {
    const server = read("server/server.js");
    const start = server.indexOf('app.get(["/driverDash", "/driverDash/", "/driverDash/driverDash.html"]');
    assert.notEqual(start, -1);
    const end = server.indexOf("Protected Sanitary Inspector dashboard", start);
    const block = server.slice(start, end);
    assert.match(block, /https:\/\/unpkg\.com/);
    assert.match(block, /https:\/\/tiles\.openfreemap\.org/);
    assert.match(block, /https:\/\/router\.project-osrm\.org/);
    assert.match(block, /worker-src 'self' blob:/);
    assert.ok(block.includes("connect-src 'self' https://unpkg.com"));
});

test("Driver CSRF token endpoint is registered behind the Driver role", () => {
    const routes = read("server/routes/driverRoutes.js");
    assert.match(routes, /router\.use\(requireRole\("driver"\)\)/);
    assert.match(routes, /router\.get\("\/security\/csrf-token", ensureDriverCsrfToken\)/);
});

test("Part 4 location endpoint is Driver-role protected and mutation-secured", () => {
    const routes = read("server/routes/driverRoutes.js");
    const controller = read("server/controllers/driverController.js");
    assert.match(routes, /router\.use\(requireRole\("driver"\)\)/);
    assert.match(routes, /router\.post\("\/location", requireDriverMutationSecurity, updateMyLocation\)/);
    assert.match(controller, /async function updateMyLocation\(req, res\)/);
    assert.match(controller, /WHERE ra\.id = \? AND ra\.driver_id = \? AND ra\.unassigned_at IS NULL/);
    assert.match(controller, /SET current_latitude = \?,[\s\S]*?current_location_accuracy_meters = \?,[\s\S]*?last_location_at = NOW\(\)/);
    assert.match(controller, /accuracy > 1000/);
});

test("Part 4 sends real browser GPS and does not animate simulated coordinates", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /navigator\.geolocation\.watchPosition/);
    assert.match(client, /\/api\/driver\/location/);
    assert.match(client, /enableHighAccuracy: true/);
    assert.match(client, /clearWatch/);
    assert.match(client, /image\.src = \"\/assets\/waste-truck-top\.png\"/);
    assert.doesNotMatch(client.slice(client.indexOf("function startNavigationPreview"), client.indexOf("function handleNavigationStartButton")), /requestAnimationFrame\(frame\)/);
});


test("GPS readings between 150 m and 1000 m are shown and uploaded with an accuracy warning", () => {
    const client = read("client/driverDash/driverDash.js");
    assert.match(client, /const accuracyAcceptableForServer = accuracy <= 1000/);
    assert.match(client, /if \(accuracyAcceptableForServer && now - lastLocationSentAt >= 4500/);
    assert.match(client, /Approximate GPS location sent to SWACHHITRA/);
    assert.match(client, /too imprecise to send safely/);
    assert.doesNotMatch(client, /if \(accuracy > 150\) \{[\s\S]{0,260}return;/);
});

test("GPS endpoint rejects blank and non-scalar required coordinates instead of coercing them to zero", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /function parseStrictNumber\(value\)/);
    assert.match(controller, /parseStrictNumber\(req\.body\?\.latitude\)/);
    assert.match(controller, /parseStrictNumber\(req\.body\?\.longitude\)/);
    assert.match(controller, /parseStrictNumber\(req\.body\?\.accuracy\)/);
    assert.match(controller, /: parseStrictNumber\(headingValue\)/);
    assert.match(controller, /: parseStrictNumber\(speedValue\)/);
    assert.match(controller, /Array\.isArray\(req\.body\)/);
    assert.doesNotMatch(controller, /const latitude = Number\(req\.body\?\.latitude\)/);
});

test("Inspector live-tracking endpoint is authenticated, scoped, and returns only active route vehicles", () => {
    const routes = read("server/routes/inspectorRoutes.js");
    const controller = read("server/controllers/inspectorController.js");
    assert.match(routes, /router\.use\(requireRole\(\.\.\.OPERATIONAL_VIEW_ROLES\)\)/);
    assert.match(routes, /router\.get\("\/live-tracking", getLiveTracking\)/);
    assert.match(controller, /async function getLiveTracking\(req, res\)/);
    assert.match(controller, /vehicleManagementScope\(scope/);
    assert.match(controller, /ra\.status IN \('active', 'delayed'\)/);
    assert.match(controller, /r\.status IN \('active', 'delayed'\)/);
    assert.match(controller, /Cache-Control", "no-store, no-cache, must-revalidate, private/);
    assert.match(controller, /recordedAt: isoOrNull\(row\.last_location_at\)/);
});

test("Inspector map polls live locations without rebuilding route overlays each time and labels GPS freshness", () => {
    const client = read("client/inspectorDash/inspectorDash.js");
    const page = read("client/inspectorDash/inspectorDash.html");
    const css = read("client/inspectorDash/inspectorDash.css");
    assert.match(client, /\/api\/inspector\/live-tracking/);
    assert.match(client, /window\.setTimeout\(\(\) => \{\s*liveTrackingPollTimer = null;\s*void pollLiveTracking\(\);\s*\}, Math\.max\(0, delayMs\)\)/);
    assert.match(client, /document\.visibilityState === "hidden"/);
    assert.match(client, /synchronizeVehicleMarkers\(overviewMap, overviewMarkers\)/);
    assert.match(client, /getVehicleGpsFreshness/);
    assert.match(client, /Live tracking connection interrupted|Live tracking access denied/);
    assert.match(page, /id="liveTrackingStatus"/);
    assert.match(css, /\.live-tracking-status\.live/);
    const initializeMapsBlock = client.slice(client.indexOf("function initializeMaps()"), client.indexOf("function clearMarkerMap", client.indexOf("function initializeMaps()")));
    assert.doesNotMatch(initializeMapsBlock, /truckLayerButton\?\.addEventListener|corridorButton\?\.addEventListener|mapPlus\.addEventListener|mapMinus\.addEventListener/);
});

test("Part 7 Driver-to-Inspector live tracking contract preserves the stored location and stops stale highlights", () => {
    const driver = read("client/driverDash/driverDash.js");
    const driverApi = read("server/controllers/driverController.js");
    const inspectorApi = read("server/controllers/inspectorController.js");
    const inspector = read("client/inspectorDash/inspectorDash.js");

    assert.match(driver, /navigator\.geolocation\.watchPosition/);
    assert.match(driver, /\/api\/driver\/location/);
    assert.match(driverApi, /SET current_latitude = \?,[\s\S]*?current_location_accuracy_meters = \?,[\s\S]*?last_location_at = NOW\(\)/);
    assert.match(inspectorApi, /recordedAt: isoOrNull\(row\.last_location_at\)/);
    assert.match(inspector, /ageSeconds <= 30/);
    assert.match(inspector, /ageSeconds <= 120/);
    assert.match(inspector, /gps-\$\{escapeHTML\(gpsState\)\}/);
});

test("Driver can report a full truck only for an active owned assignment and the assigned Inspector is notified", () => {
    const page = read("client/driverDash/driverDash.html");
    const client = read("client/driverDash/driverDash.js");
    const routes = read("server/routes/driverRoutes.js");
    const controller = read("server/controllers/driverController.js");
    const inspectorClient = read("client/inspectorDash/inspectorDash.js");

    assert.match(page, /id="driverTruckFullButton"/);
    assert.match(client, /function handleTruckFullReport\(\)/);
    assert.match(client, /\/api\/driver\/assignments\/\$\{encodeURIComponent\(assignmentId\)\}\/truck-full/);
    assert.match(client, /reportedTruckFullAssignmentIds/);
    assert.match(routes, /router\.post\([\s\S]*?"\/assignments\/:assignmentId\/truck-full"[\s\S]*?requireDriverMutationSecurity[\s\S]*?reportMyTruckFull/);
    assert.match(controller, /async function reportMyTruckFull\(req, res\)/);
    assert.match(controller, /ra\.driver_id = \?/);
    assert.match(controller, /ra\.unassigned_at IS NULL/);
    assert.match(controller, /notification_type, priority, related_route_id\)/);
    assert.match(controller, /'truck_full_report', 'high'/);
    assert.match(controller, /p\.ward_id = \?/);
    assert.match(controller, /p\.division_id = \?/);
    assert.match(inspectorClient, /NOTIFICATION_POLL_INTERVAL_MS = 15000/);
    assert.match(inspectorClient, /!item\.is_read/);
    assert.match(inspectorClient, /showIncomingNotification\(item, "Inspector update"\)/);
});

test("Truck-full report does not require a schema migration and avoids duplicate unread reports", () => {
    const controller = read("server/controllers/driverController.js");
    assert.match(controller, /notification_type = 'truck_full_report'/);
    assert.match(controller, /AND is_read = FALSE/);
    assert.match(controller, /A truck-full report for this route is already awaiting Inspector action/);
    assert.match(controller, /Assignment ID: \$\{assignmentId\}/);
});


test("Starting or resuming real GPS sharing sends approximate ETA notices only to Citizens near pending stops in the exact Ward, Zone and Division", () => {
    const controller = read("server/controllers/driverController.js");
    const client = read("client/driverDash/driverDash.js");
    assert.match(controller, /function gpsDistanceMeters\(lat1, lon1, lat2, lon2\)/);
    assert.match(controller, /CITIZEN_ROUTE_STOP_RADIUS_METERS = 750/);
    assert.match(controller, /async function notifyNearbyCitizensOnGpsResume\(connection, assignment, driver, gps, pushQueue = \[\]\)/);
    assert.match(controller, /req\.body\?\.announceStart === true/);
    assert.match(controller, /status IN \('pending', 'in_progress'\)/);
    assert.match(controller, /citizen_profile\.ward_id = \?/);
    assert.match(controller, /citizen_profile\.zone_id = \?/);
    assert.match(controller, /citizen_profile\.division_id = \?/);
    assert.match(controller, /address_latitude IS NOT NULL/);
    assert.match(controller, /address_longitude IS NOT NULL/);
    assert.match(controller, /approximately \${etaMinutes} minutes/);
    assert.match(client, /gpsAnnouncementPending = true/);
    assert.match(client, /announceStart: announceGpsStart/);
    assert.match(client, /locationResult\.citizenNotificationsCreated/);
    const startHandler = controller.slice(
        controller.indexOf("async function startMyAssignment"),
        controller.indexOf("async function updateMyStop")
    );
    assert.doesNotMatch(startHandler, /notifyNearbyCitizensOnGpsResume|notifyCitizensRouteStarted/);
    const notificationHelper = controller.slice(
        controller.indexOf("async function notifyNearbyCitizensOnGpsResume"),
        controller.indexOf("async function startMyAssignment")
    );
    assert.doesNotMatch(notificationHelper, /INSERT INTO notifications[\s\S]{0,400}address_latitude|INSERT INTO notifications[\s\S]{0,400}address_longitude/);
    assert.match(notificationHelper, /GPS-distance estimate; road layout and traffic may change/);
});

test("Citizen notifications endpoint remains authenticated, Ward-scoped, and mark-read mutations require CSRF security", () => {
    const routes = read("server/routes/citizenRoutes.js");
    const controller = read("server/controllers/citizenController.js");
    const page = read("client/citizenDash/citizenDash.html");
    const client = read("client/citizenDash/citizenDash.js");
    assert.ok(routes.includes('router.use(requireRole("citizen"))'));
    assert.ok(routes.includes('router.get("/notifications", getCitizenNotifications)'));
    assert.ok(routes.includes('router.put("/notifications/read", protectCitizenMutation, markCitizenNotificationsRead)'));
    assert.ok(controller.includes("async function getCitizenNotifications(req, res)"));
    assert.ok(controller.includes("r.ward_id = profile.ward_id"));
    assert.ok(controller.includes("r.zone_id = profile.zone_id"));
    assert.ok(controller.includes("r.division_id = profile.division_id"));
    assert.ok(controller.includes("n.recipient_user_id = ?"));
    assert.ok(page.includes('id="citizenNotificationsList"'));
    assert.ok(client.includes("/api/citizen/notifications"));
    assert.ok(client.includes("updates checked every 15 seconds"));
});

test("Citizen complaints notify active Inspector(s) for the exact Ward without putting residential address data in notification text", () => {
    const controller = read("server/controllers/citizenController.js");
    const inspectorClient = read("client/inspectorDash/inspectorDash.js");
    const complaintBlock = controller.slice(
        controller.indexOf("async function createCitizenComplaint"),
        controller.indexOf("async function cancelCitizenComplaint")
    );
    assert.ok(complaintBlock.includes("SELECT DISTINCT u.id, ip.full_name"));
    assert.ok(complaintBlock.includes("ip.ward_id = ?"));
    assert.ok(complaintBlock.includes("ip.division_id = ?"));
    assert.ok(complaintBlock.includes("'citizen_complaint', 'high'"));
    assert.ok(complaintBlock.includes("related_complaint_id"));
    assert.ok(complaintBlock.includes("Open the Inspector Complaints section"));
    const notificationMessage = complaintBlock.slice(
        complaintBlock.indexOf("const inspectorNotificationMessage ="),
        complaintBlock.indexOf("for (const inspector of inspectorRows)")
    );
    assert.doesNotMatch(notificationMessage, /profile\.address|address_latitude|address_longitude/);
    assert.ok(inspectorClient.includes('showIncomingNotification(item, "Inspector update")'));
    assert.match(inspectorClient, /const newOperationalAlerts = refreshed\.filter\(item =>[\s\S]*?!item\.is_read/);
    assert.ok(inspectorClient.includes("startNotificationPolling()"));
});

test("Inspector route assignment changes notify affected Driver logins and include truck-full context when relevant", () => {
    const inspectorController = read("server/controllers/inspectorController.js");
    const driverController = read("server/controllers/driverController.js");
    const driverRoutes = read("server/routes/driverRoutes.js");
    const page = read("client/driverDash/driverDash.html");
    const client = read("client/driverDash/driverDash.js");
    const css = read("client/driverDash/driverDash.css");

    assert.match(inspectorController, /async function notifyDriversOfRouteAssignmentChange\(/);
    assert.match(inspectorController, /previousDriverId/);
    assert.match(inspectorController, /nextDriverId/);
    assert.match(inspectorController, /notification_type = 'truck_full_report'/);
    assert.match(inspectorController, /This update supports remaining collection after a truck-full report/);
    assert.match(inspectorController, /'route_assignment_changed', 'high'/);
    assert.match(inspectorController, /if \(assignmentChangeRequested\) \{[\s\S]*?await notifyDriversOfRouteAssignmentChange\(/);
    const directAssignmentBlock = inspectorController.slice(
        inspectorController.indexOf("async function updateRouteAssignment("),
        inspectorController.indexOf("async function removeRouteAssignment(")
    );
    assert.match(directAssignmentBlock, /if \(assignmentChanged\) \{[\s\S]*?await notifyDriversOfRouteAssignmentChange\(/);
    const createRouteBlock = inspectorController.slice(
        inspectorController.indexOf("async function createRoute("),
        inspectorController.indexOf("async function updateRoute(")
    );
    assert.match(createRouteBlock, /await notifyDriversOfRouteAssignmentChange\(/);
    assert.match(driverRoutes, /router\.get\("\/notifications", getMyNotifications\)/);
    assert.match(driverRoutes, /router\.post\("\/notifications\/read", requireDriverMutationSecurity, markMyNotificationsRead\)/);
    assert.match(driverController, /async function getMyNotifications\(req, res\)/);
    assert.match(driverController, /n\.recipient_user_id = \?/);
    assert.match(driverController, /async function markMyNotificationsRead\(req, res\)/);
    assert.match(page, /id="driverNotifications"/);
    assert.match(page, /id="driverNotificationNavCount"/);
    assert.match(client, /async function refreshDriverNotifications\(/);
    assert.match(client, /\/api\/driver\/notifications/);
    assert.match(client, /DRIVER_NOTIFICATION_POLL_MS = 15000/);
    assert.match(client, /function markDriverNotificationsRead\(/);
    assert.match(css, /\.driver-notification-card\.is-unread/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});


test("Route detail and collection-stop changes notify the currently assigned Driver, with truck-full context and duplicate suppression", () => {
    const inspectorController = read("server/controllers/inspectorController.js");
    const driverCss = read("client/driverDash/driverDash.css");

    assert.match(inspectorController, /async function notifyAssignedDriverOfRoutePlanChange\(/);
    assert.match(inspectorController, /Your assigned route .* has changed because/);
    assert.match(inspectorController, /This change supports remaining collection after a truck-full report/);
    assert.match(inspectorController, /INTERVAL 2 MINUTE/);

    const routeUpdateBlock = inspectorController.slice(
        inspectorController.indexOf("async function updateRoute("),
        inspectorController.indexOf("async function getRouteStopsForInspector(")
    );
    assert.match(routeUpdateBlock, /updates\.length && !assignmentChangeRequested && currentAssignment[\s\S]*?notifyAssignedDriverOfRoutePlanChange/);

    const createStopBlock = inspectorController.slice(
        inspectorController.indexOf("async function createRouteStop("),
        inspectorController.indexOf("async function updateRouteStop(")
    );
    assert.match(createStopBlock, /notifyAssignedDriverOfRoutePlanChange/);

    const updateStopBlock = inspectorController.slice(
        inspectorController.indexOf("async function updateRouteStop("),
        inspectorController.indexOf("async function deleteRouteStop(")
    );
    assert.match(updateStopBlock, /notifyAssignedDriverOfRoutePlanChange/);

    const deleteStopBlock = inspectorController.slice(
        inspectorController.indexOf("async function deleteRouteStop("),
        inspectorController.indexOf("async function createVehicle(")
    );
    assert.match(deleteStopBlock, /notifyAssignedDriverOfRoutePlanChange/);

    assert.match(driverCss, /driver-notifications-panel::before/);
    assert.match(driverCss, /driver-notification-card\.is-unread/);
    assert.match(driverCss, /driver-notification-accent/);
    assert.match(driverCss, /prefers-reduced-motion: reduce/);
});

console.log(`\\nDriver Navigation: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;

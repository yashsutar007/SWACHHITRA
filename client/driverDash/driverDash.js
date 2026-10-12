(() => {
    "use strict";

    const byId = id => document.getElementById(id);
    const notice = byId("driverDashboardNotice");
    const routeList = byId("routeList");
    const routeSearch = byId("routeSearch");
    const sidebar = byId("sidebar");
    const mobileBackdrop = byId("mobileBackdrop");
    const mobileMenuButton = byId("mobileMenuButton");
    const sidebarToggleButton = byId("sidebarToggleButton");
    let assignments = [];
    let driver = null;
    let csrfToken = "";

    // Part 4: MapLibre 3D-style map and route-preview state.
    const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
    const OSRM_ROUTE_BASE = "https://router.project-osrm.org/route/v1/driving/";
    const ROUTE_DEMO_DURATION_MIN_MS = 35000;
    const ROUTE_DEMO_DURATION_MAX_MS = 75000;
    const routeGeometryCache = new Map();
    const routeGeometryPromises = new Map();
    let driverMap = null;
    let mapReady = false;
    let mapReadyResolved = false;
    let resolveMapReady;
    const mapReadyPromise = new Promise(resolve => { resolveMapReady = resolve; });
    let selectedNavigationAssignmentId = "";
    let selectedRouteGeometry = null;
    let selectedRouteNavigable = false;
    let stopMarkers = [];
    let truckMarker = null;
    let truckMarkerElement = null;
    let truckWorldHeadingDegrees = 0;
    let truckVisualRotationDegrees = null;
    let animationFrameId = null;
    let geolocationWatchId = null;
    let lastGpsCoordinate = null;
    let lastLocationSentAt = 0;
    let locationPostInFlight = false;
    let lastGpsAccuracy = null;
    let navigationRunning = false;
    let navigationAssignmentId = "";
    let navigationStartedAt = 0;
    let navigationDurationMs = 0;
    let navigationCoordinates = [];
    let navigationCumulativeMeters = [];
    let navigationTotalMeters = 0;
    let navigationLastCameraUpdate = 0;
    let navigationLastProgressUpdate = 0;
    let is3DView = false;
    let routeRenderVersion = 0;

    function settleMapReady(value) {
        if (mapReadyResolved) return;
        mapReadyResolved = true;
        resolveMapReady(Boolean(value));
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function showNotice(message, kind = "") {
        notice.textContent = String(message || "");
        notice.className = `driver-notice ${kind}`.trim();
        notice.hidden = !message;
    }

    async function readJSON(response) {
        try { return await response.json(); }
        catch { throw new Error("The server returned an invalid response."); }
    }

    async function fetchJSON(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" }
        });
        const result = await readJSON(response);
        if (response.status === 401) {
            window.location.replace("/login");
            throw new Error("Your session has expired. Sign in again.");
        }
        if (!response.ok || result.success !== true) {
            throw new Error(result.message || `Request failed (${response.status}).`);
        }
        return result;
    }

    async function ensureCsrfToken() {
        if (csrfToken) return csrfToken;
        const result = await fetchJSON("/api/driver/security/csrf-token");
        csrfToken = String(result.csrfToken || "");
        if (!csrfToken) throw new Error("Could not obtain a security token. Refresh the page.");
        return csrfToken;
    }

    async function mutateJSON(url, body) {
        const token = await ensureCsrfToken();
        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-CSRF-Token": token
            },
            body: JSON.stringify(body || {})
        });
        const result = await readJSON(response);
        if (response.status === 401) {
            window.location.replace("/login");
            throw new Error("Your session has expired. Sign in again.");
        }
        if (!response.ok || result.success !== true) {
            throw new Error(result.message || `Request failed (${response.status}).`);
        }
        return result;
    }

    async function runAction(action, button) {
        button.disabled = true;
        try {
            let result;
            if (action.kind === "start") {
                result = await mutateJSON(`/api/driver/assignments/${action.assignmentId}/start`, {});
            } else if (action.kind === "stop") {
                result = await mutateJSON(`/api/driver/stops/${action.stopId}/status`, { status: action.status });
            } else if (action.kind === "delay") {
                const delayText = window.prompt("Estimated delay in minutes (1–1440):");
                if (delayText === null) return;
                const delayMinutes = Number(delayText);
                if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
                    throw new Error("Enter a whole number of delay minutes from 1 to 1440.");
                }
                const reason = window.prompt("Reason for the delay:");
                if (reason === null || !reason.trim()) throw new Error("A delay reason is required.");
                result = await mutateJSON(`/api/driver/assignments/${action.assignmentId}/delay`, {
                    delayMinutes, reason: reason.trim()
                });
            } else if (action.kind === "complete") {
                if (!window.confirm("Complete this route? Every stop must already be marked collected or skipped.")) return;
                result = await mutateJSON(`/api/driver/assignments/${action.assignmentId}/complete`, {});
            }
            showNotice(result?.message || "Update saved.", "success");
            await loadDashboard();
            if (action.kind === "complete") {
                stopNavigationPreview(true);
                setMapStatus("Route completed");
                setMapNotice("Route completed. GPS sharing has stopped on this device.", "success");
            }
            if (action.kind === "start") {
                await selectNavigationAssignment(action.assignmentId, true);
                await startNavigationPreview(action.assignmentId);
            }
        } catch (error) {
            showNotice(error.message || "Unable to save this update.", "error");
        } finally {
            button.disabled = false;
        }
    }

    function normalizedStatus(value) {
        return String(value || "unknown").replace(/_/g, " ");
    }

    function statusPill(value) {
        const raw = String(value || "unknown").toLowerCase();
        const pill = el("span", `status-pill ${raw.replace(/[^a-z0-9_-]/g, "")}`, normalizedStatus(raw));
        return pill;
    }

    function addVehicleItem(container, label, value) {
        const item = el("div", "vehicle-summary-item");
        item.append(el("span", "", label), el("strong", "", value || "Not available"));
        container.appendChild(item);
    }

    function renderVehicle() {
        const container = byId("vehicleSummary");
        container.replaceChildren();
        const assignment = assignments[0] || null;
        const vehicle = assignment?.vehicle || null;
        const badge = byId("vehicleStatusBadge");
        badge.textContent = vehicle?.status ? normalizedStatus(vehicle.status) : "Not assigned";
        badge.className = `system-status ${vehicle?.status === "delayed" ? "warning" : ""}`.trim();
        if (!vehicle) {
            container.appendChild(el("div", "empty-state", "No active vehicle assignment is linked to your account."));
            return;
        }
        addVehicleItem(container, "Vehicle number", vehicle.number);
        addVehicleItem(container, "Registration", vehicle.registrationNumber);
        addVehicleItem(container, "Vehicle type", vehicle.type);
        addVehicleItem(container, "Vehicle status", normalizedStatus(vehicle.status));
    }

    function renderStop(stop, assignment) {
        const row = el("div", "stop-row");
        row.appendChild(el("span", "stop-number", stop.order));
        const info = el("div", "stop-info");
        info.appendChild(el("span", "stop-name", stop.name || `Collection point ${stop.order}`));
        if (stop.address) info.querySelector(".stop-name").appendChild(el("span", "stop-address", stop.address));
        row.appendChild(info);
        const status = el("span", `stop-status ${String(stop.status || "").toLowerCase()}`, normalizedStatus(stop.status));
        row.appendChild(status);

        if (["active", "delayed"].includes(assignment.status) &&
            ["pending", "in_progress"].includes(stop.status)) {
            const actions = el("div", "driver-stop-actions");
            const collectedButton = el("button", "secondary-button compact-action", "Mark collected");
            collectedButton.type = "button";
            collectedButton.addEventListener("click", () => runAction({
                kind: "stop", stopId: stop.id, status: "collected"
            }, collectedButton));
            const skippedButton = el("button", "text-action", "Skip stop");
            skippedButton.type = "button";
            skippedButton.addEventListener("click", () => {
                if (window.confirm("Mark this stop as skipped? This will be recorded for operational review.")) {
                    runAction({ kind: "stop", stopId: stop.id, status: "skipped" }, skippedButton);
                }
            });
            actions.append(collectedButton, skippedButton);
            row.appendChild(actions);
        }
        return row;
    }

    function routeMatches(assignment, query) {
        if (!query) return true;
        const route = assignment.route || {};
        const vehicle = assignment.vehicle || {};
        return [route.code, route.name, vehicle.number, assignment.code]
            .some(value => String(value || "").toLowerCase().includes(query));
    }

    function renderAssignment(assignment) {
        const route = assignment.route || {};
        const vehicle = assignment.vehicle || {};
        const card = el("article", "route-card");
        const header = el("div", "route-card-header");
        const titleWrap = el("div", "route-heading");
        titleWrap.appendChild(el("span", "route-code", route.code || assignment.code || "Route"));
        titleWrap.appendChild(el("h3", "", route.name || "Assigned route"));
        titleWrap.appendChild(el("p", "panel-description", `${assignment.code || "Assignment"} · ${vehicle.number || "No vehicle"}`));
        header.append(titleWrap, statusPill(assignment.status));
        card.appendChild(header);

        const metadata = el("div", "route-metadata");
        const entries = [
            ["Start point", route.startPoint || "Not specified"],
            ["End point", route.endPoint || "Not specified"],
            ["Estimated distance", route.estimatedDistanceKm === null ? "Not specified" : `${route.estimatedDistanceKm} km`],
            ["Estimated duration", route.estimatedDurationMinutes === null ? "Not specified" : `${route.estimatedDurationMinutes} min`]
        ];
        entries.forEach(([label, value]) => {
            const item = el("div");
            item.append(el("span", "", label), el("strong", "", value));
            metadata.appendChild(item);
        });
        card.appendChild(metadata);

        if (route.approvalStatus === "legacy_unreviewed" || route.approvalStatus === "pending") {
            const warning = el("div", "driver-notice warning", "This route has not been marked approved in the current records. Follow your supervisor's instructions before starting collection.");
            card.appendChild(warning);
        }

        const stops = Array.isArray(route.stops) ? route.stops : [];
        const stopSection = el("div", "stop-list");
        const collected = stops.filter(stop => stop.status === "collected").length;
        stopSection.appendChild(el("h4", "", `Collection stops · ${collected} of ${stops.length} collected`));
        if (!stops.length) {
            stopSection.appendChild(el("p", "empty-state", "No collection stops are recorded for this route."));
        } else {
            stops.forEach(stop => stopSection.appendChild(renderStop(stop, assignment)));
        }
        card.appendChild(stopSection);

        const actions = el("div", "driver-route-actions");
        if (["assigned", "delayed"].includes(assignment.status)) {
            const startButton = el("button", "primary-button compact-action", "Start route");
            startButton.type = "button";
            startButton.addEventListener("click", () => runAction({
                kind: "start", assignmentId: assignment.id
            }, startButton));
            actions.appendChild(startButton);
        }
        if (["assigned", "active", "delayed"].includes(assignment.status)) {
            const delayButton = el("button", "secondary-button compact-action", "Report delay");
            delayButton.type = "button";
            delayButton.addEventListener("click", () => runAction({
                kind: "delay", assignmentId: assignment.id
            }, delayButton));
            const completeButton = el("button", "secondary-button compact-action", "Complete route");
            completeButton.type = "button";
            completeButton.addEventListener("click", () => runAction({
                kind: "complete", assignmentId: assignment.id
            }, completeButton));
            actions.append(delayButton, completeButton);
        }
        if (actions.childElementCount) card.appendChild(actions);
        return card;
    }

    function renderAssignments() {
        routeList.replaceChildren();
        const query = String(routeSearch.value || "").trim().toLowerCase();
        const visible = assignments.filter(item => routeMatches(item, query));
        if (!visible.length) {
            const state = el("div", "empty-state");
            state.appendChild(el("strong", "", assignments.length ? "No matching routes" : "No active assignments yet"));
            state.appendChild(el("p", "", assignments.length ? "Try a different route code or name." : "When an Inspector assigns a route and vehicle to your Driver Registry record, the assignment will appear here."));
            routeList.appendChild(state);
            return;
        }
        visible.forEach(item => routeList.appendChild(renderAssignment(item)));
    }

    function renderSummary() {
        byId("assignmentCount").textContent = String(assignments.length);
        let pending = 0;
        let completed = 0;
        let delayed = 0;
        assignments.forEach(assignment => {
            if (assignment.status === "delayed") delayed += 1;
            (assignment.route?.stops || []).forEach(stop => {
                if (stop.status === "collected") completed += 1;
                else if (!(["skipped"].includes(stop.status))) pending += 1;
            });
        });
        byId("pendingStopCount").textContent = String(pending);
        byId("completedStopCount").textContent = String(completed);
        byId("delayedAssignmentCount").textContent = String(delayed);
        byId("routeNavCount").textContent = String(assignments.length);
    }

    function renderDriver() {
        const name = driver?.fullName || "Driver";
        byId("welcomeDriverName").textContent = name;
        byId("headerDriverName").textContent = name;
        byId("headerAvatar").textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "DR";
        const ward = driver?.ward ? `${driver.ward.code} · ${driver.ward.name}` : "Ward not assigned";
        byId("headerDriverWard").textContent = ward;
        byId("systemStatusText").textContent = "Account connected";
        byId("sidebarStatusText").textContent = "Account connected";
    }


    function setMapNotice(message, kind = "") {
        const node = byId("driverMapNotice");
        if (!node) return;
        node.textContent = String(message || "");
        node.className = `driver-map-notice ${kind}`.trim();
        node.hidden = !message;
    }

    function setMapStatus(message) {
        const node = byId("driverMapStatus");
        if (node) node.textContent = String(message || "Map status");
    }

    function finishMapReady(value, message) {
        settleMapReady(value);
        if (!value && message) {
            setMapStatus("Map unavailable");
            setMapNotice(message, "error");
        }
    }

    function initializeNavigationMap() {
        if (!byId("driverRouteMap")) return;
        if (!window.maplibregl || typeof window.maplibregl.Map !== "function") {
            finishMapReady(false, "The map library could not load. Check your internet connection and confirm the server allows the MapLibre CDN in its content-security policy.");
            return;
        }

        try {
            driverMap = new window.maplibregl.Map({
                container: "driverRouteMap",
                style: MAP_STYLE_URL,
                center: [78.9629, 20.5937],
                zoom: 4,
                pitch: 0,
                bearing: 0,
                maxPitch: 65,
                attributionControl: true,
                cooperativeGestures: true,
                canvasContextAttributes: { antialias: true }
            });
            driverMap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

            // Some OpenFreeMap style revisions reference optional POI sprites that are not
            // present in the current sprite sheet. Supply a transparent fallback so these
            // optional POI icons do not flood the console with missing-image warnings.
            driverMap.on("styleimagemissing", event => {
                const imageId = String(event?.id || "");
                if (!imageId || driverMap.hasImage(imageId)) return;
                try {
                    driverMap.addImage(imageId, {
                        width: 1,
                        height: 1,
                        data: new Uint8Array([0, 0, 0, 0])
                    });
                } catch (error) {
                    // Keep map rendering resilient if the style resolves the image concurrently.
                }
            });

            driverMap.on("load", () => {
                mapReady = true;
                is3DView = false;
                ensureRouteLayers();
                add3DBuildingsLayer();
                finishMapReady(true);
                setMapStatus("Map ready");
                if (assignments.length) void renderSelectedNavigationRoute(true);
            });
            driverMap.on("rotate", applyTruckScreenHeading);
            driverMap.on("error", event => {
                if (!mapReady && event?.error) {
                    // Let MapLibre finish loading if a single tile request fails; only show a hard error on timeout.
                    console.warn("SWACHHITRA map asset request failed:", event.error.message || event.error);
                }
            });
            window.setTimeout(() => {
                if (!mapReady) {
                    finishMapReady(false, "The map did not finish loading. Check internet access to OpenFreeMap and try refreshing the page.");
                }
            }, 20000);
        } catch (error) {
            console.error("Could not initialize the Driver route map:", error);
            finishMapReady(false, "The route map could not be initialized in this browser. Check WebGL support and refresh the page.");
        }
    }

    function emptyFeatureCollection() {
        return { type: "FeatureCollection", features: [] };
    }

    function lineFeature(coordinates) {
        if (!Array.isArray(coordinates) || coordinates.length < 2) return emptyFeatureCollection();
        return {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }]
        };
    }

    function ensureRouteLayers() {
        if (!driverMap || !mapReady) return;
        if (!driverMap.getSource("driver-assigned-route")) {
            driverMap.addSource("driver-assigned-route", { type: "geojson", data: emptyFeatureCollection() });
            driverMap.addLayer({
                id: "driver-assigned-route-casing", type: "line", source: "driver-assigned-route",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#ffffff", "line-width": 13, "line-opacity": 0.99 }
            });
            driverMap.addLayer({
                id: "driver-assigned-route-line", type: "line", source: "driver-assigned-route",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#2f8a43", "line-width": 7, "line-opacity": 0.99, "line-blur": 0.15 }
            });
        }
        if (!driverMap.getSource("driver-route-progress")) {
            driverMap.addSource("driver-route-progress", { type: "geojson", data: emptyFeatureCollection() });
            driverMap.addLayer({
                id: "driver-route-progress-line", type: "line", source: "driver-route-progress",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#9bcf39", "line-width": 7, "line-opacity": 0.98 }
            });
        }
    }

    function add3DBuildingsLayer() {
        if (!driverMap || !mapReady) return;
        try {
            // OpenFreeMap's OpenMapTiles-compatible source exposes building heights for extrusion.
            if (!driverMap.getSource("driver-openfreemap-buildings")) {
                driverMap.addSource("driver-openfreemap-buildings", {
                    type: "vector",
                    url: "https://tiles.openfreemap.org/planet",
                    attribution: "© OpenStreetMap contributors · OpenFreeMap"
                });
            }
            if (!driverMap.getLayer("driver-3d-buildings")) {
                const layers = driverMap.getStyle().layers || [];
                const firstSymbol = layers.find(layer => layer.type === "symbol" && layer.layout && layer.layout["text-field"]);
                const extrusionLayer = {
                    id: "driver-3d-buildings",
                    source: "driver-openfreemap-buildings",
                    "source-layer": "building",
                    type: "fill-extrusion",
                    minzoom: 14,
                    filter: ["any", ["has", "render_height"], ["has", "height"]],
                    paint: {
                        "fill-extrusion-color": "#c1ceb8",
                        "fill-extrusion-height": ["coalesce", ["to-number", ["get", "render_height"]], ["to-number", ["get", "height"]], 8],
                        "fill-extrusion-base": ["coalesce", ["to-number", ["get", "render_min_height"]], ["to-number", ["get", "min_height"]], 0],
                        "fill-extrusion-opacity": 0.72
                    }
                };
                if (firstSymbol) driverMap.addLayer(extrusionLayer, firstSymbol.id);
                else driverMap.addLayer(extrusionLayer);
            }
        } catch (error) {
            // Navigation still works if the optional building-height layer is unavailable.
            console.warn("Optional 3D building layer is unavailable:", error?.message || error);
        }
    }

    function coordinateForStop(stop) {
        if (!stop || stop.latitude === null || stop.latitude === undefined || stop.latitude === "" ||
            stop.longitude === null || stop.longitude === undefined || stop.longitude === "") return null;
        const latitude = Number(stop.latitude);
        const longitude = Number(stop.longitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
        return [longitude, latitude];
    }

    function selectedAssignment() {
        return assignments.find(item => String(item.id) === String(selectedNavigationAssignmentId)) || null;
    }

    function routeStops(assignment) {
        return Array.isArray(assignment?.route?.stops) ? assignment.route.stops : [];
    }

    function clearStopMarkers() {
        stopMarkers.forEach(marker => marker.remove());
        stopMarkers = [];
    }

    function clearTruckMarker() {
        if (truckMarker) truckMarker.remove();
        truckMarker = null;
        truckMarkerElement = null;
        truckWorldHeadingDegrees = 0;
        truckVisualRotationDegrees = null;
    }

    function clearRouteLines() {
        if (!driverMap || !mapReady) return;
        ensureRouteLayers();
        const routeSource = driverMap.getSource("driver-assigned-route");
        const progressSource = driverMap.getSource("driver-route-progress");
        if (routeSource) routeSource.setData(emptyFeatureCollection());
        if (progressSource) progressSource.setData(emptyFeatureCollection());
    }

    function stopNavigationPreview(removeTruck = true) {
        if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        if (geolocationWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(geolocationWatchId);
        }
        geolocationWatchId = null;
        navigationRunning = false;
        navigationAssignmentId = "";
        navigationCoordinates = [];
        navigationCumulativeMeters = [];
        navigationTotalMeters = 0;
        lastGpsCoordinate = null;
        lastLocationSentAt = 0;
        locationPostInFlight = false;
        if (removeTruck) clearTruckMarker();
        const stopButton = byId("driverMapStopButton");
        if (stopButton) stopButton.hidden = true;
        const hud = byId("driverMapHud");
        if (hud) hud.hidden = true;
        const progress = byId("driverMapProgressBar");
        if (progress) progress.style.width = "0%";
        updateNavigationControls();
    }

    function createStopMarker(stop, coord) {
        const root = document.createElement("div");
        const processed = ["collected", "skipped"].includes(String(stop.status || "").toLowerCase());
        root.className = `driver-map-stop-marker ${processed ? "processed" : "pending"}`;
        root.title = `${stop.order || ""}. ${stop.name || "Collection stop"} — ${String(stop.status || "pending").replace(/_/g, " ")}`;
        const pin = document.createElement("div");
        pin.className = "driver-map-stop-pin";
        const number = document.createElement("span");
        number.textContent = String(stop.order || "•");
        pin.appendChild(number);
        root.appendChild(pin);
        const popupText = [stop.name || `Collection stop ${stop.order || ""}`, stop.address || "", `Status: ${String(stop.status || "pending").replace(/_/g, " ")}`].filter(Boolean).join("\n");
        const popup = new window.maplibregl.Popup({ offset: 18, closeButton: false }).setText(popupText);
        const marker = new window.maplibregl.Marker({ element: root, anchor: "bottom" })
            .setLngLat(coord).setPopup(popup).addTo(driverMap);
        stopMarkers.push(marker);
    }

    function createTruckElement() {
        const root = document.createElement("div");
        root.className = "driver-truck-marker driver-waste-truck-marker";
        root.setAttribute("role", "img");
        root.setAttribute("aria-label", "Top-down waste collection truck moving on the selected route");
        root.title = "SWACHHITRA waste collection truck";

        const icon = document.createElement("div");
        icon.className = "driver-truck-marker-icon";

        const image = document.createElement("img");
        image.className = "driver-truck-marker-image";
        image.src = "/assets/waste-truck-top.png";
        image.alt = "";
        image.draggable = false;
        image.decoding = "async";
        image.addEventListener("error", () => {
            // An obvious fallback is better than leaving a broken-image glyph on the map.
            root.classList.add("driver-truck-marker-fallback");
            icon.textContent = "🚛";
            icon.setAttribute("aria-hidden", "true");
        }, { once: true });

        icon.appendChild(image);
        root.appendChild(icon);
        return root;
    }

    function ensureTruckMarker(coord) {
        if (!truckMarker) {
            truckMarkerElement = createTruckElement();
            truckWorldHeadingDegrees = 0;
            truckVisualRotationDegrees = null;
            truckMarker = new window.maplibregl.Marker({ element: truckMarkerElement, anchor: "center" })
                .setLngLat(coord).addTo(driverMap);
        } else {
            truckMarker.setLngLat(coord);
        }
        return truckMarker;
    }

    function normalizeDegrees(value) {
        return ((value % 360) + 360) % 360;
    }

    function applyTruckScreenHeading() {
        const icon = truckMarkerElement?.querySelector(".driver-truck-marker-icon");
        if (!icon) return;

        // In follow-navigation mode, map bearing already turns the road to point screen-up.
        // Subtracting map bearing keeps the truck aligned with the road without rotating it twice.
        const mapBearing = driverMap && typeof driverMap.getBearing === "function" ? driverMap.getBearing() : 0;
        const target = normalizeDegrees(truckWorldHeadingDegrees - mapBearing);

        if (truckVisualRotationDegrees === null) {
            truckVisualRotationDegrees = target;
        } else {
            // Use the shortest angular turn so 359° -> 1° is a 2° turn, not a full spin.
            const currentNormalized = normalizeDegrees(truckVisualRotationDegrees);
            const delta = ((target - currentNormalized + 540) % 360) - 180;
            truckVisualRotationDegrees += delta;
        }
        icon.style.transform = `rotate(${truckVisualRotationDegrees}deg)`;
    }

    function setTruckHeading(degrees) {
        if (!Number.isFinite(degrees)) return;
        truckWorldHeadingDegrees = normalizeDegrees(degrees);
        applyTruckScreenHeading();
    }

    function haversineMeters(a, b) {
        const radians = value => value * Math.PI / 180;
        const earthRadius = 6371000;
        const lat1 = radians(a[1]);
        const lat2 = radians(b[1]);
        const dLat = lat2 - lat1;
        const dLon = radians(b[0] - a[0]);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function bearingDegrees(a, b) {
        const radians = value => value * Math.PI / 180;
        const lat1 = radians(a[1]);
        const lat2 = radians(b[1]);
        const deltaLon = radians(b[0] - a[0]);
        const y = Math.sin(deltaLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function buildCumulativeDistances(coordinates) {
        const cumulative = [0];
        for (let index = 1; index < coordinates.length; index += 1) {
            cumulative.push(cumulative[index - 1] + haversineMeters(coordinates[index - 1], coordinates[index]));
        }
        return cumulative;
    }

    function pointAtDistance(coordinates, cumulative, targetMeters) {
        if (targetMeters <= 0 || coordinates.length < 2) return coordinates[0];
        const total = cumulative[cumulative.length - 1] || 0;
        if (targetMeters >= total) return coordinates[coordinates.length - 1];
        let index = 1;
        while (index < cumulative.length && cumulative[index] < targetMeters) index += 1;
        const startDistance = cumulative[index - 1];
        const segmentLength = cumulative[index] - startDistance;
        const fraction = segmentLength > 0 ? (targetMeters - startDistance) / segmentLength : 0;
        const start = coordinates[index - 1];
        const end = coordinates[index];
        return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
    }

    function progressForStop(stopCoord, coordinates, cumulative) {
        let bestIndex = 0;
        let bestDistance = Infinity;
        for (let index = 0; index < coordinates.length; index += 1) {
            const distance = haversineMeters(stopCoord, coordinates[index]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }
        const total = cumulative[cumulative.length - 1] || 1;
        return cumulative[bestIndex] / total;
    }

    async function requestRoadGeometry(stops) {
        const coords = stops.map(coordinateForStop);
        if (coords.length < 2 || coords.some(coord => !coord)) return { coordinates: coords.filter(Boolean), roadRoute: false, distanceMeters: 0, durationSeconds: 0 };
        const coordinatesText = coords.map(coord => `${coord[0]},${coord[1]}`).join(";");
        const url = `${OSRM_ROUTE_BASE}${coordinatesText}?overview=full&geometries=geojson&steps=false&alternatives=false`;
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
            const result = await response.json();
            const route = result?.code === "Ok" ? result.routes?.[0] : null;
            const geometry = route?.geometry?.coordinates;
            if (!Array.isArray(geometry) || geometry.length < 2) throw new Error("No road route geometry was returned.");
            return { coordinates: geometry, roadRoute: true, distanceMeters: Number(route.distance) || 0, durationSeconds: Number(route.duration) || 0 };
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function getRouteGeometry(assignment, stops) {
        const key = String(assignment.id);
        if (routeGeometryCache.has(key)) return routeGeometryCache.get(key);
        if (routeGeometryPromises.has(key)) return routeGeometryPromises.get(key);
        const promise = requestRoadGeometry(stops).catch(error => {
            console.warn("Road routing could not be loaded; using the stop-to-stop preview line:", error?.message || error);
            const coordinates = stops.map(coordinateForStop).filter(Boolean);
            return { coordinates, roadRoute: false, distanceMeters: 0, durationSeconds: 0, fallbackReason: error?.message || "Routing unavailable" };
        }).then(geometry => {
            routeGeometryCache.set(key, geometry);
            routeGeometryPromises.delete(key);
            return geometry;
        });
        routeGeometryPromises.set(key, promise);
        return promise;
    }

    function fitCurrentRoute() {
        if (!driverMap || !mapReady || !selectedRouteGeometry?.coordinates?.length) return;
        const coordinates = selectedRouteGeometry.coordinates;
        if (coordinates.length === 1) {
            driverMap.easeTo({ center: coordinates[0], zoom: 16, pitch: is3DView ? 55 : 0, duration: 800, essential: true });
            return;
        }
        const bounds = new window.maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
        coordinates.forEach(coord => bounds.extend(coord));
        driverMap.fitBounds(bounds, { padding: { top: 60, right: 60, bottom: 60, left: 60 }, maxZoom: 15.2, duration: 850, pitch: is3DView ? 50 : 0 });
    }

    function updateNavigationControls() {
        const assignment = selectedAssignment();
        const startButton = byId("driverMapStartButton");
        const selector = byId("driverMapRouteSelector");
        const fitButton = byId("driverMapFitButton");
        const threeDButton = byId("driverMap3dButton");
        if (startButton) {
            const hasPath = Boolean(selectedRouteNavigable && selectedRouteGeometry?.coordinates?.length >= 2);
            const status = String(assignment?.status || "").toLowerCase();
            startButton.disabled = !assignment || !hasPath || navigationRunning || !mapReady || !["assigned", "delayed", "active"].includes(status);
            startButton.textContent = navigationRunning ? "GPS sharing active…" : status === "active" ? "Resume GPS sharing" : status === "assigned" || status === "delayed" ? "Start selected route" : "Route unavailable";
        }
        if (fitButton) fitButton.disabled = !selectedRouteGeometry?.coordinates?.length || !mapReady;
        if (threeDButton) {
            threeDButton.disabled = !mapReady;
            threeDButton.textContent = is3DView ? "2D view" : "3D view";
            threeDButton.setAttribute("aria-pressed", String(is3DView));
        }
        if (selector) selector.disabled = assignments.length === 0;
    }

    async function renderSelectedNavigationRoute(fitBounds = true) {
        const version = ++routeRenderVersion;
        const ready = await mapReadyPromise;
        if (!ready || !driverMap || !mapReady) return;
        stopNavigationPreview(true);
        clearStopMarkers();
        clearRouteLines();
        const assignment = selectedAssignment();
        selectedRouteGeometry = null;
        selectedRouteNavigable = false;

        if (!assignment) {
            setMapStatus("No assigned routes");
            setMapNotice("No active assignments are linked to your Driver account. When an Inspector assigns you a route, it will appear here.", "warning");
            updateNavigationControls();
            return;
        }

        const stops = routeStops(assignment);
        if (!stops.length) {
            setMapStatus("Stops required");
            setMapNotice("This assigned route has no collection stops yet. Ask your Inspector to add stops to the route.", "warning");
            updateNavigationControls();
            return;
        }

        const coordinateStops = stops.map(stop => ({ stop, coord: coordinateForStop(stop) }));
        coordinateStops.filter(item => item.coord).forEach(item => createStopMarker(item.stop, item.coord));
        const missing = coordinateStops.filter(item => !item.coord).length;
        const validCoordinates = coordinateStops.filter(item => item.coord).map(item => item.coord);
        if (validCoordinates.length) {
            if (validCoordinates.length === 1) driverMap.easeTo({ center: validCoordinates[0], zoom: 15, pitch: 0, duration: 700, essential: true });
            else {
                const bounds = new window.maplibregl.LngLatBounds(validCoordinates[0], validCoordinates[0]);
                validCoordinates.forEach(coord => bounds.extend(coord));
                driverMap.fitBounds(bounds, { padding: 50, maxZoom: 14.5, duration: 700, pitch: 0 });
            }
        }

        if (missing > 0) {
            setMapStatus("Coordinates needed");
            setMapNotice(`${missing} of ${stops.length} collection stop(s) have no valid latitude/longitude. Add accurate stop coordinates in the Inspector route planner before using animated navigation. The map will not guess these locations.`, "warning");
            updateNavigationControls();
            return;
        }
        if (validCoordinates.length < 2) {
            setMapStatus("More stops needed");
            setMapNotice("This route has only one mapped stop. Navigation preview needs at least two collection stops with coordinates.", "warning");
            updateNavigationControls();
            return;
        }

        setMapStatus("Building road route…");
        setMapNotice("Preparing the road route from your assigned collection stops…");
        const geometry = await getRouteGeometry(assignment, stops);
        if (version !== routeRenderVersion || String(selectedNavigationAssignmentId) !== String(assignment.id)) return;
        if (!geometry?.coordinates || geometry.coordinates.length < 2) {
            selectedRouteGeometry = null;
            setMapStatus("Route unavailable");
            setMapNotice("A route line could not be built from these stop coordinates. Check the coordinates in the Inspector route planner.", "warning");
            updateNavigationControls();
            return;
        }

        selectedRouteGeometry = geometry;
        selectedRouteNavigable = true;
        ensureRouteLayers();
        driverMap.getSource("driver-assigned-route").setData(lineFeature(geometry.coordinates));
        driverMap.getSource("driver-route-progress").setData(emptyFeatureCollection());
        if (fitBounds) fitCurrentRoute();
        setMapStatus(geometry.roadRoute ? "Road route ready" : "Simplified route ready");
        setMapNotice(
            geometry.roadRoute
                ? `Road path ready for ${assignment.route?.code || assignment.code || "your assigned route"}. Start route to animate the truck along the road path. This is a preview, not GPS. `
                : "The road-routing service was unavailable, so the map is showing a simplified line between assigned stop coordinates. The truck animation is only a preview, not GPS.",
            geometry.roadRoute ? "" : "warning"
        );
        updateNavigationControls();
    }

    function refreshNavigationRouteSelector() {
        const selector = byId("driverMapRouteSelector");
        if (!selector) return;
        const previousId = selectedNavigationAssignmentId || selector.value;
        selector.replaceChildren();
        if (!assignments.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No assigned routes";
            selector.appendChild(option);
            selectedNavigationAssignmentId = "";
            void renderSelectedNavigationRoute(false);
            return;
        }
        assignments.forEach(assignment => {
            const option = document.createElement("option");
            option.value = String(assignment.id);
            const route = assignment.route || {};
            option.textContent = `${route.code || assignment.code || "Route"} · ${route.name || "Assigned route"}`;
            selector.appendChild(option);
        });
        const exists = assignments.some(assignment => String(assignment.id) === String(previousId));
        selectedNavigationAssignmentId = exists ? String(previousId) : String(assignments[0].id);
        selector.value = selectedNavigationAssignmentId;
        void renderSelectedNavigationRoute(true);
    }

    async function selectNavigationAssignment(assignmentId, fitBounds = true) {
        const id = String(assignmentId || "");
        if (!assignments.some(item => String(item.id) === id)) return;
        selectedNavigationAssignmentId = id;
        const selector = byId("driverMapRouteSelector");
        if (selector) selector.value = id;
        await renderSelectedNavigationRoute(fitBounds);
    }

    function navigationStopLabel(progressRatio) {
        const assignment = assignments.find(item => String(item.id) === String(navigationAssignmentId));
        const stops = routeStops(assignment);
        const geometry = selectedRouteGeometry;
        if (!stops.length || !geometry?.coordinates?.length) return "Following assigned route";
        const cumulative = buildCumulativeDistances(geometry.coordinates);
        const total = cumulative[cumulative.length - 1] || 1;
        const currentMeters = total * progressRatio;
        let nextStop = stops[stops.length - 1];
        let currentStopNumber = stops.length;
        for (let index = 0; index < stops.length; index += 1) {
            const coord = coordinateForStop(stops[index]);
            const stopProgress = coord ? progressForStop(coord, geometry.coordinates, cumulative) : (index + 1) / stops.length;
            if (currentMeters < stopProgress * total - 10) {
                nextStop = stops[index];
                currentStopNumber = index + 1;
                break;
            }
        }
        return `Stop ${currentStopNumber} of ${stops.length} · ${nextStop.name || `Collection stop ${currentStopNumber}`}`;
    }

    function startNavigationPreview(assignmentId) {
        const id = String(assignmentId || selectedNavigationAssignmentId || "");
        if (id !== String(selectedNavigationAssignmentId)) {
            void selectNavigationAssignment(id, true).then(() => startNavigationPreview(id));
            return;
        }
        const assignment = assignments.find(item => String(item.id) === id);
        if (!assignment || !["active", "delayed"].includes(String(assignment.status || "").toLowerCase())) {
            setMapNotice("Start the assigned route before sharing GPS location.", "warning");
            return;
        }
        if (!navigator.geolocation || !window.isSecureContext) {
            setMapStatus("GPS unavailable");
            setMapNotice("Browser location requires HTTPS (or localhost during local testing) and a browser that supports geolocation. Open the secure deployed URL and allow location access.", "error");
            return;
        }
        stopNavigationPreview(true);
        navigationAssignmentId = id;
        navigationRunning = true;
        const geometry = selectedRouteGeometry?.coordinates;
        navigationCoordinates = Array.isArray(geometry) ? geometry : [];
        navigationCumulativeMeters = navigationCoordinates.length > 1 ? buildCumulativeDistances(navigationCoordinates) : [];
        navigationTotalMeters = navigationCumulativeMeters.length ? navigationCumulativeMeters[navigationCumulativeMeters.length - 1] || 0 : 0;
        is3DView = true;
        const hud = byId("driverMapHud");
        if (hud) hud.hidden = false;
        const hudTitle = byId("driverMapHudTitle");
        if (hudTitle) hudTitle.textContent = `${assignment.route?.code || "Assigned route"} · Live GPS`;
        const hudDetail = byId("driverMapHudDetail");
        const hudFootnote = byId("driverMapHudFootnote");
        if (hudDetail) hudDetail.textContent = "Waiting for the device's GPS position…";
        if (hudFootnote) {
            hudFootnote.textContent = "Waiting for device GPS · location sharing starts with your route";
            hudFootnote.dataset.state = "pending";
        }
        const stopButton = byId("driverMapStopButton");
        if (stopButton) {
            stopButton.hidden = false;
            stopButton.textContent = "Stop GPS sharing";
        }
        setMapStatus("Waiting for GPS");
        setMapNotice("Live location sharing is active for this assigned route. Keep this page open and allow location access. Location is sent only while this tracking session is running.");
        updateNavigationControls();

        const onPosition = async position => {
            if (!navigationRunning || String(navigationAssignmentId) !== id) return;
            const coords = position.coords;
            const latitude = Number(coords.latitude);
            const longitude = Number(coords.longitude);
            const accuracy = Number(coords.accuracy);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return;
            lastGpsAccuracy = accuracy;
            // Keep the real marker responsive even when browser GPS is approximate.
            // The backend accepts accuracy up to 1000 m; do not silently discard
            // usable readings merely because they are worse than 150 m.
            const coord = [longitude, latitude];
            let heading = Number.isFinite(Number(coords.heading)) && coords.heading !== null ? Number(coords.heading) : null;
            if (heading === null && lastGpsCoordinate && haversineMeters(lastGpsCoordinate, coord) >= 3) {
                heading = bearingDegrees(lastGpsCoordinate, coord);
            }
            ensureTruckMarker(coord);
            if (heading !== null) setTruckHeading(heading);
            if (driverMap) {
                const camera = { center: coord, zoom: 16.5, pitch: is3DView ? 58 : 0, duration: lastGpsCoordinate ? 650 : 1100, essential: true };
                if (heading !== null && is3DView) camera.bearing = heading;
                driverMap.easeTo(camera);
            }
            lastGpsCoordinate = coord;
            const accuracyAcceptableForServer = accuracy <= 1000;
            setMapStatus(accuracy <= 150 ? "Live GPS connected" : "GPS accuracy low");
            if (hudDetail) hudDetail.textContent = `GPS accuracy ±${Math.round(accuracy)} m · Updated ${new Date(position.timestamp || Date.now()).toLocaleTimeString()} · ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            if (hudFootnote) {
                hudFootnote.textContent = accuracyAcceptableForServer
                    ? "GPS fix received · confirming server upload…"
                    : "GPS fix received locally · accuracy too low to upload";
                hudFootnote.dataset.state = accuracyAcceptableForServer ? "pending" : "warning";
            }
            if (accuracy > 150 && accuracyAcceptableForServer) {
                setMapNotice(`GPS accuracy is approximately ±${Math.round(accuracy)} m. This reading is approximate, but it will still be shared so the Inspector can test GPS. Use a phone outdoors for better accuracy.`, "warning");
            } else if (!accuracyAcceptableForServer) {
                setMapNotice(`GPS accuracy is approximately ±${Math.round(accuracy)} m, too imprecise to send safely. The truck is shown locally only; move outdoors and wait for a better reading.`, "warning");
            }
            if (navigationTotalMeters > 0 && navigationCoordinates.length > 1) {
                let nearestIndex = 0;
                let nearestDistance = Infinity;
                for (let index = 0; index < navigationCoordinates.length; index += 1) {
                    const distance = haversineMeters(coord, navigationCoordinates[index]);
                    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
                }
                const ratio = navigationCoordinates.length > 1 ? nearestIndex / (navigationCoordinates.length - 1) : 0;
                const progressBar = byId("driverMapProgressBar");
                if (progressBar) progressBar.style.width = `${Math.round(ratio * 100)}%`;
            }
            const now = Date.now();
            if (accuracyAcceptableForServer && now - lastLocationSentAt >= 4500 && !locationPostInFlight) {
                locationPostInFlight = true;
                lastLocationSentAt = now;
                try {
                    await mutateJSON("/api/driver/location", {
                        assignmentId: Number(id), latitude, longitude, accuracy,
                        heading: heading === null ? null : heading,
                        speed: coords.speed !== null && coords.speed !== undefined && Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null
                    });
                    if (accuracy <= 150) {
                        setMapNotice(`Live GPS location sent to SWACHHITRA. Accuracy ±${Math.round(accuracy)} m.`, "success");
                        if (hudFootnote) {
                            hudFootnote.textContent = "Live GPS confirmed · location shared with Inspector";
                            hudFootnote.dataset.state = "live";
                        }
                    } else {
                        setMapNotice(`Approximate GPS location sent to SWACHHITRA. Accuracy ±${Math.round(accuracy)} m; improve accuracy outdoors when possible.`, "warning");
                        if (hudFootnote) {
                            hudFootnote.textContent = `Approximate GPS shared with Inspector · accuracy ±${Math.round(accuracy)} m`;
                            hudFootnote.dataset.state = "warning";
                        }
                    }
                } catch (error) {
                    setMapStatus("Location upload failed");
                    setMapNotice(error.message || "Unable to upload GPS location. Check the network and retry.", "error");
                    if (hudFootnote) {
                        hudFootnote.textContent = "GPS upload failed · will retry on the next location update";
                        hudFootnote.dataset.state = "error";
                    }
                } finally {
                    locationPostInFlight = false;
                }
            }
        };
        const onError = error => {
            if (!navigationRunning || String(navigationAssignmentId) !== id) return;
            let message = "Unable to read the device location.";
            if (error?.code === 1) {
                message = "Location permission was denied. Allow location access in your browser settings, then start GPS sharing again.";
                if (geolocationWatchId !== null) navigator.geolocation.clearWatch(geolocationWatchId);
                geolocationWatchId = null;
                navigationRunning = false;
                navigationAssignmentId = "";
                updateNavigationControls();
            } else if (error?.code === 2) message = "The device could not determine its location. Check that phone location services are enabled and try outdoors.";
            else if (error?.code === 3) message = "GPS timed out. Keep location services enabled; the browser will continue trying.";
            setMapStatus("GPS needs attention");
            setMapNotice(message, "error");
            if (hudFootnote) {
                hudFootnote.textContent = message;
                hudFootnote.dataset.state = "error";
            }
        };
        try {
            geolocationWatchId = navigator.geolocation.watchPosition(onPosition, onError, {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 20000
            });
        } catch (error) {
            navigationRunning = false;
            navigationAssignmentId = "";
            setMapStatus("GPS unavailable");
            setMapNotice(error.message || "The browser could not start location tracking.", "error");
            updateNavigationControls();
        }
    }

    function handleNavigationStartButton() {
        const assignment = selectedAssignment();
        if (!assignment) return;
        const status = String(assignment.status || "").toLowerCase();
        if (["assigned", "delayed"].includes(status)) {
            runAction({ kind: "start", assignmentId: assignment.id }, byId("driverMapStartButton"));
        } else if (status === "active") {
            startNavigationPreview(assignment.id);
        }
    }

    function handleThreeDToggle() {
        if (!driverMap || !mapReady) return;
        is3DView = !is3DView;
        const targetPitch = is3DView ? 58 : 0;
        driverMap.easeTo({ pitch: targetPitch, duration: 800, essential: true });
        updateNavigationControls();
    }

    function setupNavigationMapControls() {
        byId("driverMapRouteSelector")?.addEventListener("change", event => {
            stopNavigationPreview(true);
            selectedNavigationAssignmentId = String(event.target.value || "");
            void renderSelectedNavigationRoute(true);
        });
        byId("driverMapFitButton")?.addEventListener("click", fitCurrentRoute);
        byId("driverMap3dButton")?.addEventListener("click", handleThreeDToggle);
        byId("driverMapStartButton")?.addEventListener("click", handleNavigationStartButton);
        byId("driverMapStopButton")?.addEventListener("click", () => {
            stopNavigationPreview(true);
            if (driverMap) driverMap.easeTo({ pitch: 0, duration: 600, essential: true });
            is3DView = false;
            setMapStatus("GPS sharing stopped");
            setMapNotice("GPS sharing stopped on this device. The route remains active in SWACHHITRA; no further locations will be sent from this page.");
        });
    }

    async function loadDashboard() {
        showNotice("Loading your Driver account and assignments…");
        try {
            const [driverResult, assignmentsResult] = await Promise.all([
                fetchJSON("/api/driver/me"),
                fetchJSON("/api/driver/assignments")
            ]);
            driver = driverResult.driver;
            assignments = Array.isArray(assignmentsResult.assignments) ? assignmentsResult.assignments : [];
            renderDriver();
            renderSummary();
            renderVehicle();
            renderAssignments();
            refreshNavigationRouteSelector();
            showNotice(assignments.length ? "Assignment data refreshed successfully." : "Your account is active, but no active route assignment is linked yet.", assignments.length ? "" : "warning");
        } catch (error) {
            console.error("Driver dashboard load failed:", error);
            showNotice(error.message || "Unable to load your dashboard. Contact your Inspector if the account is not linked to a Driver Registry record.", "error");
            if (/session has expired|authentication|required|not authenticated/i.test(error.message || "")) {
                window.setTimeout(() => window.location.replace("/login"), 500);
            }
        }
    }

    async function logout() {
        const button = byId("logoutButton");
        button.disabled = true;
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
        } catch (error) {
            console.warn("Logout request failed:", error);
        } finally {
            window.location.replace("/login");
        }
    }

    function closeMobileSidebar() {
        sidebar?.classList.remove("open");
        mobileBackdrop?.classList.remove("visible");
        mobileMenuButton?.setAttribute("aria-expanded", "false");
    }

    mobileMenuButton?.addEventListener("click", () => {
        const open = !sidebar.classList.contains("open");
        sidebar.classList.toggle("open", open);
        mobileBackdrop.classList.toggle("visible", open);
        mobileMenuButton.setAttribute("aria-expanded", String(open));
    });
    mobileBackdrop?.addEventListener("click", closeMobileSidebar);
    sidebarToggleButton?.addEventListener("click", () => {
        const collapsed = document.body.classList.toggle("sidebar-collapsed");
        sidebarToggleButton.setAttribute("aria-expanded", String(!collapsed));
    });
    document.querySelectorAll("[data-driver-nav]").forEach(link => {
        link.addEventListener("click", () => {
            document.querySelectorAll("[data-driver-nav]").forEach(item => item.classList.toggle("active", item === link));
            closeMobileSidebar();
        });
    });
    routeSearch?.addEventListener("input", renderAssignments);
    byId("logoutButton")?.addEventListener("click", logout);
    setupNavigationMapControls();
    initializeNavigationMap();

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadDashboard);
    else void loadDashboard();
})();

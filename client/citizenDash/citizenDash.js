(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const state = {
        complaints: [],
        activeFilter: "all",
        searchTerm: "",
        searchActiveIndex: -1,
        csrfToken: "",
        profile: null,
        user: null,
        loading: false
    };

    let citizenLiveMap = null;
    let citizenLiveWardLayer = null;
    const citizenLiveMarkers = new Map();
    let citizenLivePollTimer = null;
    let citizenLivePollInFlight = false;
    let citizenLivePollingStopped = false;
    let citizenLiveInitialViewSet = false;
    let citizenLiveWardId = null;

    function setNotice(message, type = "") {
        const element = $("dashboardNotice");
        if (!element) return;
        element.textContent = String(message || "");
        element.className = `notice ${type}`.trim();
    }

    function setText(id, value, fallback = "—") {
        const element = $(id);
        if (!element) return;
        element.textContent = value === null || value === undefined || value === ""
            ? fallback
            : String(value);
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });
        const raw = await response.text();
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error page */ }

        if (!response.ok || body?.success !== true) {
            const error = new Error(body?.message || `Request failed (${response.status}).`);
            error.status = response.status;
            error.code = body?.code || "";
            throw error;
        }
        return body;
    }

    async function loadCsrfToken(force = false) {
        if (state.csrfToken && !force) return state.csrfToken;
        const body = await api("/api/citizen/security/csrf-token");
        state.csrfToken = String(body.csrfToken || "");
        if (state.csrfToken.length < 32) {
            throw new Error("The security token could not be loaded. Refresh the page and try again.");
        }
        return state.csrfToken;
    }

    async function mutate(url, method, payload) {
        await loadCsrfToken();
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await api(url, {
                    method,
                    headers: { "X-CSRF-Token": state.csrfToken },
                    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
                });
            } catch (error) {
                const csrfFailure = error.status === 403 && [
                    "CSRF_TOKEN_MISSING",
                    "CSRF_TOKEN_INVALID"
                ].includes(error.code);
                if (!csrfFailure || attempt > 0) throw error;
                await loadCsrfToken(true);
            }
        }
        throw new Error("Unable to complete the secure request. Refresh and try again.");
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date unavailable";
        return new Intl.DateTimeFormat("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        }).format(date);
    }

    function statusLabel(status) {
        return ({
            open: "Open",
            in_progress: "In progress",
            resolved: "Resolved",
            cancelled: "Cancelled"
        })[status] || "Unknown";
    }

    function statusClass(status) {
        return ({
            open: "status-open",
            in_progress: "status-progress",
            resolved: "status-resolved",
            cancelled: "status-cancelled"
        })[status] || "status-neutral";
    }

    function el(tag, className, value) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (value !== undefined && value !== null) element.textContent = String(value);
        return element;
    }

    function appendMeta(parent, label, value) {
        const item = el("div", "complaint-meta-item");
        item.append(el("span", "meta-label", label));
        item.append(el("strong", "meta-value", value || "Not provided"));
        parent.append(item);
    }

    function complaintSearchText(complaint) {
        return [
            complaint.code,
            complaint.type,
            complaint.description,
            complaint.location,
            complaint.ward?.name,
            complaint.ward?.code,
            complaint.ward?.number,
            statusLabel(complaint.status)
        ].map(value => String(value ?? "").trim()).filter(Boolean).join(" ").toLowerCase();
    }

    function complaintMatchesSearch(complaint, needle = state.searchTerm.trim().toLowerCase()) {
        if (state.activeFilter !== "all" && complaint.status !== state.activeFilter) return false;
        return !needle || complaintSearchText(complaint).includes(needle);
    }

    function closeComplaintSearchSuggestions() {
        const panel = $("complaintSearchSuggestions");
        const input = $("complaintSearch");
        if (panel) {
            panel.hidden = true;
            panel.replaceChildren();
        }
        if (input) input.setAttribute("aria-expanded", "false");
        state.searchActiveIndex = -1;
    }

    function selectComplaintSearchSuggestion(complaint) {
        const input = $("complaintSearch");
        if (!input || !complaint) return;

        // Select by unique reference so the resulting filter has one clear target.
        input.value = String(complaint.code || complaint.type || "");
        state.searchTerm = input.value;
        state.activeFilter = "all";
        document.querySelectorAll("[data-status-filter]").forEach(button => {
            const active = button.dataset.statusFilter === "all";
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        renderComplaints();
        closeComplaintSearchSuggestions();
        input.focus({ preventScroll: true });
        const card = document.getElementById(`complaint-card-${Number(complaint.id)}`);
        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("search-match-focus");
            window.setTimeout(() => card.classList.remove("search-match-focus"), 2400);
        }
    }

    function renderComplaintSearchSuggestions() {
        const panel = $("complaintSearchSuggestions");
        const input = $("complaintSearch");
        if (!panel || !input) return;

        const needle = state.searchTerm.trim().toLowerCase();
        if (!needle) {
            closeComplaintSearchSuggestions();
            return;
        }

        // This is a local, read-only filter over the already-loaded list. It
        // does not issue a request or invoke the cancellation endpoint.
        const matches = state.complaints
            .filter(complaint => complaintSearchText(complaint).includes(needle))
            .sort((a, b) => {
                const aCode = String(a.code || "").toLowerCase();
                const bCode = String(b.code || "").toLowerCase();
                const aPrefix = aCode.startsWith(needle) ? 0 : 1;
                const bPrefix = bCode.startsWith(needle) ? 0 : 1;
                return aPrefix - bPrefix || new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0);
            })
            .slice(0, 7);

        panel.replaceChildren();
        if (!matches.length) {
            const empty = el("div", "search-suggestion-empty", "No matching complaints. Keep typing or try a reference code.");
            empty.setAttribute("role", "option");
            empty.setAttribute("aria-disabled", "true");
            panel.append(empty);
        } else {
            for (const complaint of matches) {
                const option = el("button", "search-suggestion", "");
                option.type = "button";
                option.setAttribute("role", "option");
                option.setAttribute("aria-label", `${complaint.code || "Complaint"}, ${complaint.type || "Sanitation issue"}, ${statusLabel(complaint.status)}`);
                const top = el("span", "search-suggestion-top");
                top.append(
                    el("strong", "search-suggestion-code", complaint.code || "Complaint reference"),
                    el("span", `status-pill ${statusClass(complaint.status)}`, statusLabel(complaint.status))
                );
                const title = el("span", "search-suggestion-title", complaint.type || "Sanitation complaint");
                const snippetText = String(complaint.description || complaint.location || "").replace(/\s+/g, " ").trim();
                const snippet = el("span", "search-suggestion-snippet", snippetText.length > 105 ? `${snippetText.slice(0, 102)}…` : snippetText);
                option.append(top, title);
                if (snippetText) option.append(snippet);
                option.addEventListener("click", () => selectComplaintSearchSuggestion(complaint));
                panel.append(option);
            }
        }
        panel.hidden = false;
        input.setAttribute("aria-expanded", "true");
        state.searchActiveIndex = -1;
    }

    function handleComplaintSearchInput(event) {
        state.searchTerm = event.currentTarget.value || "";
        renderComplaints();
        renderComplaintSearchSuggestions();
    }

    function renderComplaints() {
        const list = $("complaintsList");
        if (!list) return;
        list.replaceChildren();

        const visible = state.complaints.filter(complaint => complaintMatchesSearch(complaint));

        if (!visible.length) {
            const empty = el("div", "empty-state");
            const icon = el("span", "empty-state-icon", state.searchTerm || state.activeFilter !== "all" ? "⌕" : "✓");
            icon.setAttribute("aria-hidden", "true");
            const title = el("h3", "", state.searchTerm || state.activeFilter !== "all" ? "No matching complaints" : "You're all caught up");
            const message = el("p", "", state.searchTerm || state.activeFilter !== "all"
                ? "Try another search term or choose a different status filter."
                : "You have not submitted a complaint yet. Use the report form above when you need to report a sanitation issue.");
            empty.append(icon, title, message);
            if (!state.searchTerm && state.activeFilter === "all") {
                const link = el("a", "primary-button link-button", "Report your first issue");
                link.href = "#reportComplaint";
                empty.append(link);
            }
            list.append(empty);
            return;
        }

        for (const complaint of visible) {
            const card = el("article", "complaint-card");
            card.id = `complaint-card-${Number(complaint.id)}`;
            card.dataset.complaintId = String(complaint.id);
            const top = el("div", "complaint-card-top");
            const primary = el("div", "complaint-title-block");
            primary.append(el("span", "complaint-code", complaint.code || "Complaint reference"));
            primary.append(el("h3", "", complaint.type || "Sanitation complaint"));
            top.append(primary, el("span", `status-pill ${statusClass(complaint.status)}`, statusLabel(complaint.status)));
            card.append(top);
            card.append(el("p", "complaint-description", complaint.description || "No description provided."));

            const meta = el("div", "complaint-meta-grid");
            appendMeta(meta, "Submitted", formatDate(complaint.reportedAt));
            appendMeta(meta, "Service Ward", complaint.ward?.number !== null && complaint.ward?.number !== undefined
                ? `Ward ${complaint.ward.number}${complaint.ward.name ? ` · ${complaint.ward.name}` : ""}`
                : "Ward unavailable");
            appendMeta(meta, "Issue location", complaint.location || "Residential profile address");
            card.append(meta);

            const footer = el("div", "complaint-card-footer");
            if (complaint.status === "open") {
                const cancel = el("button", "text-action cancel-complaint-button", "Cancel complaint");
                cancel.type = "button";
                cancel.addEventListener("click", () => cancelComplaint(complaint, cancel));
                footer.append(cancel);
            } else if (complaint.status === "resolved") {
                footer.append(el("span", "resolved-date", `Resolved ${formatDate(complaint.resolvedAt)}`));
            } else {
                footer.append(el("span", "muted-inline", `Updated ${formatDate(complaint.updatedAt)}`));
            }
            card.append(footer);
            list.append(card);
        }
    }

    function updateCounts() {
        const counts = {
            all: state.complaints.length,
            open: state.complaints.filter(item => item.status === "open").length,
            in_progress: state.complaints.filter(item => item.status === "in_progress").length,
            resolved: state.complaints.filter(item => item.status === "resolved").length,
            cancelled: state.complaints.filter(item => item.status === "cancelled").length
        };
        setText("statTotal", counts.all);
        setText("statOpen", counts.open);
        setText("statProgress", counts.in_progress);
        setText("statResolved", counts.resolved);
        setText("sidebarComplaintCount", counts.all);
        setText("filterCountAll", counts.all);
        setText("filterCountOpen", counts.open);
        setText("filterCountProgress", counts.in_progress);
        setText("filterCountResolved", counts.resolved);
        setText("filterCountCancelled", counts.cancelled);
    }

    async function loadComplaints(showMessage = false) {
        const button = $("refreshComplaintsButton");
        if (state.loading) return;
        state.loading = true;
        if (button) button.disabled = true;
        try {
            const result = await api("/api/citizen/complaints");
            state.complaints = Array.isArray(result.complaints) ? result.complaints : [];
            updateCounts();
            renderComplaints();
            renderComplaintSearchSuggestions();
            setText("complaintsUpdatedAt", `Updated ${new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
            if (showMessage) setNotice("Your complaint list has been refreshed.", "success");
        } catch (error) {
            setNotice(error.message || "Unable to load your complaints.", "error");
            const list = $("complaintsList");
            if (list && !state.complaints.length) {
                list.replaceChildren(el("div", "empty-state error-empty", "Unable to load complaints. Use Refresh to try again."));
            }
        } finally {
            state.loading = false;
            if (button) button.disabled = false;
        }
    }

    async function cancelComplaint(complaint, button) {
        if (!window.confirm(`Cancel complaint ${complaint.code}? This is only available while its status is Open.`)) return;
        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = "Cancelling…";
        try {
            const result = await mutate(`/api/citizen/complaints/${encodeURIComponent(complaint.id)}/cancel`, "PUT");
            setNotice(result.message || "Complaint cancelled.", "success");
            await loadComplaints(false);
        } catch (error) {
            setNotice(error.message || "Unable to cancel the complaint.", "error");
        } finally {
            button.disabled = false;
            button.textContent = oldText;
        }
    }

    function populateProfile(result) {
        const profile = result.profile || {};
        state.profile = profile;
        state.user = result.user || {};
        const name = profile.full_name || "Citizen";
        const ward = profile.ward || null;
        const wardName = ward
            ? `Ward ${ward.number ?? ""}${ward.name ? ` · ${ward.name}` : ""}`.trim().replace(/\s+·\s+/, " · ")
            : "Not confirmed";
        const avatar = [...name.trim()][0] || "C";

        setText("welcomeTitle", `Welcome, ${name}`);
        setText("headerUserName", name);
        setText("headerUserEmail", result.user?.email || "Citizen account");
        setText("headerAvatar", avatar.toUpperCase());
        setText("citizenEmail", result.user?.email);
        setText("citizenMobile", profile.mobile_number);
        setText("citizenAddress", `${profile.address || ""}${profile.city ? `, ${profile.city}` : ""}`.trim(), "Address not provided");
        setText("citizenPin", profile.postal_code);
        setText("wardName", wardName);
        setText("wardDivision", profile.division?.name || "Division unavailable");
        setText("heroWardName", wardName);
        setText("heroDivisionName", profile.division?.name ? `Division · ${profile.division.name}` : "Division unavailable");
        setText("sidebarWardName", ward ? `Ward ${ward.number ?? ward.code ?? ""}` : "Not confirmed");
        setText("complaintWardNotice", ward ? `Complaint routing: ${wardName}` : "Ward will be confirmed from your profile.");

        const source = result.wardResolution?.ward?.boundary_source;
        const sourceElement = $("wardBoundarySource");
        sourceElement.className = "boundary-source";
        if (source === "official") {
            setText("wardBoundarySource", "Boundary source: saved official geometry.");
            sourceElement.classList.add("source-official");
        } else if (source === "assistant_defined") {
            setText("wardBoundarySource", "AC-defined operational area. This is not a verified official KMC boundary.");
            sourceElement.classList.add("source-warning");
        } else if (source === "development") {
            setText("wardBoundarySource", "DEMO ONLY: this is a development boundary, not an official KMC Ward boundary.");
            sourceElement.classList.add("source-warning");
        } else {
            setText("wardBoundarySource", "Boundary source not identified.");
            sourceElement.classList.add("source-warning");
        }
    }

    function setCitizenLiveTrackingStatus(message, kind = "") {
        const element = $("citizenLiveTrackingStatus");
        if (!element) return;
        element.textContent = String(message || "");
        element.className = `citizen-live-tracking-status ${kind}`.trim();
    }

    function citizenGpsFreshness(vehicle, now = Date.now()) {
        const recordedAt = vehicle?.location?.recordedAt;
        if (!recordedAt) return { state: "unknown", label: "GPS timestamp unavailable" };
        const timestamp = new Date(recordedAt).getTime();
        if (!Number.isFinite(timestamp)) return { state: "unknown", label: "GPS timestamp unavailable" };
        const ageSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
        const ageLabel = ageSeconds < 60
            ? `${ageSeconds}s ago`
            : ageSeconds < 3600
                ? `${Math.floor(ageSeconds / 60)}m ago`
                : `${Math.floor(ageSeconds / 3600)}h ago`;
        if (ageSeconds <= 30) return { state: "live", label: `Live · ${ageLabel}` };
        if (ageSeconds <= 120) return { state: "delayed", label: `Delayed · ${ageLabel}` };
        return { state: "stale", label: `Last fix · ${ageLabel}` };
    }

    function citizenValidVehiclePoint(vehicle) {
        const latitude = Number(vehicle?.location?.latitude);
        const longitude = Number(vehicle?.location?.longitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
        if (vehicle?.location?.latitude === null || vehicle?.location?.longitude === null) return null;
        return [latitude, longitude];
    }

    function createCitizenLiveTruckIcon(vehicle) {
        if (!window.L) return null;
        const gpsState = citizenGpsFreshness(vehicle).state;
        return L.divIcon({
            className: "",
            html: `<div class="citizen-live-truck-marker gps-${gpsState}" role="img" aria-label="Collection truck, ${gpsState} GPS">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6.5h11v9H3z"></path>
                    <path d="M14 10h4l3 3v2.5h-7z"></path>
                    <circle cx="7" cy="18" r="2"></circle>
                    <circle cx="18" cy="18" r="2"></circle>
                </svg>
            </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });
    }

    function buildCitizenTruckPopup(vehicle) {
        const popup = el("div", "citizen-live-tracking-popup");
        const title = el("strong", "", vehicle.vehicleNumber || "Collection vehicle");
        const status = el("span", "", `Vehicle status: ${String(vehicle.status || "unknown").replace(/_/g, " ")}`);
        const routeName = vehicle.assignment?.routeName || vehicle.assignment?.routeCode || "Active collection route";
        const route = el("span", "", `Route: ${routeName}`);
        const gps = citizenGpsFreshness(vehicle);
        const location = el("span", "", gps.label);
        popup.append(title, status, route, location);
        const accuracy = Number(vehicle.location?.accuracyMeters);
        if (Number.isFinite(accuracy) && accuracy >= 0) {
            popup.append(el("span", "", `Reported GPS accuracy: ±${Math.round(accuracy)} m`));
        }
        return popup;
    }

    function setupCitizenLiveMap() {
        const element = $("citizenLiveTrackingMap");
        if (!element || !window.L) {
            setCitizenLiveTrackingStatus("Map library unavailable. Refresh the page to retry.", "error");
            return false;
        }
        if (citizenLiveMap) return true;
        try {
            citizenLiveMap = L.map(element, {
                zoomControl: true,
                scrollWheelZoom: false,
                attributionControl: true
            }).setView([16.705, 74.243], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(citizenLiveMap);
            window.setTimeout(() => citizenLiveMap?.invalidateSize({ pan: false }), 100);
            return true;
        } catch (error) {
            console.error("Citizen live map initialization failed:", error);
            setCitizenLiveTrackingStatus("Unable to initialize the map.", "error");
            return false;
        }
    }

    function updateCitizenWardBoundary(ward) {
        const wardId = Number(ward?.id);
        if (Number.isSafeInteger(wardId) && wardId > 0 && citizenLiveWardId !== wardId) {
            citizenLiveWardId = wardId;
            citizenLiveInitialViewSet = false;
        }
        const polygon = ward?.boundary?.polygon;
        const validPolygon = Array.isArray(polygon) && polygon.length >= 3 && polygon.every(point =>
            Array.isArray(point) && point.length >= 2 &&
            Number.isFinite(Number(point[0])) && Number(point[0]) >= -90 && Number(point[0]) <= 90 &&
            Number.isFinite(Number(point[1])) && Number(point[1]) >= -180 && Number(point[1]) <= 180
        );
        if (citizenLiveWardLayer) {
            citizenLiveMap?.removeLayer(citizenLiveWardLayer);
            citizenLiveWardLayer = null;
        }
        if (citizenLiveMap && validPolygon) {
            citizenLiveWardLayer = L.polygon(polygon, {
                color: "#6e875f",
                weight: 2,
                dashArray: ward.boundary.source === "official" ? "5 4" : "7 6",
                fillColor: "#d6e2ce",
                fillOpacity: 0.12
            }).addTo(citizenLiveMap);
            citizenLiveWardLayer.bindPopup(
                `Ward ${String(ward.number ?? "")} ${String(ward.name || "")}`.trim()
            );
            if (!citizenLiveInitialViewSet) {
                citizenLiveMap.fitBounds(citizenLiveWardLayer.getBounds(), { padding: [24, 24], maxZoom: 16 });
                citizenLiveInitialViewSet = true;
            }
        }
    }

    function updateCitizenTruckMarkers(vehicles) {
        const listedIds = new Set();
        vehicles.forEach(vehicle => {
            const id = Number(vehicle.databaseId);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            listedIds.add(id);
            const point = citizenValidVehiclePoint(vehicle);
            let marker = citizenLiveMarkers.get(id);
            if (!point) {
                if (marker) {
                    citizenLiveMap.removeLayer(marker);
                    citizenLiveMarkers.delete(id);
                }
                return;
            }
            const icon = createCitizenLiveTruckIcon(vehicle);
            if (!marker) {
                marker = L.marker(point, { icon, title: String(vehicle.vehicleNumber || "Collection vehicle") });
                marker.addTo(citizenLiveMap);
                citizenLiveMarkers.set(id, marker);
            } else {
                marker.setLatLng(point);
                marker.setIcon(icon);
                marker.options.title = String(vehicle.vehicleNumber || "Collection vehicle");
            }
            marker.bindPopup(buildCitizenTruckPopup(vehicle));
        });

        for (const [id, marker] of citizenLiveMarkers.entries()) {
            if (!listedIds.has(id)) {
                citizenLiveMap.removeLayer(marker);
                citizenLiveMarkers.delete(id);
            }
        }
    }

    async function pollCitizenLiveTracking() {
        if (citizenLivePollingStopped || citizenLivePollInFlight || document.hidden) return;
        if (!setupCitizenLiveMap()) return;
        citizenLivePollInFlight = true;
        const refreshButton = $("refreshCitizenLiveTracking");
        if (refreshButton) refreshButton.disabled = true;
        try {
            const result = await api("/api/citizen/live-tracking");
            updateCitizenWardBoundary(result.ward);
            const vehicles = Array.isArray(result.vehicles) ? result.vehicles : [];
            updateCitizenTruckMarkers(vehicles);
            const located = vehicles.filter(citizenValidVehiclePoint).length;
            if (!result.ward) {
                setCitizenLiveTrackingStatus("Confirm your service Ward to view local collection trucks.", "pending");
            } else if (!vehicles.length) {
                setCitizenLiveTrackingStatus(`Ward ${result.ward.number}: no active collection vehicles assigned right now.`, "");
            } else {
                setCitizenLiveTrackingStatus(`${located} of ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} with a location · updates every ${Number(result.refreshAfterSeconds) || 10}s`, "");
            }
        } catch (error) {
            console.error("Citizen live tracking poll failed:", error);
            if (error.status === 401 || error.status === 403) {
                citizenLivePollingStopped = true;
                setCitizenLiveTrackingStatus("Sign in again to view live collection tracking.", "error");
                return;
            }
            setCitizenLiveTrackingStatus("Live locations could not be refreshed. Retrying shortly.", "error");
        } finally {
            citizenLivePollInFlight = false;
            if (refreshButton) refreshButton.disabled = false;
            if (!citizenLivePollingStopped && citizenLivePollTimer === null) {
                citizenLivePollTimer = window.setTimeout(() => {
                    citizenLivePollTimer = null;
                    pollCitizenLiveTracking();
                }, 10000);
            }
        }
    }

    let citizenServiceNotifications = [];
    let citizenNotificationsPollTimer = null;
    let citizenNotificationsPollInFlight = false;
    let citizenNotificationsPollingStopped = false;
    let citizenNotificationsInitialized = false;
    const knownCitizenNotificationIds = new Set();

    function setCitizenNotificationsStatus(message, kind = "") {
        const element = $("citizenNotificationsStatus");
        if (!element) return;
        element.textContent = String(message || "");
        element.className = `citizen-notifications-status ${kind}`.trim();
    }

    function renderCitizenNotifications() {
        const list = $("citizenNotificationsList");
        const markReadButton = $("markCitizenNotificationsRead");
        if (!list) return;

        const unreadCount = citizenServiceNotifications.filter(item => !item.isRead).length;
        if (markReadButton) markReadButton.disabled = unreadCount === 0;

        list.replaceChildren();
        if (!citizenServiceNotifications.length) {
            list.append(el("div", "citizen-notifications-empty", "No route-start notifications for your confirmed Ward yet."));
            setCitizenNotificationsStatus("No new Ward route updates", "");
            return;
        }

        setCitizenNotificationsStatus(
            `${unreadCount} unread · updates checked every 15 seconds`,
            unreadCount ? "unread" : ""
        );

        for (const notification of citizenServiceNotifications) {
            const card = el(
                "article",
                `citizen-notification-card${notification.isRead ? "" : " unread"}`
            );
            const icon = el("span", "citizen-notification-indicator", notification.isRead ? "✓" : "•");
            icon.setAttribute("aria-hidden", "true");
            const content = el("div", "citizen-notification-content");
            content.append(el("strong", "", notification.title || "Ward collection update"));
            content.append(el("p", "", notification.message || "A collection route has started for your Ward."));
            const meta = el("small", "", `${notification.routeCode ? `${notification.routeCode} · ` : ""}${formatDate(notification.createdAt)}`);
            content.append(meta);
            card.append(icon, content);
            list.append(card);
        }
    }

    async function loadCitizenNotifications(showMessage = false) {
        if (citizenNotificationsPollInFlight) return;
        citizenNotificationsPollInFlight = true;
        const refreshButton = $("refreshCitizenNotifications");
        if (refreshButton) refreshButton.disabled = true;

        try {
            const result = await api("/api/citizen/notifications");
            const incoming = Array.isArray(result.notifications)
                ? result.notifications
                : [];

            const newlyArrived = citizenNotificationsInitialized
                ? incoming.filter(item => !knownCitizenNotificationIds.has(String(item.id)) && !item.isRead)
                : [];

            citizenServiceNotifications = incoming;
            for (const item of incoming) knownCitizenNotificationIds.add(String(item.id));
            citizenNotificationsInitialized = true;
            renderCitizenNotifications();

            if (newlyArrived.length) {
                setCitizenNotificationsStatus(
                    `${newlyArrived.length} new route update${newlyArrived.length === 1 ? "" : "s"} · updates checked every 15 seconds`,
                    "unread"
                );
            } else if (showMessage) {
                setCitizenNotificationsStatus("Ward route updates refreshed", "");
            }
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                citizenNotificationsPollingStopped = true;
                setCitizenNotificationsStatus("Sign in again to receive Ward route updates.", "error");
            } else {
                setCitizenNotificationsStatus("Route updates are temporarily unavailable. Retrying shortly.", "error");
            }
        } finally {
            citizenNotificationsPollInFlight = false;
            if (refreshButton) refreshButton.disabled = false;
        }
    }

    function scheduleCitizenNotificationsPoll(delay = 15000) {
        if (citizenNotificationsPollingStopped || document.hidden || citizenNotificationsPollTimer !== null) return;
        citizenNotificationsPollTimer = window.setTimeout(async () => {
            citizenNotificationsPollTimer = null;
            await loadCitizenNotifications(false);
            scheduleCitizenNotificationsPoll(15000);
        }, delay);
    }

    function startCitizenNotificationsPolling() {
        citizenNotificationsPollingStopped = false;
        void loadCitizenNotifications(false).finally(() => scheduleCitizenNotificationsPoll(15000));
    }

    $("refreshCitizenNotifications")?.addEventListener("click", async () => {
        await loadCitizenNotifications(true);
        scheduleCitizenNotificationsPoll(15000);
    });

    $("markCitizenNotificationsRead")?.addEventListener("click", async buttonEvent => {
        const button = buttonEvent.currentTarget;
        button.disabled = true;
        try {
            await mutate("/api/citizen/notifications/read", "PUT", {});
            await loadCitizenNotifications(false);
            setCitizenNotificationsStatus("Ward route notifications marked as read", "");
        } catch (error) {
            setCitizenNotificationsStatus(error.message || "Unable to mark notifications as read.", "error");
        } finally {
            button.disabled = false;
            renderCitizenNotifications();
        }
    });

    function startCitizenLiveTrackingPolling() {
        citizenLivePollingStopped = false;
        pollCitizenLiveTracking();
    }

    $("refreshCitizenLiveTracking")?.addEventListener("click", () => {
        if (citizenLivePollTimer !== null) {
            window.clearTimeout(citizenLivePollTimer);
            citizenLivePollTimer = null;
        }
        pollCitizenLiveTracking();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (citizenNotificationsPollTimer !== null) {
                window.clearTimeout(citizenNotificationsPollTimer);
                citizenNotificationsPollTimer = null;
            }
            return;
        }

        if (!citizenLivePollingStopped) {
            if (citizenLivePollTimer !== null) {
                window.clearTimeout(citizenLivePollTimer);
                citizenLivePollTimer = null;
            }
            pollCitizenLiveTracking();
        }
        if (!citizenNotificationsPollingStopped) {
            void loadCitizenNotifications(false).finally(() => scheduleCitizenNotificationsPoll(15000));
        }
    });

    window.addEventListener("pagehide", () => {
        citizenLivePollingStopped = true;
        citizenNotificationsPollingStopped = true;
        if (citizenLivePollTimer !== null) {
            window.clearTimeout(citizenLivePollTimer);
            citizenLivePollTimer = null;
        }
        if (citizenNotificationsPollTimer !== null) {
            window.clearTimeout(citizenNotificationsPollTimer);
            citizenNotificationsPollTimer = null;
        }
    });

    window.addEventListener("pageshow", () => {
        if (!document.hidden && citizenLivePollingStopped) {
            citizenLivePollingStopped = false;
            pollCitizenLiveTracking();
        }
        if (!document.hidden && citizenNotificationsPollingStopped) {
            citizenNotificationsPollingStopped = false;
            void loadCitizenNotifications(false).finally(() => scheduleCitizenNotificationsPoll(15000));
        }
    });

    async function initialize() {
        let me;
        try {
            me = await api("/api/auth/me");
        } catch {
            window.location.replace("/login");
            return;
        }

        if (me.user?.role !== "citizen") {
            window.location.replace("/login");
            return;
        }

        try {
            const profileResult = await api("/api/citizen/profile");
            if (!profileResult.profileComplete) {
                window.location.replace("/citizenDash/profile");
                return;
            }
            populateProfile(profileResult);
            startCitizenLiveTrackingPolling();
            await loadCsrfToken();
            await loadComplaints(false);
            startCitizenNotificationsPolling();
        } catch (error) {
            console.error("Citizen dashboard initialization failed:", error);
            setNotice(error.message || "Unable to load the Citizen dashboard.", "error");
        }
    }

    $("complaintForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const type = $("complaintType").value;
        const description = $("complaintDescription").value.trim();
        const location = $("complaintLocation").value.trim();
        if (description.length < 15) {
            setNotice("Please describe the issue in at least 15 characters.", "error");
            $("complaintDescription").focus();
            return;
        }
        const button = $("submitComplaintButton");
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Submitting…';
        try {
            const result = await mutate("/api/citizen/complaints", "POST", {
                complaint_type: type,
                description,
                location_text: location
            });
            form.reset();
            setText("descriptionCount", "0 / 2500");
            setNotice(`${result.message} Reference: ${result.complaint?.code || "created"}.`, "success");
            await loadComplaints(false);
            const list = $("myComplaints");
            if (list) list.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            setNotice(error.message || "Unable to submit the complaint.", "error");
        } finally {
            button.disabled = false;
            button.innerHTML = original;
        }
    });

    $("complaintDescription")?.addEventListener("input", event => {
        setText("descriptionCount", `${event.currentTarget.value.length} / 2500`);
    });

    $("complaintForm")?.addEventListener("reset", () => {
        window.setTimeout(() => setText("descriptionCount", "0 / 2500"), 0);
    });

    $("refreshComplaintsButton")?.addEventListener("click", () => loadComplaints(true));

    const complaintSearch = $("complaintSearch");
    const complaintSearchWrap = document.querySelector(".complaint-search-wrap");
    complaintSearch?.addEventListener("input", handleComplaintSearchInput);
    complaintSearch?.addEventListener("search", handleComplaintSearchInput);
    complaintSearch?.addEventListener("focus", () => {
        if (state.searchTerm.trim()) renderComplaintSearchSuggestions();
    });
    complaintSearch?.addEventListener("keydown", event => {
        const firstOption = $("complaintSearchSuggestions")?.querySelector(".search-suggestion");
        if (event.key === "ArrowDown" && firstOption) {
            event.preventDefault();
            firstOption.focus();
        } else if (event.key === "Enter" && firstOption && !$("complaintSearchSuggestions")?.hidden) {
            event.preventDefault();
            firstOption.click();
        } else if (event.key === "Escape") {
            closeComplaintSearchSuggestions();
        }
    });
    document.addEventListener("pointerdown", event => {
        if (complaintSearchWrap && !complaintSearchWrap.contains(event.target)) {
            closeComplaintSearchSuggestions();
        }
    });

    document.querySelectorAll("[data-status-filter]").forEach(button => {
        button.addEventListener("click", () => {
            state.activeFilter = button.dataset.statusFilter || "all";
            document.querySelectorAll("[data-status-filter]").forEach(item => {
                const active = item === button;
                item.classList.toggle("active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            renderComplaints();
        });
    });

    document.querySelectorAll("[data-section]").forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.dataset.section;
            const target = targetId ? $(targetId) : null;
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            document.querySelectorAll("[data-section]").forEach(item => item.classList.toggle("active", item === link));
            $("citizenApp")?.classList.remove("mobile-menu-open");
            $("sidebarToggle")?.setAttribute("aria-expanded", "false");
        });
    });

    $("sidebarBackdrop")?.addEventListener("click", () => {
        $("citizenApp")?.classList.remove("mobile-menu-open");
        $("sidebarToggle")?.setAttribute("aria-expanded", "false");
    });

    $("sidebarToggle")?.addEventListener("click", () => {
        const app = $("citizenApp");
        if (!app) return;
        const mobile = window.matchMedia("(max-width: 900px)").matches;
        if (mobile) {
            const open = app.classList.toggle("mobile-menu-open");
            $("sidebarToggle").setAttribute("aria-expanded", String(open));
        } else {
            const collapsed = app.classList.toggle("sidebar-collapsed");
            $("sidebarToggle").setAttribute("aria-expanded", String(!collapsed));
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            $("citizenApp")?.classList.remove("mobile-menu-open");
            $("sidebarToggle")?.setAttribute("aria-expanded", "false");
            closeComplaintSearchSuggestions();
        }
    });

    $("logoutButton")?.addEventListener("click", async () => {
        const button = $("logoutButton");
        button.disabled = true;
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            });
        } finally {
            window.location.replace("/login");
        }
    });

    initialize();
})();

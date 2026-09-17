/* =========================================================
   SWACHHITRA
   SANITARY INSPECTOR DASHBOARD
   Stitch-inspired interaction layer
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // ---------------------------------------------------------
    // SESSION GUARD
    // ---------------------------------------------------------

    // ---------------------------------------------------------
    // DOM
    // ---------------------------------------------------------
    const sidebar = document.getElementById("sidebar");
    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileBackdrop = document.getElementById("mobileBackdrop");

    const navButtons = document.querySelectorAll("[data-tab]");
    const panels = document.querySelectorAll(".tab-panel");

    const globalSearch = document.getElementById("globalSearch");
    const notificationButton = document.getElementById("notificationButton");
    const headerNotificationButton = document.getElementById("headerNotificationButton");
    const notificationPreview = document.getElementById("notificationPreview");
    const notificationDrawer = document.getElementById("notificationDrawer");
    const closeNotificationDrawer = document.getElementById("closeNotificationDrawer");
    const markNotificationsRead = document.getElementById("markNotificationsRead");
    const notificationCount = document.getElementById("notificationCount");

    const settingsButton = document.getElementById("settingsButton");
    const headerUserButton = document.getElementById("headerUserButton");
    const logoutButton = document.getElementById("logoutButton");

    const trackingMap = document.getElementById("trackingMap");
    const routeMap = document.getElementById("routeMap");
    const corridorButton = document.getElementById("corridorButton");
    const truckLayerButton = document.getElementById("truckLayerButton");
    const mapPlus = document.getElementById("mapPlus");
    const mapMinus = document.getElementById("mapMinus");
    const toggleGeofenceButton = document.getElementById("toggleGeofenceButton");

    const activeRoutesList = document.getElementById("activeRoutesList");
    const vehiclePairings = document.getElementById("vehiclePairings");

    const reportSearch = document.getElementById("reportSearch");
    const reportPriorityFilter = document.getElementById("reportPriorityFilter");
    const reportStatusFilter = document.getElementById("reportStatusFilter");
    const reportTableBody = document.getElementById("reportTableBody");

    const addRouteModal = document.getElementById("addRouteModal");
    const addRouteForm = document.getElementById("addRouteForm");
    const createRouteButton = document.getElementById("createRouteButton");
    const routePlusButton = document.getElementById("routePlusButton");
    const assignRouteFromOverview = document.getElementById("assignRouteFromOverview");

    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toastMessage");

    // ---------------------------------------------------------
    // DEMO DATA
    // ---------------------------------------------------------
    const trucks = [
        {
            id: "TRK-024",
            driver: "Rajesh Kumar",
            route: "R-017",
            zone: "Central Zone",
            status: "Collecting",
            statusKey: "collecting",
            fill: 68,
            eta: "14 min",
            position: [22.5726, 88.3639]
        },
        {
            id: "TRK-031",
            driver: "Amit Patil",
            route: "R-022",
            zone: "North Zone",
            status: "En Route",
            statusKey: "enroute",
            fill: 42,
            eta: "09 min",
            position: [22.5838, 88.3701]
        },
        {
            id: "TRK-045",
            driver: "Sneha Das",
            route: "R-009",
            zone: "East Zone",
            status: "Delayed",
            statusKey: "delayed",
            fill: 81,
            eta: "06 min",
            position: [22.5637, 88.3825]
        }
    ];

    let routes = [
        {
            id: "R-017",
            zone: "Central Ward 8",
            state: "ON SCHEDULE",
            stateKey: "schedule",
            vehicle: "TRK-024 (DL-1C-5582)",
            driver: "Rajesh Kumar",
            progressText: "58/84 stops (68%)",
            action: "Reassign"
        },
        {
            id: "R-009",
            zone: "West Ward 9",
            state: "DELAYED 25 MINS",
            stateKey: "delayed",
            vehicle: "TRK-045 (DL-1C-9901)",
            driver: "Sunil Verma",
            progressText: "32/76 stops (42%)",
            action: "Optimize Path"
        },
        {
            id: "R-022",
            zone: "Commercial Ward 14",
            state: "STARTING",
            stateKey: "starting",
            vehicle: "TRK-011 (DL-1C-3211)",
            driver: "Manoj Yadav",
            progressText: "62 Scheduled",
            action: "Dispatch"
        }
    ];

    let reports = [
        {
            id: "CR-1042",
            type: "Overflowing Community Dumper",
            location: "Ward 9 • Sector 4 Market Corner",
            time: "22 mins ago",
            priority: "CRITICAL",
            priorityKey: "high",
            status: "Assigned to TRK-045",
            statusKey: "open"
        },
        {
            id: "CR-1039",
            type: "Missed Door-to-Door Collection",
            location: "Ward 8 • Pocket B Residential Block",
            time: "45 mins ago",
            priority: "MEDIUM",
            priorityKey: "medium",
            status: "Crew en-route",
            statusKey: "in-progress"
        },
        {
            id: "CR-1037",
            type: "Damaged Public Bin",
            location: "Ward 14 • Main Junction",
            time: "1 hr ago",
            priority: "LOW",
            priorityKey: "low",
            status: "Open",
            statusKey: "open"
        }
    ];

    // ---------------------------------------------------------
    // UTILS
    // ---------------------------------------------------------
    let toastTimer = null;

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showToast(message) {
        if (!toast || !toastMessage) return;
        toastMessage.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    }

    // ---------------------------------------------------------
    // TAB SYSTEM: Stitch-style, one panel visible at a time
    // ---------------------------------------------------------
    function switchTab(tabId) {
        panels.forEach(panel => {
            panel.classList.toggle("active", panel.id === `panel-${tabId}`);
        });

        document.querySelectorAll(".navigation-item[data-tab]").forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tabId);
        });

        if (window.innerWidth <= 980) {
            closeSidebar();
        }

        if (tabId === "overview") {
            setTimeout(() => {
                trackingMap && window.L && overviewMap?.invalidateSize();
            }, 80);
        }

        if (tabId === "routes") {
            setTimeout(() => {
                routeMap && window.L && routeMapInstance?.invalidateSize();
            }, 80);
        }

        if (tabId === "vehicles-drivers") {
            renderVehiclePairings();
        }

        if (tabId === "citizen-reports") {
            renderReports();
        }
    }

    window.switchTab = switchTab;

    navButtons.forEach(button => {
        const tab = button.dataset.tab;
        if (!tab) return;
        button.addEventListener("click", () => switchTab(tab));
    });

    document.querySelectorAll("button[data-tab]").forEach(button => {
        if (button.closest(".navigation-item")) return;
        button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    // ---------------------------------------------------------
    // MOBILE SIDEBAR
    // ---------------------------------------------------------
    function openSidebar() {
        sidebar?.classList.add("open");
        mobileBackdrop?.classList.add("visible");
        mobileMenuButton?.setAttribute("aria-expanded", "true");
    }

    function closeSidebar() {
        sidebar?.classList.remove("open");
        mobileBackdrop?.classList.remove("visible");
        mobileMenuButton?.setAttribute("aria-expanded", "false");
    }

    mobileMenuButton?.addEventListener("click", () => {
        sidebar?.classList.contains("open") ? closeSidebar() : openSidebar();
    });

    mobileBackdrop?.addEventListener("click", closeSidebar);

    // ---------------------------------------------------------
    // NOTIFICATIONS
    // ---------------------------------------------------------
    function openNotifications() {
        notificationDrawer?.classList.add("open");
        notificationDrawer?.setAttribute("aria-hidden", "false");
    }

    function closeNotifications() {
        notificationDrawer?.classList.remove("open");
        notificationDrawer?.setAttribute("aria-hidden", "true");
    }

    notificationButton?.addEventListener("click", openNotifications);
    headerNotificationButton?.addEventListener("click", openNotifications);
    notificationPreview?.addEventListener("click", openNotifications);
    closeNotificationDrawer?.addEventListener("click", closeNotifications);

    markNotificationsRead?.addEventListener("click", () => {
        if (notificationCount) notificationCount.textContent = "0";
        const dot = headerNotificationButton?.querySelector("i");
        if (dot) dot.style.display = "none";
        showToast("All notifications marked as read");
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeNotifications();
            closeModal(addRouteModal);
        }

        if (event.key === "/" && document.activeElement !== globalSearch) {
            event.preventDefault();
            globalSearch?.focus();
        }
    });

    // ---------------------------------------------------------
    // SETTINGS / PROFILE / LOGOUT
    // ---------------------------------------------------------
    settingsButton?.addEventListener("click", () => {
        showToast("Settings panel is prepared for the next backend phase");
    });

    headerUserButton?.addEventListener("click", () => {
        showToast("Signed in as Sanitary Inspector");
    });

    logoutButton?.addEventListener("click", async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } finally {
            window.location.href = "/login";
        }
    });

    // ---------------------------------------------------------
    // LEAFLET MAPS
    // ---------------------------------------------------------
    let overviewMap = null;
    let routeMapInstance = null;
    const markerMap = new Map();

    function truckIcon(truck) {
        if (typeof window.L === "undefined") return null;
        return L.divIcon({
            className: "",
            html: `<div class="custom-truck-marker ${escapeHTML(truck.statusKey)}"><span>▣</span></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -13]
        });
    }

    function truckPopup(truck) {
        return `<div class="truck-popup">
            <strong>${escapeHTML(truck.id)} (${escapeHTML(truck.route)})</strong>
            <span>Driver: ${escapeHTML(truck.driver)}</span>
            <span>Zone: ${escapeHTML(truck.zone)}</span>
            <span>Status: ${escapeHTML(truck.status)}</span>
            <span>Fill: ${truck.fill}% • ETA: ${escapeHTML(truck.eta)}</span>
        </div>`;
    }

    function addTruckMarkers(map) {
        trucks.forEach(truck => {
            const marker = L.marker(truck.position, { icon: truckIcon(truck), title: truck.id })
                .addTo(map)
                .bindPopup(truckPopup(truck));
            markerMap.set(truck.id, marker);
        });
    }

    function addDemoRouteLines(map) {
        L.polyline([
            [22.5699, 88.3565], [22.5730, 88.3635], [22.5775, 88.3690], [22.5816, 88.3730]
        ], { color: "#16a34a", weight: 4, dashArray: "6 6", opacity: .85 }).addTo(map);

        L.polyline([
            [22.5612, 88.3840], [22.5655, 88.3810], [22.5692, 88.3780], [22.5740, 88.3740]
        ], { color: "#f59e0b", weight: 4, dashArray: "6 6", opacity: .85 }).addTo(map);

        L.circleMarker([22.5690, 88.3787], {
            radius: 7,
            color: "#dc2626",
            fillColor: "#dc2626",
            fillOpacity: .9,
            weight: 2
        }).addTo(map).bindTooltip("Citizen Complaint Hotspot", { direction: "top" });
    }

    function setupMap(element, options = {}) {
        if (!element || typeof window.L === "undefined") return null;

        try {
            const map = L.map(element, {
                zoomControl: options.zoomControl ?? true,
                scrollWheelZoom: false,
                attributionControl: true
            }).setView([22.5726, 88.3700], 13);

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(map);

            return map;
        } catch (error) {
            console.error("SWACHHITRA map initialization failed:", error);
            return null;
        }
    }

    overviewMap = setupMap(trackingMap);
    if (overviewMap) {
        addTruckMarkers(overviewMap);
        addDemoRouteLines(overviewMap);
    }

    routeMapInstance = setupMap(routeMap);
    if (routeMapInstance) {
        addDemoRouteLines(routeMapInstance);
    }

    mapPlus?.addEventListener("click", () => overviewMap?.zoomIn());
    mapMinus?.addEventListener("click", () => overviewMap?.zoomOut());

    corridorButton?.addEventListener("click", () => {
        corridorButton.classList.toggle("active");
        showToast(corridorButton.classList.contains("active") ? "All corridors enabled" : "All corridors hidden");
    });

    truckLayerButton?.addEventListener("click", () => {
        truckLayerButton.classList.toggle("active");
        markerMap.forEach(marker => {
            if (truckLayerButton.classList.contains("active")) marker.addTo(overviewMap);
            else marker.remove();
        });
        showToast(truckLayerButton.classList.contains("active") ? "Truck layer enabled" : "Truck layer hidden");
    });

    toggleGeofenceButton?.addEventListener("click", () => {
        toggleGeofenceButton.classList.toggle("active");
        showToast(toggleGeofenceButton.classList.contains("active") ? "Geofence markers enabled" : "Geofence markers hidden");
    });

    // ---------------------------------------------------------
    // ROUTES TAB
    // ---------------------------------------------------------
    function renderActiveRoutes() {
        if (!activeRoutesList) return;

        activeRoutesList.innerHTML = routes.map(route => `
            <article class="active-route-card" data-route-id="${escapeHTML(route.id)}">
                <div class="active-route-top">
                    <span class="route-id-chip">${escapeHTML(route.id)} • ${escapeHTML(route.zone)}</span>
                    <span class="route-state ${escapeHTML(route.stateKey)}">${escapeHTML(route.state)}</span>
                </div>
                <div class="active-route-meta">
                    <div><span>VEHICLE</span><strong>${escapeHTML(route.vehicle)}</strong></div>
                    <div><span>DRIVER</span><strong>${escapeHTML(route.driver)}</strong></div>
                </div>
                <div class="active-route-footer">
                    <span>${escapeHTML(route.progressText)}</span>
                    <button type="button" data-route-action="${escapeHTML(route.action)}" data-route-id="${escapeHTML(route.id)}">${escapeHTML(route.action)} →</button>
                </div>
            </article>
        `).join("");
    }

    renderActiveRoutes();

    activeRoutesList?.addEventListener("click", event => {
        const button = event.target.closest("[data-route-action]");
        if (!button) return;
        showToast(`${button.dataset.routeAction} action opened for ${button.dataset.routeId}`);
    });

    // ---------------------------------------------------------
    // VEHICLE + DRIVER REGISTRY
    // ---------------------------------------------------------
    const pairings = [
        {
            id: "PR-881",
            duty: "DUTY: ACTIVE",
            dutyKey: "active",
            initials: "RK",
            driver: "Rajesh Kumar",
            employee: "Emp #DRV-104",
            mobile: "+91 98112-44210",
            email: "r.kumar@swachhitra.gov",
            dl: "HMV-Commercial (Valid 2028)",
            truck: "TRK-024",
            type: "Compactor 8T",
            plate: "DL-1C-5582",
            make: "Tata Signa 1923.K",
            load: "68% (5.4 / 8.0 Tons)",
            route: "R-017 (Ward 8)"
        },
        {
            id: "PR-882",
            duty: "DELAYED TRAFFIC",
            dutyKey: "delayed",
            initials: "SV",
            driver: "Sunil Verma",
            employee: "Emp #DRV-118",
            mobile: "+91 97220-33411",
            email: "s.verma@swachhitra.gov",
            dl: "HMV-Commercial (Valid 2026)",
            truck: "TRK-045",
            type: "Hydraulic Tipper 6T",
            plate: "DL-1C-9901",
            make: "Ashok Leyland Ecomet",
            load: "42% (2.5 / 6.0 Tons)",
            route: "R-009 (Ward 9)"
        }
    ];

    function renderVehiclePairings() {
        if (!vehiclePairings) return;
        vehiclePairings.innerHTML = pairings.map(item => `
            <article class="pairing-card card-shell">
                <div class="pairing-top">
                    <span class="pairing-id">PAIRING ID #${escapeHTML(item.id)}</span>
                    <span class="duty-state ${escapeHTML(item.dutyKey)}">${escapeHTML(item.duty)}</span>
                </div>
                <div class="pairing-body">
                    <div class="person-panel">
                        <div class="person-top">
                            <div class="avatar-small">${escapeHTML(item.initials)}</div>
                            <div><strong>${escapeHTML(item.driver)}</strong><span>${escapeHTML(item.employee)}</span></div>
                        </div>
                        <div class="person-info">
                            <div><b>Mobile:</b> ${escapeHTML(item.mobile)}</div>
                            <div><b>Email:</b> ${escapeHTML(item.email)}</div>
                            <div><b>DL Class:</b> ${escapeHTML(item.dl)}</div>
                        </div>
                    </div>
                    <div class="person-panel">
                        <div class="vehicle-row"><strong>⇄ ${escapeHTML(item.truck)}</strong><span class="vehicle-type">${escapeHTML(item.type)}</span></div>
                        <div class="vehicle-spec">
                            <div><b>V-Number Plate:</b> ${escapeHTML(item.plate)}</div>
                            <div><b>Make:</b> ${escapeHTML(item.make)}</div>
                            <div><b>Current Load:</b> ${escapeHTML(item.load)}</div>
                        </div>
                    </div>
                </div>
                <div class="pairing-footer">
                    <span>Assigned Route: <strong>${escapeHTML(item.route)}</strong></span>
                    <div class="pairing-actions">
                        <button class="small-button" type="button" data-action="call" data-driver="${escapeHTML(item.driver)}">Call Driver</button>
                        <button class="small-button ${item.dutyKey === "delayed" ? "warn" : "primary"}" type="button" data-action="inspect" data-truck="${escapeHTML(item.truck)}">${item.dutyKey === "delayed" ? "Send Alert" : "Inspect Truck"}</button>
                    </div>
                </div>
            </article>
        `).join("");
    }

    renderVehiclePairings();

    vehiclePairings?.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "call") showToast(`Call Driver: ${button.dataset.driver}`);
        if (button.dataset.action === "inspect") showToast(`${button.textContent}: ${button.dataset.truck}`);
    });

    // ---------------------------------------------------------
    // CITIZEN REPORTS
    // ---------------------------------------------------------
    function renderReports() {
        if (!reportTableBody) return;

        const query = (reportSearch?.value || "").trim().toLowerCase();
        const priority = reportPriorityFilter?.value || "all";
        const status = reportStatusFilter?.value || "all";

        const filtered = reports.filter(report => {
            const matchesQuery = !query || [report.id, report.type, report.location, report.status]
                .join(" ").toLowerCase().includes(query);
            const matchesPriority = priority === "all" || report.priorityKey === priority;
            const matchesStatus = status === "all" || report.statusKey === status;
            return matchesQuery && matchesPriority && matchesStatus;
        });

        reportTableBody.innerHTML = filtered.length ? filtered.map(report => `
            <tr>
                <td><span class="ticket-id">${escapeHTML(report.id)}</span></td>
                <td><strong>${escapeHTML(report.type)}</strong></td>
                <td>${escapeHTML(report.location)}</td>
                <td>${escapeHTML(report.time)}</td>
                <td><span class="priority ${escapeHTML(report.priorityKey)}">${escapeHTML(report.priority)}</span></td>
                <td><span class="report-status ${report.statusKey === "open" ? "assigned" : "progress"}">${escapeHTML(report.status)}</span></td>
                <td><button class="report-action ${report.statusKey === "in-progress" ? "secondary" : ""}" type="button" data-report-action="${report.statusKey === "open" ? "dispatch" : "resolve"}" data-report-id="${escapeHTML(report.id)}">${report.statusKey === "open" ? "Dispatch Truck" : "Resolve"}</button></td>
            </tr>
        `).join("") : `
            <tr><td colspan="7" style="text-align:center;padding:35px;color:#899287;font-size:9px">No matching reports found.</td></tr>
        `;
    }

    reportSearch?.addEventListener("input", renderReports);
    reportPriorityFilter?.addEventListener("change", renderReports);
    reportStatusFilter?.addEventListener("change", renderReports);

    reportTableBody?.addEventListener("click", event => {
        const button = event.target.closest("[data-report-action]");
        if (!button) return;
        const report = reports.find(item => item.id === button.dataset.reportId);
        if (!report) return;

        if (button.dataset.reportAction === "dispatch") {
            report.status = "Crew dispatched";
            report.statusKey = "in-progress";
            showToast(`${report.id}: truck dispatch initiated`);
        } else {
            report.status = "Resolved";
            report.statusKey = "resolved";
            showToast(`${report.id}: marked resolved`);
        }

        renderReports();
    });

    // ---------------------------------------------------------
    // ADD ROUTE MODAL
    // ---------------------------------------------------------
    function openModal(modal) {
        if (!modal) return;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        const firstInput = modal.querySelector("input, select, button");
        if (firstInput) setTimeout(() => firstInput.focus(), 50);
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    window.closeAddRouteModal = () => closeModal(addRouteModal);
    window.openAddRouteModal = () => openModal(addRouteModal);

    createRouteButton?.addEventListener("click", () => openModal(addRouteModal));
    routePlusButton?.addEventListener("click", () => openModal(addRouteModal));
    assignRouteFromOverview?.addEventListener("click", () => openModal(addRouteModal));

    document.querySelectorAll("[data-close-modal]").forEach(button => {
        button.addEventListener("click", () => {
            const target = document.getElementById(button.dataset.closeModal);
            closeModal(target);
        });
    });

    addRouteForm?.addEventListener("submit", event => {
        event.preventDefault();
        const data = new FormData(addRouteForm);
        const routeId = String(data.get("routeId") || "R-028").trim() || "R-028";
        const zone = String(data.get("zone") || "Central Zone • Ward 8");
        const vehicle = String(data.get("vehicle") || "Available vehicle").split(" - ")[0];
        const driver = String(data.get("driver") || "Available driver").split(" (")[0];

        routes.unshift({
            id: routeId,
            zone: zone.replace(" • ", " "),
            state: "STARTING",
            stateKey: "starting",
            vehicle,
            driver,
            progressText: "New route • 0 stops completed",
            action: "Dispatch"
        });

        renderActiveRoutes();
        closeModal(addRouteModal);
        addRouteForm.reset();
        showToast(`${routeId} successfully added and ready for dispatch`);
    });

    // ---------------------------------------------------------
    // GLOBAL SEARCH
    // ---------------------------------------------------------
    globalSearch?.addEventListener("input", () => {
        const query = globalSearch.value.trim().toLowerCase();
        if (!query) return;

        const routeHit = routes.some(route =>
            [route.id, route.zone, route.vehicle, route.driver].join(" ").toLowerCase().includes(query)
        );
        const vehicleHit = trucks.some(truck =>
            [truck.id, truck.driver, truck.route, truck.zone].join(" ").toLowerCase().includes(query)
        );
        const reportHit = reports.some(report =>
            [report.id, report.type, report.location, report.status].join(" ").toLowerCase().includes(query)
        );

        if (reportHit && !routeHit && !vehicleHit) {
            switchTab("citizen-reports");
            if (reportSearch) reportSearch.value = query;
            renderReports();
        } else if (routeHit && !vehicleHit) {
            switchTab("routes");
            showToast(`Route match found for “${globalSearch.value.trim()}”`);
        } else if (vehicleHit) {
            switchTab("vehicles-drivers");
            showToast(`Vehicle/driver match found for “${globalSearch.value.trim()}”`);
        }
    });

    // ---------------------------------------------------------
    // RESIZE
    // ---------------------------------------------------------
    window.addEventListener("resize", () => {
        if (window.innerWidth > 980) closeSidebar();
        setTimeout(() => {
            overviewMap?.invalidateSize();
            routeMapInstance?.invalidateSize();
        }, 120);
    });

    fetch("/api/auth/me", { credentials: "same-origin" })
        .then(async response => {
            if (!response.ok) throw new Error("Authentication required");
            return response.json();
        })
        .then(async result => {
            if (result.user.role !== "sanitary_inspector") {
                window.location.href = "/login";
                return;
            }
            const profileResponse = await fetch("/api/profile", { credentials: "same-origin" });
            if (!profileResponse.ok) return;
            const profileResult = await profileResponse.json();
            const profile = profileResult.profile || {};
            const name = profile.full_name || "Sanitary Inspector";
            const zone = profile.zone || "Central Zone";
            const nameElement = document.querySelector(".header-user-details strong");
            const zoneElement = document.querySelector(".header-user-details small");
            if (nameElement) nameElement.childNodes[0].textContent = `${name} `;
            if (zoneElement) zoneElement.textContent = zone;
        })
        .catch(() => {
            window.location.href = "/login";
        });

});

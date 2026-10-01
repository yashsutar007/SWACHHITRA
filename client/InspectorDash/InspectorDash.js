/* =========================================================
   SWACHHITRA
   SANITARY INSPECTOR DASHBOARD
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /*
     * No fake operational coordinates are used.
     * Maps fall back to a neutral India view until real database
     * coordinates are available.
     */
    const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
    const DEFAULT_MAP_ZOOM = 5;

    /* =========================================================
       DOM
    ========================================================= */

    const inspectorName =
        document.getElementById("inspectorName");

    const headerInspectorNameText =
        document.getElementById(
            "headerInspectorNameText"
        );

    const headerInspectorZone =
        document.getElementById(
            "headerInspectorZone"
        );

    const systemStatusText =
        document.getElementById(
            "systemStatusText"
        );

    const sidebar =
        document.getElementById("sidebar");

    const sidebarToggleButton =
        document.getElementById(
            "sidebarToggleButton"
        );

    const mobileMenuButton =
        document.getElementById(
            "mobileMenuButton"
        );

    const mobileBackdrop =
        document.getElementById(
            "mobileBackdrop"
        );

    const navButtons =
        document.querySelectorAll(
            "[data-tab]"
        );

    const panels =
        document.querySelectorAll(
            ".tab-panel"
        );

    const globalSearch =
        document.getElementById(
            "globalSearch"
        );

    const notificationButton =
        document.getElementById(
            "notificationButton"
        );

    const headerNotificationButton =
        document.getElementById(
            "headerNotificationButton"
        );
const notificationDrawer =
        document.getElementById(
            "notificationDrawer"
        );

    const closeNotificationDrawer =
        document.getElementById(
            "closeNotificationDrawer"
        );

    const markNotificationsRead =
        document.getElementById(
            "markNotificationsRead"
        );

    const notificationCount =
        document.getElementById(
            "notificationCount"
        );

    const notificationList =
        document.getElementById(
            "notificationList"
        );
const logoutButton =
        document.getElementById(
            "logoutButton"
        );

    const trackingMapElement =
        document.getElementById(
            "trackingMap"
        );

    const routeMapElement =
        document.getElementById(
            "routeMap"
        );

    const corridorButton =
        document.getElementById(
            "corridorButton"
        );

    const truckLayerButton =
        document.getElementById(
            "truckLayerButton"
        );

    const mapPlus =
        document.getElementById(
            "mapPlus"
        );

    const mapMinus =
        document.getElementById(
            "mapMinus"
        );
const activeRoutesList =
        document.getElementById(
            "activeRoutesList"
        );

    const vehiclePairings =
        document.getElementById(
            "vehiclePairings"
        );

    const driverRegistryList =
        document.getElementById(
            "driverRegistryList"
        );

    const driverRegistryStatus =
        document.getElementById(
            "driverRegistryStatus"
        );

    const addVehicleButton =
        document.getElementById(
            "addVehicleButton"
        );

    const addDriverButton =
        document.getElementById(
            "addDriverButton"
        );

    const vehicleModal =
        document.getElementById(
            "vehicleModal"
        );

    const vehicleModalTitle =
        document.getElementById(
            "vehicleModalTitle"
        );

    const vehicleForm =
        document.getElementById(
            "vehicleForm"
        );

    const driverModal =
        document.getElementById(
            "driverModal"
        );

    const driverModalTitle =
        document.getElementById(
            "driverModalTitle"
        );

    const driverForm =
        document.getElementById(
            "driverForm"
        );

    const driverZoneSelect =
        document.getElementById(
            "driverZoneSelect"
        );

    const driverWardSelect =
        document.getElementById(
            "driverWardSelect"
        );

    const driverStatusSelect =
        document.getElementById(
            "driverStatusSelect"
        );

    const driverStatusHelp =
        document.getElementById(
            "driverStatusHelp"
        );

    const reportSearch =
        document.getElementById(
            "reportSearch"
        );

    const reportPriorityFilter =
        document.getElementById(
            "reportPriorityFilter"
        );

    const reportStatusFilter =
        document.getElementById(
            "reportStatusFilter"
        );

    const reportTableBody =
        document.getElementById(
            "reportTableBody"
        );

    const addRouteModal =
        document.getElementById(
            "addRouteModal"
        );

    const addRouteForm =
        document.getElementById(
            "addRouteForm"
        );

    const createRouteButton =
        document.getElementById(
            "createRouteButton"
        );

    const routePlusButton =
        document.getElementById(
            "routePlusButton"
        );

    const assignRouteFromOverview =
        document.getElementById(
            "assignRouteFromOverview"
        );

    const editRouteModal =
        document.getElementById(
            "editRouteModal"
        );

    const editRouteForm =
        document.getElementById(
            "editRouteForm"
        );

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById(
            "toastMessage"
        );

    /* =========================================================
       DATA
    ========================================================= */

    let trucks = [];
    let routes = [];
    let reports = [];
    let drivers = [];
    let pairings = [];
    let notifications = [];
    let collections = [];
    let collectionSummary = {};
    let overviewData = {};
    let overviewScope = {};

    let overviewMap = null;
    let routeMap = null;

    const overviewMarkers = new Map();
    const routeMarkers = new Map();
    const routeLayers = [];
    const complaintLayers = [];

    let corridorsVisible = true;
    let trucksVisible = true;
    let toastTimer = null;

    /* =========================================================
       HELPERS
    ========================================================= */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showToast(message) {
        if (!toast || !toastMessage) {
            return;
        }

        toastMessage.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2600);
    }

    function getStatusLabel(status, delayMinutes = 0) {
        switch (status) {
            case "scheduled":
                return "ON SCHEDULE";

            case "starting":
                return "STARTING";

            case "active":
                return "ACTIVE";

            case "delayed":
                return delayMinutes
                    ? `DELAYED ${delayMinutes} MINS`
                    : "DELAYED";

            case "completed":
                return "COMPLETED";

            case "cancelled":
                return "CANCELLED";

            default:
                return String(
                    status || "UNKNOWN"
                ).toUpperCase();
        }
    }

    function getRouteStateKey(status) {
        switch (status) {
            case "scheduled":
                return "schedule";

            case "starting":
                return "starting";

            case "active":
                return "active";

            case "delayed":
                return "delayed";

            default:
                return status || "unknown";
        }
    }

    function getComplaintFilterKey(status) {
        switch (status) {
            case "open":
                return "open";

            case "in_progress":
                return "in-progress";

            case "resolved":
                return "resolved";

            default:
                return status || "unknown";
        }
    }

    function routeProgress(route) {
        const total =
            Number(route.totalStops || 0);

        const completed =
            Number(route.completedStops || 0);

        if (!total) {
            return "0 stops scheduled";
        }

        const percent = Math.min(
            100,
            Math.round(
                (completed / total) * 100
            )
        );

        return `${completed}/${total} stops (${percent}%)`;
    }

    function getMapStatusKey(vehicle) {
        return (
            vehicle.statusKey ||
            String(
                vehicle.status || ""
            )
                .toLowerCase()
                .replace(/\s+/g, "_")
        );
    }

    function humanizeEnum(value) {
        return String(value || "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, match =>
                match.toUpperCase()
            );
    }

    function makeInitials(name) {
        return String(name || "Driver")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part =>
                part.charAt(0).toUpperCase()
            )
            .join("") || "DR";
    }

    /*
     * Shared UI/data helpers. These are intentionally kept local to
     * the dashboard so the page has no dependency on another script.
     */

    function formatTons(value) {
        const tons = Number(value);

        if (!Number.isFinite(tons)) {
            return "0.00 Tons";
        }

        return `${tons.toFixed(2)} Tons`;
    }

    function formatDateTime(value) {
        if (!value) {
            return "—";
        }

        const raw = String(value);
        const normalized =
            raw.includes("T")
                ? raw
                : raw.replace(" ", "T");

        const date = new Date(normalized);

        if (Number.isNaN(date.getTime())) {
            return raw;
        }

        return new Intl.DateTimeFormat(
            undefined,
            {
                dateStyle: "medium",
                timeStyle: "short"
            }
        ).format(date);
    }

    function setSelectOptions(
        select,
        options = [],
        placeholder = "Select",
        selectedValue = ""
    ) {
        if (!select) {
            return;
        }

        const hasSelectedValue =
            selectedValue !== null &&
            selectedValue !== undefined &&
            String(selectedValue) !== "";

        select.innerHTML = "";

        const placeholderOption =
            document.createElement("option");

        placeholderOption.value = "";
        placeholderOption.textContent =
            placeholder;
        placeholderOption.selected =
            !hasSelectedValue;

        select.appendChild(
            placeholderOption
        );

        (Array.isArray(options)
            ? options
            : []
        ).forEach(option => {
            const item =
                option !== null &&
                typeof option === "object"
                    ? option
                    : {
                        value: option,
                        label: option
                    };

            const optionElement =
                document.createElement("option");

            const value =
                item.value === null ||
                item.value === undefined
                    ? ""
                    : String(item.value);

            optionElement.value = value;
            optionElement.textContent =
                item.label === null ||
                item.label === undefined
                    ? value
                    : String(item.label);

            if (
                hasSelectedValue &&
                value === String(selectedValue)
            ) {
                optionElement.selected = true;
            }

            select.appendChild(
                optionElement
            );
        });
    }


function normalizeRoute(raw) {
    const zone = raw?.zone || {};
    const ward = raw?.ward || {};
    const vehicle = raw?.vehicle || null;
    const driver = raw?.driver || null;

    return {
        databaseId:
            Number(
                raw?.databaseId ??
                raw?.id ??
                0
            ),

        id: raw?.id || "",
        routeName: raw?.routeName || "",
        status: raw?.status || "scheduled",

        zone,
        ward,

        zoneLabel:
            [
                zone.name,
                ward.number !== null &&
                ward.number !== undefined
                    ? `Ward ${ward.number}`
                    : ward.name
            ]
                .filter(Boolean)
                .join(" • ") ||
            "Assigned area",

        totalStops:
            Number(raw?.totalStops || 0),

        completedStops:
            Number(raw?.completedStops || 0),

        delayMinutes:
            Number(raw?.delayMinutes || 0),

        vehicle,
        driver,

        vehicleLabel:
            vehicle?.number ||
            "Unassigned",

        driverLabel:
            driver?.name ||
            "Unassigned",

        startsAt:
            raw?.scheduledStartAt ||
            null,

        endsAt:
            raw?.scheduledEndAt ||
            null,

        estimatedDistanceKm:
            raw?.estimatedDistanceKm ??
            null,

        estimatedDurationMinutes:
            raw?.estimatedDurationMinutes ??
            null,

        assignment:
            raw?.assignment ||
            null,

        startPoint:
            raw?.startPoint ||
            null,

        endPoint:
            raw?.endPoint ||
            null,

        stops:
            Array.isArray(raw?.stops)
                ? raw.stops
                : []
    };
}


function normalizeVehicle(raw) {
    const assignment =
        raw?.assignment ||
        null;

    const location =
        raw?.location ||
        null;

    const status =
        raw?.status ||
        "available";

    const currentLoadTons =
        raw?.currentLoadTons === null ||
        raw?.currentLoadTons === undefined
            ? 0
            : Number(
                raw.currentLoadTons
            );

    const capacityTons =
        raw?.capacityTons === null ||
        raw?.capacityTons === undefined
            ? 0
            : Number(
                raw.capacityTons
            );

    return {
        databaseId:
            Number(
                raw?.databaseId || 0
            ),

        id:
            raw?.vehicleNumber ||
            "",

        registrationNumber:
            raw?.registrationNumber ||
            "",

        type:
            raw?.type ||
            "Vehicle",

        make:
            raw?.make ||
            "",

        imagePath:
            raw?.imagePath ||
            "",

        capacityTons,
        currentLoadTons,

        fill:
            Number(
                raw?.currentLoadPercent || 0
            ),

        etaMinutes:
            raw?.etaMinutes === null ||
            raw?.etaMinutes === undefined
                ? null
                : Number(
                    raw.etaMinutes
                ),

        status,

        statusKey:
            status === "en_route"
                ? "enroute"
                : status,

        statusLabel:
            humanizeEnum(status),

        location,

        position:
            location &&
            Number.isFinite(
                Number(
                    location.latitude
                )
            ) &&
            Number.isFinite(
                Number(
                    location.longitude
                )
            )
                ? [
                    Number(
                        location.latitude
                    ),
                    Number(
                        location.longitude
                    )
                ]
                : null,

        assignment,

        driver:
            assignment?.driver?.name ||
            "Unassigned",

        route:
            assignment?.routeCode ||
            "Unassigned",

        zone:
            assignment?.zone?.name ||
            "Unassigned",

        ward:
            assignment?.ward?.name ||
            ""
    };
}


function normalizeDriver(raw) {
    return {
        databaseId:
            Number(
                raw?.databaseId || 0
            ),
        employeeId:
            raw?.employeeId || "",
        fullName:
            raw?.fullName || "Unknown Driver",
        mobileNumber:
            raw?.mobileNumber || "—",
        email:
            raw?.email || "—",
        licenseNumber:
            raw?.licenseNumber || "—",
        licenseType:
            raw?.licenseType || "—",
        status:
            raw?.status || "available",
        zone:
            raw?.zone || null,
        ward:
            raw?.ward || null
    };
}

function normalizeCollection(raw) {
    return {
        id:
            Number(
                raw?.id || 0
            ),

        routeCode:
            raw?.route?.code ||
            "Unknown Route",

        routeName:
            raw?.route?.name ||
            "",

        ward:
            raw?.ward?.name ||
            "Unknown Ward",

        wardNumber:
            raw?.ward?.number ??
            null,

        vehicleNumber:
            raw?.vehicleNumber ||
            "Unassigned",

        driverName:
            raw?.driverName ||
            "Unassigned",

        wasteTons:
            Number(
                raw?.wasteTons || 0
            ),

        status:
            raw?.status ||
            "unknown",

        notes:
            raw?.notes ||
            "",

        collectedAt:
            raw?.collectedAt ||
            null,

        collectionDate:
            raw?.collectionDate ||
            null,

        createdAt:
            raw?.createdAt ||
            null
    };
}

    function normalizeAssignment(raw) {
        const driver = raw?.driver || {};
        const vehicle = raw?.vehicle || {};
        const route = raw?.route || {};
        const ward = raw?.ward || {};
        const status = raw?.status ||
            "assigned";

        const loadTons =
            vehicle.currentLoadTons;
        const capacityTons =
            vehicle.capacityTons;
        const loadPercent =
            Number(vehicle.currentLoadPercent || 0);

        return {
            id: raw?.code || raw?.id || "",
            duty: `DUTY: ${humanizeEnum(status).toUpperCase()}`,
            dutyKey: status === "assigned"
                ? "active"
                : status,
            initials: makeInitials(
                driver.name
            ),
            driver:
                driver.name || "Unknown Driver",
            employee: driver.employeeId
                ? `Employee ID: ${driver.employeeId}`
                : "Employee ID: —",
            mobile:
                driver.mobileNumber || "—",
            email: driver.email || "—",
            dl: driver.licenseType ||
                driver.licenseNumber ||
                "—",
            truck:
                vehicle.number || "Unassigned",
            type: vehicle.type || "Vehicle",
            plate:
                vehicle.registrationNumber || "—",
            make: vehicle.make || "—",
            load:
                loadTons !== null &&
                loadTons !== undefined &&
                capacityTons !== null &&
                capacityTons !== undefined
                    ? `${loadPercent}% (${Number(loadTons).toFixed(2)} / ${Number(capacityTons).toFixed(2)} Tons)`
                    : `${loadPercent}%`,
            route:
                route.code
                    ? `${route.code}${ward.number ? ` (Ward ${ward.number})` : ""}`
                    : "Unassigned"
        };
    }

    function normalizeComplaint(raw) {
        const status = raw?.status || "open";
        const vehicle =
            raw?.assignedVehicle || null;
        const priority = raw?.priority || "medium";

        let statusLabel;
        if (status === "open") {
            statusLabel = vehicle?.number
                ? `Assigned to ${vehicle.number}`
                : "Open";
        } else if (status === "in_progress") {
            statusLabel = "Crew en-route";
        } else if (status === "resolved") {
            statusLabel = "Resolved";
        } else if (status === "cancelled") {
            statusLabel = "Cancelled";
        } else {
            statusLabel =
                humanizeEnum(status);
        }

        return {
            databaseId: raw?.databaseId ?? null,
            id: raw?.id || "",
            type:
                raw?.type || "Citizen Report",
            location:
                raw?.location || "Unknown location",
            time: timeAgo(raw?.reportedAt),
            priority,
            priorityKey:
                priority === "critical"
                    ? "high"
                    : priority,
            status: statusLabel,
            statusKey:
                getComplaintFilterKey(status),
            rawStatus: status,
            latitude:
                raw?.locationCoordinates?.latitude ?? null,
            longitude:
                raw?.locationCoordinates?.longitude ?? null,
            wardNumber:
                raw?.ward?.number ?? null,
            assignedVehicle: vehicle?.number ||
                null,
            assignedDriver:
                raw?.assignedDriver?.name || null
        };
    }

    function normalizeNotification(raw) {
        return {
            id: raw?.id ?? null,
            title: raw?.title || "Notification",
            message: raw?.message || "",
            type: raw?.type || "system",
            priority: raw?.priority || "normal",
            is_read: Boolean(raw?.isRead),
            created_at: raw?.createdAt || null,
            read_at: raw?.readAt || null,
            relatedRouteCode:
                raw?.relatedRouteCode || null,
            relatedComplaintCode:
                raw?.relatedComplaintCode || null
        };
    }

    /* =========================================================
       API
    ========================================================= */

    async function apiRequest(
        url,
        options = {}
    ) {
        const response =
            await fetch(
                url,
                {
                    credentials:
                        "same-origin",
                    ...options,
                    headers: {
                        ...(options.headers || {}),
                        ...(options.body
                            ? {
                                "Content-Type":
                                    "application/json"
                            }
                            : {})
                    }
                }
            );

        let result = {};

        try {
            result =
                await response.json();
        } catch {
            result = {};
        }

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            window.location.href =
                "/login";

            throw new Error(
                "Authentication required."
            );
        }

        if (
            !response.ok ||
            result.success === false
        ) {
            throw new Error(
                result.message ||
                "Request failed."
            );
        }

        return result;
    }

    /* =========================================================
       PROFILE
    ========================================================= */

    async function loadInspectorProfile() {
        try {
            const result =
                await apiRequest(
                    "/api/profile"
                );

            const profile =
                result.profile || {};
            const scope = result.scope || {};
            const zone = scope.zone?.name ||
                "Assigned Area";
            const ward = scope.ward?.name || null;
            const scopeLabel = ward
                ? `${zone} • ${ward}`
                : zone;

            const name =
                profile.full_name ||
                "Sanitary Inspector";

            if (inspectorName) {
                inspectorName.textContent =
                    name;
            }

            if (headerInspectorNameText) {
                headerInspectorNameText.textContent =
                    name;
            }

            const headerAvatar =
                document.querySelector(
                    ".header-avatar"
                );

            if (headerAvatar) {
                headerAvatar.textContent =
                    makeInitials(name);
            }

            if (headerInspectorZone) {
                headerInspectorZone.textContent =
                    scopeLabel;
            }
        } catch (error) {
            console.error(
                "Unable to load inspector profile:",
                error
            );
        }
    }

    /* =========================================================
       LOAD DASHBOARD DATA
    ========================================================= */


async function loadDashboardData() {
    const requests = [
        ["overview", "/api/inspector/overview"],
        ["routes", "/api/inspector/routes"],
        ["vehicles", "/api/inspector/vehicles"],
        ["drivers", "/api/inspector/drivers"],
        ["assignments", "/api/inspector/assignments"],
        ["collections", "/api/inspector/collections"],
        ["complaints", "/api/inspector/complaints"],
        ["notifications", "/api/inspector/notifications"]
    ];

    const results =
        await Promise.allSettled(
            requests.map(([, url]) =>
                apiRequest(url)
            )
        );

    const failed = [];

    results.forEach(
        (result, index) => {
            const key =
                requests[index][0];

            if (
                result.status ===
                "fulfilled"
            ) {
                const data =
                    result.value;

                switch (key) {
                    case "overview":
                        overviewData =
                            data.overview ||
                            {};

                        overviewScope =
                            data.scope ||
                            {};
                        break;

                    case "routes":
                        routes =
                            (data.routes || [])
                                .map(
                                    normalizeRoute
                                );
                        break;

                    case "vehicles":
                        trucks =
                            (data.vehicles || [])
                                .map(
                                    normalizeVehicle
                                );
                        break;

                    case "drivers":
                        drivers =
                            (data.drivers || [])
                                .map(
                                    normalizeDriver
                                );
                        break;

                    case "assignments":
                        pairings =
                            (data.assignments || [])
                                .map(
                                    normalizeAssignment
                                );
                        break;

                    case "collections":
                        collectionSummary =
                            data.summary ||
                            {};

                        collections =
                            (data.collections || [])
                                .map(
                                    normalizeCollection
                                );
                        break;

                    case "complaints":
                        reports =
                            (data.complaints || [])
                                .map(
                                    normalizeComplaint
                                );
                        break;

                    case "notifications":
                        notifications =
                            (data.notifications || [])
                                .map(
                                    normalizeNotification
                                );
                        break;

                    default:
                        break;
                }
            } else {
                failed.push(key);

                console.error(
                    `Failed to load ${key}:`,
                    result.reason
                );
            }
        }
    );

    renderActiveRoutes();
    renderVehiclePairings();
    renderDriverRegistry();
    renderCollections();
    renderReports();
    renderNotifications();

    if (systemStatusText) {
        systemStatusText.textContent =
            failed.length
                ? "Partial data connection"
                : "System connected";
    }

    updateOverviewLabels();
    updateOverviewKpis();
    updateCollectionOperations();

    refreshMaps();

    if (failed.length) {
        showToast(
            `Unable to load: ${failed.join(", ")}`
        );
    }
}

    function updateOverviewLabels() {
        const assignedZone =
            document.getElementById(
                "assignedZoneText"
            );

        const currentZoneText =
            document.getElementById(
                "currentZoneText"
            );

        const mapSubtitle =
            document.querySelector(
                ".map-title-group > div > span"
            );

        const mapFooter =
            document.querySelector(
                ".map-footer > span"
            );

        const zoneName =
            overviewScope.zoneName ||
            "Assigned Area";

        const scopedWardNumber =
            overviewScope.wardNumber;

        const wardNumbers = [
            ...new Set(
                routes
                    .map(
                        route =>
                            route.wardNumber
                    )
                    .filter(
                        value =>
                            value !==
                                undefined &&
                            value !==
                                null
                    )
            )
        ];

        const effectiveWardNumbers =
            scopedWardNumber !== null &&
            scopedWardNumber !== undefined
                ? [scopedWardNumber]
                : wardNumbers;

        const wardText =
            effectiveWardNumbers.length
                ? `Ward${effectiveWardNumbers.length > 1 ? "s" : ""} ${effectiveWardNumbers.join(", ")}`
                : "Assigned wards";

        const zoneText =
            wardNumbers.length
                ? `${zoneName} • ${wardText}`
                : zoneName;

        if (assignedZone) {
            assignedZone.textContent =
                zoneText;
        }

        if (currentZoneText) {
            currentZoneText.textContent =
                zoneText;
        }

        if (mapSubtitle) {
            mapSubtitle.textContent =
                `${zoneName} / ${wardText}`;
        }

        if (mapFooter) {
            mapFooter.innerHTML =
                `Currently showing <strong>${escapeHTML(
                    wardText
                )}</strong>`;
        }
    }

    function updateOverviewKpis() {
        const cards =
            document.querySelectorAll(
                ".kpi-card"
            );

        if (!cards.length) {
            return;
        }

        const activeRoutes =
            Number(
                overviewData.activeRoutes ||
                0
            );

        const scheduledRoutes =
            Number(
                overviewData.scheduledRoutes ||
                0
            );

        const delayedRoutes =
            Number(
                overviewData.delayedRoutes ||
                0
            );

        const startingRoutes =
            Number(
                overviewData.startingRoutes ||
                0
            );

        const totalVehicles =
            Number(
                overviewData.totalVehicles ||
                0
            );

        const deployedVehicles =
            Number(
                overviewData.deployedVehicles ||
                0
            );

        const maintenanceVehicles =
            Number(
                overviewData.maintenanceVehicles ||
                0
            );

        const totalComplaints =
            Number(
                overviewData.totalComplaints ||
                0
            );

        const highPriorityComplaints =
            Number(
                overviewData.highPriorityComplaints ||
                0
            );

        const openComplaints =
            Number(
                overviewData.openComplaints ||
                0
            );

        const resolvedComplaints =
            Number(
                overviewData.resolvedComplaints ||
                0
            );

        const routeCard = cards[0];

        if (routeCard) {
            const number =
                routeCard.querySelector(
                    ".kpi-number"
                );

            const pill =
                routeCard.querySelector(
                    ".status-pill"
                );

            const description =
                routeCard.querySelector(
                    ".kpi-description"
                );

            const footer =
                routeCard.querySelector(
                    ".kpi-footer span"
                );

            if (number) {
                number.textContent =
                    String(activeRoutes);
            }

            if (pill) {
                pill.textContent =
                    "Live Database";
            }

            if (description) {
                description.innerHTML =
                    `<strong>${scheduledRoutes}</strong> on schedule, ` +
                    `<span class="orange-text">${delayedRoutes} delayed</span>, ` +
                    `${startingRoutes} starting`;
            }

            if (footer) {
                footer.textContent =
                    "Route data from MySQL";
            }
        }

        const vehicleCard = cards[1];

        if (vehicleCard) {
            const deployedPercent =
                totalVehicles > 0
                    ? Math.round(
                        (deployedVehicles /
                            totalVehicles) *
                        100
                    )
                    : 0;

            const number =
                vehicleCard.querySelector(
                    ".kpi-number"
                );

            const pill =
                vehicleCard.querySelector(
                    ".status-pill"
                );

            const description =
                vehicleCard.querySelector(
                    ".kpi-description"
                );

            const footer =
                vehicleCard.querySelector(
                    ".kpi-footer span"
                );

            if (number) {
                number.textContent =
                    `${deployedVehicles} / ${totalVehicles}`;
            }

            if (pill) {
                pill.textContent =
                    `${deployedPercent}% Deployed`;
            }

            if (description) {
                description.textContent =
                    `${deployedVehicles} deployed, ` +
                    `${maintenanceVehicles} under maintenance`;
            }

            if (footer) {
                footer.textContent =
                    "Fleet data from MySQL";
            }
        }

        const complaintCard = cards[2];

        if (complaintCard) {
            const number =
                complaintCard.querySelector(
                    ".kpi-number"
                );

            const pill =
                complaintCard.querySelector(
                    ".status-pill"
                );

            const description =
                complaintCard.querySelector(
                    ".kpi-description"
                );

            const footer =
                complaintCard.querySelector(
                    ".kpi-footer span"
                );

            if (number) {
                number.textContent =
                    `${totalComplaints} Reports`;
            }

            if (pill) {
                pill.textContent =
                    `${highPriorityComplaints} High Priority`;
            }

            if (description) {
                description.textContent =
                    `${openComplaints} currently open or in progress`;
            }

            if (footer) {
                footer.textContent =
                    "Complaint data from MySQL";
            }
        }

        const routeNavCount =
            document.getElementById(
                "routeNavCount"
            );

        const fleetNavCount =
            document.getElementById(
                "fleetNavCount"
            );

        const reportNavCount =
            document.getElementById(
                "reportNavCount"
            );

        const topologyStatus =
            document.getElementById(
                "topologyStatus"
            );

        const deploymentBadge =
            document.getElementById(
                "deploymentBadge"
            );

        const activeComplaintBadge =
            document.getElementById(
                "activeComplaintBadge"
            );

        const resolvedComplaintsValue =
            document.getElementById(
                "resolvedComplaintsValue"
            );

        const fleetUtilizationValue =
            document.getElementById(
                "fleetUtilizationValue"
            );

        if (routeNavCount) {
            routeNavCount.textContent =
                `${activeRoutes} Live`;
        }

        if (fleetNavCount) {
            fleetNavCount.textContent =
                `${deployedVehicles}/${totalVehicles}`;
        }

        if (reportNavCount) {
            reportNavCount.textContent =
                String(openComplaints);
        }

        if (topologyStatus) {
            topologyStatus.textContent =
                `${activeRoutes} active path${
                    activeRoutes === 1
                        ? ""
                        : "s"
                }`;
        }

        if (deploymentBadge) {
            deploymentBadge.textContent =
                `${deployedVehicles} Deployed • ${
                    Math.max(
                        0,
                        totalVehicles -
                        deployedVehicles
                    )
                } Available`;
        }

        if (activeComplaintBadge) {
            activeComplaintBadge.textContent =
                `${openComplaints} Active Grievance${
                    openComplaints === 1
                        ? ""
                        : "s"
                }`;
        }

        if (resolvedComplaintsValue) {
            resolvedComplaintsValue.textContent =
                `${resolvedComplaints} / ${totalComplaints}`;
        }

        if (fleetUtilizationValue) {
            const utilization =
                totalVehicles > 0
                    ? Math.round(
                        (deployedVehicles /
                            totalVehicles) *
                        100
                    )
                    : 0;

            fleetUtilizationValue.textContent =
                `${utilization}%`;
        }

        if (truckLayerButton) {
            truckLayerButton.textContent =
                `Trucks (${totalVehicles})`;
        }
    }

    /* =========================================================
       COLLECTION OPERATIONS
    ========================================================= */

    function updateCollectionOperations() {
        const cards =
            document.querySelectorAll(
                ".ops-card"
            );

        const analytics =
            document.querySelectorAll(
                ".analytics-strip > div"
            );

        const totalWaste =
            Number(
                overviewData.todayWasteTons ||
                0
            );

        const totalRecords =
            Number(
                collectionSummary.totalRecords ||
                0
            );

        const completedRecords =
            Number(
                collectionSummary.completedRecords ||
                0
            );

        const activeRecords =
            Number(
                collectionSummary.activeRecords ||
                0
            );

        const totalComplaints =
            Number(
                overviewData.totalComplaints ||
                0
            );

        const resolvedComplaints =
            Number(
                overviewData.resolvedComplaints ||
                0
            );

        const routeTotal =
            routes.reduce(
                (sum, route) =>
                    sum +
                    Number(
                        route.totalStops ||
                        0
                    ),
                0
            );

        const routeCompleted =
            routes.reduce(
                (sum, route) =>
                    sum +
                    Number(
                        route.completedStops ||
                        0
                    ),
                0
            );

        const routeCompletion =
            routeTotal > 0
                ? Math.round(
                    (routeCompleted /
                        routeTotal) *
                    100
                )
                : 0;

        const totalVehicles =
            Number(
                overviewData.totalVehicles ||
                0
            );

        const deployedVehicles =
            Number(
                overviewData.deployedVehicles ||
                0
            );

        const fleetUtilization =
            totalVehicles > 0
                ? Math.round(
                    (deployedVehicles /
                        totalVehicles) *
                    100
                )
                : 0;

        if (cards[0]) {
            cards[0].querySelector(
                "span"
            ).textContent =
                "Total Waste Collected";

            cards[0].querySelector(
                "strong"
            ).textContent =
                `${totalWaste.toFixed(1)} Tons`;

            cards[0].querySelector(
                "p"
            ).textContent =
                "Today's collection records from MySQL";
        }

        if (cards[1]) {
            cards[1].querySelector(
                "span"
            ).textContent =
                "Collection Records";

            cards[1].querySelector(
                "strong"
            ).textContent =
                String(totalRecords);

            cards[1].querySelector(
                "p"
            ).textContent =
                `${completedRecords} completed, ${activeRecords} in progress`;
        }

        if (cards[2]) {
            cards[2].querySelector(
                "span"
            ).textContent =
                "Route Completion";

            cards[2].querySelector(
                "strong"
            ).textContent =
                `${routeCompletion}%`;

            cards[2].querySelector(
                "p"
            ).textContent =
                "Calculated from route stop progress";
        }

        const analyticsLabels = [
            "Route Completion",
            "Fleet Utilization",
            "Today's Waste",
            "Resolved Complaints"
        ];

        const analyticsValues = [
            `${routeCompletion}%`,
            `${fleetUtilization}%`,
            `${totalWaste.toFixed(1)} T`,
            `${resolvedComplaints} / ${totalComplaints}`
        ];

        analytics.forEach(
            (item, index) => {
                const label =
                    item.querySelector(
                        "span"
                    );

                const value =
                    item.querySelector(
                        "strong"
                    );

                if (label) {
                    label.textContent =
                        analyticsLabels[index];
                }

                if (value) {
                    value.textContent =
                        analyticsValues[index];
                }
            }
        );

        const todayWasteValue =
            document.getElementById(
                "todayWasteValue"
            );

        const summaryShiftBadge =
            document.getElementById(
                "summaryShiftBadge"
            );

        const routeProgressList =
            document.getElementById(
                "routeProgressList"
            );

        if (todayWasteValue) {
            todayWasteValue.textContent =
                `${totalWaste.toFixed(1)} Tons`;
        }

        if (summaryShiftBadge) {
            summaryShiftBadge.textContent =
                `${routeCompletion}% complete`;
        }

        if (routeProgressList) {
            const visibleRoutes =
                routes.filter(
                    route =>
                        route.status !==
                        "cancelled"
                );

            if (!visibleRoutes.length) {
                routeProgressList.innerHTML =
                    `<div class="summary-empty">No route data available.</div>`;
            } else {
                routeProgressList.innerHTML =
                    visibleRoutes
                        .map(route => {
                            const total =
                                Number(
                                    route.totalStops ||
                                    0
                                );

                            const completed =
                                total > 0
                                    ? Math.min(
                                        total,
                                        Number(
                                            route.completedStops ||
                                            0
                                        )
                                    )
                                    : 0;

                            const percent =
                                total > 0
                                    ? Math.round(
                                        (completed /
                                            total) *
                                        100
                                    )
                                    : 0;

                            const delayed =
                                route.status ===
                                "delayed";

                            return `
                                <div class="route-progress-item ${
                                    delayed
                                        ? "delayed"
                                        : ""
                                }">
                                    <span>
                                        ${escapeHTML(
                                            route.id
                                        )}
                                        ·
                                        ${escapeHTML(
                                            route.zone
                                        )}
                                    </span>

                                    <strong>
                                        ${percent}%
                                    </strong>

                                    <div>
                                        <span style="width:${percent}%"></span>
                                    </div>
                                </div>
                            `;
                        })
                        .join("");
            }
        }
    }


function renderCollections() {
    const container =
        document.getElementById(
            "collectionRecordsList"
        );

    const statusElement =
        document.getElementById(
            "collectionRecordsStatus"
        );

    if (!container) {
        return;
    }

    if (!collections.length) {
        container.innerHTML =
            `<div class="summary-empty">No collection records found for the current operational scope.</div>`;

        if (statusElement) {
            statusElement.textContent =
                "0 records";
        }

        return;
    }

    if (statusElement) {
        statusElement.textContent =
            `${collections.length} record${
                collections.length === 1
                    ? ""
                    : "s"
            }`;
    }

    container.innerHTML =
        collections
            .slice(0, 50)
            .map(
                (collection) => `
                    <article class="collection-record-card">

                        <div class="collection-record-main">

                            <div class="collection-record-title">
                                ${escapeHTML(
                                    collection.routeCode
                                )}
                                ${
                                    collection.routeName
                                        ? ` · ${escapeHTML(
                                            collection.routeName
                                        )}`
                                        : ""
                                }
                            </div>

                            <div class="collection-record-meta">

                                <span>
                                    ${escapeHTML(
                                        collection.wardNumber !==
                                            null &&
                                        collection.wardNumber !==
                                            undefined
                                            ? `Ward ${collection.wardNumber}`
                                            : collection.ward
                                    )}
                                </span>

                                <span>
                                    Vehicle:
                                    ${escapeHTML(
                                        collection.vehicleNumber
                                    )}
                                </span>

                                <span>
                                    Driver:
                                    ${escapeHTML(
                                        collection.driverName
                                    )}
                                </span>

                                <span>
                                    ${
                                        collection.collectedAt
                                            ? escapeHTML(
                                                formatDateTime(
                                                    collection.collectedAt
                                                )
                                            )
                                            : collection.collectionDate
                                                ? escapeHTML(
                                                    String(
                                                        collection.collectionDate
                                                    )
                                                )
                                                : "Date —"
                                    }
                                </span>

                            </div>

                        </div>

                        <div class="collection-record-value">
                            ${formatTons(
                                collection.wasteTons
                            )}
                        </div>

                        <span class="collection-record-status ${
                            collection.status ===
                            "collected"
                                ? "collected"
                                : collection.status ===
                                  "in_progress"
                                    ? "in-progress"
                                    : "pending"
                        }">
                            ${escapeHTML(
                                humanizeEnum(
                                    collection.status
                                )
                            )}
                        </span>

                    </article>
                `
            )
            .join("");
}

    /* =========================================================
       NOTIFICATIONS
    ========================================================= */

    function renderNotifications() {
        if (!notificationList) {
            return;
        }

        if (!notifications.length) {
            notificationList.innerHTML = `
                <div class="summary-empty">
                    No notifications.
                </div>
            `;

            if (notificationCount) {
                notificationCount.textContent =
                    "0";
            }

            return;
        }

        const unreadCount =
            notifications.filter(
                item =>
                    !item.is_read
            ).length;

        if (notificationCount) {
            notificationCount.textContent =
                String(unreadCount);
        }

        const dot =
            headerNotificationButton?.querySelector(
                "i"
            );

        if (dot) {
            dot.style.display =
                unreadCount > 0
                    ? ""
                    : "none";
        }

        notificationList.innerHTML =
            notifications
                .map(notification => {
                    const warning =
                        notification.priority ===
                            "high" ||
                        notification.priority ===
                            "critical";

                    return `
                        <article class="notification-card ${
                            warning
                                ? "warning"
                                : ""
                        }">
                            <span></span>
                            <div>
                                <strong>
                                    ${escapeHTML(
                                        notification.title
                                    )}
                                </strong>
                                <p>
                                    ${escapeHTML(
                                        notification.message
                                    )}
                                </p>
                                <small>
                                    ${escapeHTML(
                                        timeAgo(
                                            notification.created_at
                                        )
                                    )}
                                </small>
                            </div>
                        </article>
                    `;
                })
                .join("");
    }

    function timeAgo(value) {
        if (!value) {
            return "";
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "";
        }

        const seconds =
            Math.max(
                0,
                Math.floor(
                    (Date.now() -
                        date.getTime()) /
                    1000
                )
            );

        if (seconds < 60) {
            return `${seconds} sec ago`;
        }

        const minutes =
            Math.floor(
                seconds / 60
            );

        if (minutes < 60) {
            return `${minutes} min ago`;
        }

        const hours =
            Math.floor(
                minutes / 60
            );

        if (hours < 24) {
            return `${hours} hr ago`;
        }

        const days =
            Math.floor(
                hours / 24
            );

        return `${days} day${
            days === 1 ? "" : "s"
        } ago`;
    }

    /* =========================================================
       ROUTE FORM DATA
    ========================================================= */


async function loadRouteFormOptions() {
    const zoneSelect =
        document.getElementById(
            "routeZoneSelect"
        );

    const wardSelect =
        document.getElementById(
            "routeWardSelect"
        );

    const vehicleSelect =
        document.getElementById(
            "routeVehicleSelect"
        );

    const driverSelect =
        document.getElementById(
            "routeDriverSelect"
        );

    if (
        !zoneSelect ||
        !wardSelect ||
        !vehicleSelect ||
        !driverSelect
    ) {
        return;
    }

    const [
        zonesResult,
        wardsResult,
        vehiclesResult,
        driversResult
    ] = await Promise.all([
        apiRequest(
            "/api/inspector/zones"
        ),
        apiRequest(
            "/api/inspector/wards"
        ),
        apiRequest(
            "/api/inspector/vehicles"
        ),
        apiRequest(
            "/api/inspector/drivers"
        )
    ]);

    const zones =
        zonesResult.zones ||
        [];

    const wards =
        wardsResult.wards ||
        [];

    const availableVehicles =
        (vehiclesResult.vehicles || [])
            .filter(
                (vehicle) =>
                    vehicle.status ===
                        "available" &&
                    !vehicle.assignment
            );

    const availableDrivers =
        (driversResult.drivers || [])
            .filter(
                (driver) =>
                    driver.status ===
                    "available"
            );

    setSelectOptions(
        zoneSelect,
        zones.map(
            (zone) => ({
                value:
                    zone.id,
                label:
                    `${zone.code} - ${zone.name}`
            })
        ),
        "Select Zone"
    );

    setSelectOptions(
        wardSelect,
        [],
        "Select Ward"
    );

    setSelectOptions(
        vehicleSelect,
        availableVehicles.map(
            (vehicle) => ({
                value:
                    vehicle.databaseId,
                label:
                    `${vehicle.vehicleNumber} (${
                        vehicle.registrationNumber ||
                        "No plate"
                    })`
            })
        ),
        "No vehicle"
    );

    setSelectOptions(
        driverSelect,
        availableDrivers.map(
            (driver) => ({
                value:
                    driver.databaseId,
                label:
                    `${driver.fullName} (${
                        driver.employeeId ||
                        "No employee ID"
                    })`
            })
        ),
        "No driver"
    );

    zoneSelect.onchange =
        async () => {
            const zoneId =
                Number(
                    zoneSelect.value
                );

            if (!zoneId) {
                setSelectOptions(
                    wardSelect,
                    [],
                    "Select Ward"
                );
                return;
            }

            try {
                const result =
                    await apiRequest(
                        `/api/inspector/wards?zone_id=${encodeURIComponent(
                            zoneId
                        )}`
                    );

                setSelectOptions(
                    wardSelect,
                    (result.wards || [])
                        .map(
                            (ward) => ({
                                value:
                                    ward.id,
                                label:
                                    `Ward ${ward.number} - ${ward.name}`
                            })
                        ),
                    "Select Ward"
                );
            } catch (error) {
                showToast(
                    error.message ||
                    "Unable to load wards."
                );
            }
        };

    if (wards.length === 1) {
        setSelectOptions(
            wardSelect,
            wards.map(
                (ward) => ({
                    value:
                        ward.id,
                    label:
                        `Ward ${ward.number} - ${ward.name}`
                })
            ),
            "Select Ward"
        );
    }
}

    function switchTab(tabId) {
        panels.forEach(panel => {
            panel.classList.toggle(
                "active",
                panel.id ===
                    `panel-${tabId}`
            );
        });

        document
            .querySelectorAll(
                ".navigation-item[data-tab]"
            )
            .forEach(button => {
                button.classList.toggle(
                    "active",
                    button.dataset.tab ===
                        tabId
                );
            });

        if (
            window.innerWidth <= 980
        ) {
            closeSidebar();
        }

        if (
            tabId === "overview"
        ) {
            setTimeout(() => {
                overviewMap?.invalidateSize();
            }, 80);
        }

        if (tabId === "routes") {
            setTimeout(() => {
                routeMap?.invalidateSize();
            }, 80);
        }
    }

    navButtons.forEach(button => {
        const tab = button.dataset.tab;

        if (!tab) {
            return;
        }

        button.addEventListener(
            "click",
            () => switchTab(tab)
        );
    });

    document
        .querySelectorAll(
            "button[data-tab]"
        )
        .forEach(button => {
            if (
                button.closest(
                    ".navigation-item"
                )
            ) {
                return;
            }

            button.addEventListener(
                "click",
                () =>
                    switchTab(
                        button.dataset.tab
                    )
            );
        });

    /* =========================================================
       MOBILE SIDEBAR
    ========================================================= */

    function setDesktopSidebarCollapsed(
        collapsed
    ) {
        if (window.innerWidth <= 1050) {
            return;
        }

        document.body.classList.toggle(
            "sidebar-collapsed",
            Boolean(collapsed)
        );

        sidebarToggleButton?.setAttribute(
            "aria-expanded",
            String(!collapsed)
        );

        sidebarToggleButton?.setAttribute(
            "aria-label",
            collapsed
                ? "Open sidebar"
                : "Collapse sidebar"
        );

        sidebarToggleButton?.setAttribute(
            "title",
            collapsed
                ? "Open sidebar"
                : "Collapse sidebar"
        );

        setTimeout(() => {
            overviewMap?.invalidateSize();
            routeMap?.invalidateSize();
        }, 160);
    }

    function openSidebar() {
        if (window.innerWidth > 1050) {
            setDesktopSidebarCollapsed(false);
            return;
        }

        sidebar?.classList.add(
            "open"
        );

        mobileBackdrop?.classList.add(
            "visible"
        );

        mobileMenuButton?.setAttribute(
            "aria-expanded",
            "true"
        );
    }

    function closeSidebar() {
        if (window.innerWidth > 1050) {
            sidebar?.classList.remove(
                "open"
            );
            mobileBackdrop?.classList.remove(
                "visible"
            );
            mobileMenuButton?.setAttribute(
                "aria-expanded",
                "false"
            );
            return;
        }

        sidebar?.classList.remove(
            "open"
        );

        mobileBackdrop?.classList.remove(
            "visible"
        );

        mobileMenuButton?.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    sidebarToggleButton?.addEventListener(
        "click",
        () => {
            const collapsed =
                document.body.classList.contains(
                    "sidebar-collapsed"
                );

            setDesktopSidebarCollapsed(
                !collapsed
            );
        }
    );

    mobileMenuButton?.addEventListener(
        "click",
        () => {
            if (
                sidebar?.classList.contains(
                    "open"
                )
            ) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }
    );

    mobileBackdrop?.addEventListener(
        "click",
        closeSidebar
    );

    /* =========================================================
       NOTIFICATION DRAWER
    ========================================================= */

    function openNotifications() {
        notificationDrawer?.classList.add(
            "open"
        );

        notificationDrawer?.setAttribute(
            "aria-hidden",
            "false"
        );
    }

    function closeNotifications() {
        notificationDrawer?.classList.remove(
            "open"
        );

        notificationDrawer?.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    notificationButton?.addEventListener(
        "click",
        openNotifications
    );

    headerNotificationButton?.addEventListener(
        "click",
        openNotifications
    );
closeNotificationDrawer?.addEventListener(
        "click",
        closeNotifications
    );

    markNotificationsRead?.addEventListener(
        "click",
        async () => {
            try {
                await apiRequest(
                    "/api/inspector/notifications/read",
                    {
                        method: "PUT"
                    }
                );

                await loadDashboardData();

                showToast(
                    "All notifications marked as read."
                );
            } catch (error) {
                console.error(
                    "Notification update failed:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to update notifications."
                );
            }
        }
    );

    /* =========================================================
       LOGOUT
    ========================================================= */

    logoutButton?.addEventListener(
        "click",
        async () => {
            try {
                await fetch(
                    "/api/auth/logout",
                    {
                        method: "POST",
                        credentials:
                            "same-origin"
                    }
                );
            } catch (error) {
                console.error(
                    "Logout request failed:",
                    error
                );
            } finally {
                window.location.href =
                    "/login";
            }
        }
    );

    /* =========================================================
       MAPS
    ========================================================= */

    function createTruckIcon(vehicle) {
        if (
            typeof window.L ===
            "undefined"
        ) {
            return null;
        }

        const statusKey =
            getMapStatusKey(
                vehicle
            );

        return L.divIcon({
            className: "",
            html: `
                <div class="custom-truck-marker ${escapeHTML(
                    statusKey
                )}">
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path d="M3 6.5h11v9H3z"></path>
                        <path d="M14 10h4l3 3v2.5h-7z"></path>
                        <circle cx="7" cy="18" r="2"></circle>
                        <circle cx="18" cy="18" r="2"></circle>
                    </svg>
                </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });
    }

    function createTruckPopup(vehicle) {
        return `
            <div class="truck-popup">
                <strong>
                    ${escapeHTML(vehicle.id)}
                    ${
                        vehicle.route &&
                        vehicle.route !==
                            "Unassigned"
                            ? ` (${escapeHTML(
                                vehicle.route
                            )})`
                            : ""
                    }
                </strong>

                <span>
                    Driver:
                    ${escapeHTML(
                        vehicle.driver
                    )}
                </span>

                <span>
                    Zone:
                    ${escapeHTML(
                        vehicle.zone
                    )}
                </span>

                <span>
                    Status:
                    ${escapeHTML(
                        vehicle.status
                    )}
                </span>

                <span>
                    Fill:
                    ${Number(
                        vehicle.fill || 0
                    )}%
                    • ETA:
                    ${escapeHTML(
                        vehicle.eta ||
                        "—"
                    )}
                </span>
            </div>
        `;
    }

    function setupMap(element) {
        if (
            !element ||
            typeof window.L ===
                "undefined"
        ) {
            return null;
        }

        try {
            const map =
                L.map(element, {
                    zoomControl: true,
                    scrollWheelZoom: false,
                    attributionControl: true
                });

            map.setView(
                DEFAULT_MAP_CENTER,
                DEFAULT_MAP_ZOOM
            );

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,
                    attribution:
                        "&copy; OpenStreetMap contributors"
                }
            ).addTo(map);

            return map;
        } catch (error) {
            console.error(
                "Map initialization failed:",
                error
            );

            return null;
        }
    }

    function clearMarkerMap(markerMap) {
        markerMap.forEach(marker => {
            marker.remove();
        });

        markerMap.clear();
    }

    function clearRouteLayers() {
        routeLayers.forEach(layer => {
            layer.remove();
        });

        routeLayers.length = 0;
    }

    function clearComplaintLayers() {
        complaintLayers.forEach(layer => {
            layer.remove();
        });

        complaintLayers.length = 0;
    }

    function renderVehicleMarkers(
        map,
        markerMap,
        fit = false
    ) {
        if (!map) {
            return;
        }

        const locatedVehicles =
            trucks.filter(vehicle =>
                Array.isArray(
                    vehicle.position
                ) &&
                vehicle.position.length === 2 &&
                Number.isFinite(
                    Number(vehicle.position[0])
                ) &&
                Number.isFinite(
                    Number(vehicle.position[1])
                )
            );

        locatedVehicles.forEach(vehicle => {
            const icon =
                createTruckIcon(vehicle);

            if (!icon) {
                return;
            }

            const marker =
                L.marker(
                    vehicle.position,
                    {
                        icon,
                        title: vehicle.id
                    }
                )
                    .addTo(map)
                    .bindPopup(
                        createTruckPopup(
                            vehicle
                        )
                    );

            markerMap.set(
                vehicle.id,
                marker
            );
        });

        if (
            fit &&
            locatedVehicles.length
        ) {
            const bounds =
                L.latLngBounds(
                    locatedVehicles.map(
                        vehicle =>
                            vehicle.position
                    )
                );

            map.fitBounds(
                bounds.pad(0.25),
                {
                    maxZoom: 15
                }
            );
        }
    }

    function renderRouteLines() {
        clearRouteLayers();

        if (
            !corridorsVisible ||
            typeof window.L === "undefined"
        ) {
            return;
        }

        routes.forEach(route => {
            const points =
                (route.stops || [])
                    .filter(stop =>
                        Number.isFinite(
                            Number(stop.latitude)
                        ) &&
                        Number.isFinite(
                            Number(stop.longitude)
                        )
                    )
                    .sort(
                        (a, b) =>
                            Number(a.order || 0) -
                            Number(b.order || 0)
                    )
                    .map(stop => [
                        Number(stop.latitude),
                        Number(stop.longitude)
                    ]);

            if (points.length < 2) {
                return;
            }

            const routeColor =
                route.status === "delayed"
                    ? "#9a7928"
                    : route.status === "completed"
                        ? "#64748b"
                        : "#547f36";

            if (overviewMap) {
                routeLayers.push(
                    L.polyline(
                        points,
                        {
                            color: routeColor,
                            weight: 4,
                            opacity: 0.72,
                            lineCap: "round",
                            lineJoin: "round"
                        }
                    ).addTo(overviewMap)
                );
            }

            if (routeMap) {
                routeLayers.push(
                    L.polyline(
                        points,
                        {
                            color: routeColor,
                            weight: 5,
                            opacity: 0.72,
                            lineCap: "round",
                            lineJoin: "round"
                        }
                    ).addTo(routeMap)
                );
            }
        });
    }

    function renderComplaintMarkers() {
        clearComplaintLayers();

        if (!overviewMap) {
            return;
        }

        reports
            .filter(complaint =>
                Number.isFinite(
                    Number(complaint.latitude)
                ) &&
                Number.isFinite(
                    Number(complaint.longitude)
                )
            )
            .forEach(complaint => {
                const marker =
                    L.circleMarker(
                        [
                            Number(
                                complaint.latitude
                            ),
                            Number(
                                complaint.longitude
                            )
                        ],
                        {
                            radius: 7,
                            color: "#dc2626",
                            fillColor: "#dc2626",
                            fillOpacity: 0.9,
                            weight: 2
                        }
                    )
                        .addTo(overviewMap)
                        .bindPopup(`
                            <div class="truck-popup">
                                <strong>
                                    ${escapeHTML(
                                        complaint.id
                                    )}
                                </strong>
                                <span>
                                    ${escapeHTML(
                                        complaint.type
                                    )}
                                </span>
                                <span>
                                    ${escapeHTML(
                                        complaint.location
                                    )}
                                </span>
                                <span>
                                    Priority:
                                    ${escapeHTML(
                                        complaint.priority
                                    )}
                                </span>
                            </div>
                        `);

                complaintLayers.push(
                    marker
                );
            });
    }

    function initializeMaps() {
        overviewMap =
            setupMap(
                trackingMapElement
            );

        routeMap =
            setupMap(
                routeMapElement
            );

        refreshMaps();
    }

    function refreshMaps() {
        clearMarkerMap(
            overviewMarkers
        );

        clearMarkerMap(
            routeMarkers
        );

        clearComplaintLayers();
        clearRouteLayers();

        if (overviewMap) {
            renderVehicleMarkers(
                overviewMap,
                overviewMarkers,
                true
            );
        }

        if (routeMap) {
            renderVehicleMarkers(
                routeMap,
                routeMarkers,
                true
            );
        }

        renderRouteLines();
        renderComplaintMarkers();

        if (overviewMap) {
            overviewMap.setView(
                DEFAULT_MAP_CENTER,
                DEFAULT_MAP_ZOOM
            );

            const locatedVehicles =
                trucks.filter(vehicle =>
                    Array.isArray(
                        vehicle.position
                    )
                );

            if (locatedVehicles.length) {
                const bounds =
                    L.latLngBounds(
                        locatedVehicles.map(
                            vehicle =>
                                vehicle.position
                        )
                    );

                overviewMap.fitBounds(
                    bounds.pad(0.25),
                    {
                        maxZoom: 15
                    }
                );
            }
        }

        if (routeMap) {
            routeMap.setView(
                DEFAULT_MAP_CENTER,
                DEFAULT_MAP_ZOOM
            );

            const routePoints =
                routes.flatMap(
                    route =>
                        (route.stops || [])
                            .filter(stop =>
                                Number.isFinite(
                                    Number(
                                        stop.latitude
                                    )
                                ) &&
                                Number.isFinite(
                                    Number(
                                        stop.longitude
                                    )
                                )
                            )
                            .map(stop => [
                                Number(
                                    stop.latitude
                                ),
                                Number(
                                    stop.longitude
                                )
                            ])
                );

            if (routePoints.length) {
                routeMap.fitBounds(
                    L.latLngBounds(
                        routePoints
                    ).pad(0.2),
                    {
                        maxZoom: 15
                    }
                );
            }
        }
    }

    mapPlus?.addEventListener(
        "click",
        () => {
            overviewMap?.zoomIn();
        }
    );

    mapMinus?.addEventListener(
        "click",
        () => {
            overviewMap?.zoomOut();
        }
    );

    corridorButton?.addEventListener(
        "click",
        () => {
            corridorsVisible =
                !corridorsVisible;

            renderRouteLines();

            showToast(
                corridorsVisible
                    ? "Database route corridors shown."
                    : "Database route corridors hidden."
            );
        }
    );


    truckLayerButton?.addEventListener(
        "click",
        () => {
            trucksVisible =
                !trucksVisible;

            refreshMaps();

            showToast(
                trucksVisible
                    ? "Database vehicle layer enabled."
                    : "Database vehicle layer hidden."
            );
        }
    );
/* =========================================================
       ROUTES
    ========================================================= */


function renderActiveRoutes() {
    if (!activeRoutesList) {
        return;
    }

    const visibleRoutes =
        routes.filter(
            (route) =>
                route.status !==
                "cancelled"
        );

    if (!visibleRoutes.length) {
        activeRoutesList.innerHTML = `
            <div class="summary-empty">
                No routes found in the current operational scope.
            </div>
        `;
        return;
    }

    activeRoutesList.innerHTML =
        visibleRoutes
            .map(
                (route) => {
                    const state =
                        getStatusLabel(
                            route.status,
                            route.delayMinutes
                        );

                    const stateKey =
                        getRouteStateKey(
                            route.status
                        );

                    const progress =
                        routeProgress(
                            route
                        );

                    const crew =
                        route.vehicle?.number
                            ? `${route.vehicle.number} • ${route.driver?.name || "Driver"}`
                            : "Crew not assigned";

                    return `
                        <article
                            class="active-route-card"
                            data-route-id="${Number(
                                route.databaseId
                            )}"
                        >
                            <div class="active-route-top">

                                <span class="route-id-chip">
                                    ${escapeHTML(
                                        route.id
                                    )}
                                </span>

                                <span class="route-state ${escapeHTML(
                                    stateKey
                                )}">
                                    ${escapeHTML(
                                        state
                                    )}
                                </span>

                            </div>

                            <div class="active-route-meta">

                                <div>
                                    <span>ROUTE</span>
                                    <strong>
                                        ${escapeHTML(
                                            route.routeName
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>AREA</span>
                                    <strong>
                                        ${escapeHTML(
                                            route.zoneLabel
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>CREW</span>
                                    <strong>
                                        ${escapeHTML(
                                            crew
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>PROGRESS</span>
                                    <strong>
                                        ${escapeHTML(
                                            progress
                                        )}
                                    </strong>
                                </div>

                            </div>

                            <div class="active-route-footer">

                                <span>
                                    ${
                                        route.startsAt
                                            ? `Starts ${escapeHTML(
                                                formatDateTime(
                                                    route.startsAt
                                                )
                                            )}`
                                            : "Schedule not set"
                                    }
                                </span>

                                <span>
                                    ${
                                        route.estimatedDistanceKm !==
                                            null &&
                                        route.estimatedDistanceKm !==
                                            undefined
                                            ? `${Number(
                                                route.estimatedDistanceKm
                                            ).toFixed(1)} km`
                                            : "Distance —"
                                    }
                                </span>

                            </div>

                            <div class="route-actions">

                                <button
                                    type="button"
                                    class="route-action-button"
                                    data-route-action="edit"
                                    data-route-id="${Number(
                                        route.databaseId
                                    )}"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="route-action-button danger"
                                    data-route-action="cancel"
                                    data-route-id="${Number(
                                        route.databaseId
                                    )}"
                                >
                                    Cancel Route
                                </button>

                            </div>

                        </article>
                    `;
                }
            )
            .join("");
}


function renderVehiclePairings() {
    if (!vehiclePairings) {
        return;
    }

    if (!trucks.length) {
        vehiclePairings.innerHTML = `
            <div class="summary-empty">
                No vehicles found in the current operational scope.
            </div>
        `;
        return;
    }

    const assignedDriverIds =
        new Set(
            pairings
                .map(
                    (assignment) =>
                        Number(
                            assignment.driver?.id
                        )
                )
                .filter(Boolean)
        );

    const cards =
        trucks.map(
            (vehicle) => {
                const driver =
                    vehicle.assignment?.driver ||
                    null;

                const route =
                    vehicle.assignment ||
                    null;

                const image =
                    vehicle.imagePath
                        ? `
                            <img
                                src="${escapeHTML(
                                    vehicle.imagePath
                                )}"
                                alt="${escapeHTML(
                                    vehicle.id
                                )}"
                                loading="lazy"
                            >
                        `
                        : `
                            <span class="vehicle-image-placeholder">
                                🚛
                            </span>
                        `;

                return `
                    <article class="pairing-card card-shell">

                        <div class="pairing-top">
                            <span class="pairing-id">
                                ${escapeHTML(
                                    vehicle.id
                                )}
                            </span>

                            <span class="duty-state ${
                                vehicle.status ===
                                "delayed"
                                    ? "delayed"
                                    : vehicle.status !==
                                      "available"
                                        ? "active"
                                        : ""
                            }">
                                ${escapeHTML(
                                    vehicle.statusLabel
                                )}
                            </span>
                        </div>


                        <div class="pairing-body">

                            <div class="person-panel">

                                <div class="vehicle-preview">
                                    ${image}
                                </div>

                                <div class="person-top">

                                    <div class="avatar-small">
                                        🚛
                                    </div>

                                    <div>
                                        <strong>
                                            ${escapeHTML(
                                                vehicle.type
                                            )}
                                        </strong>

                                        <span>
                                            ${escapeHTML(
                                                vehicle.make ||
                                                "Vehicle"
                                            )}
                                        </span>
                                    </div>

                                </div>

                                <div class="person-info">

                                    <div>
                                        <b>Registration:</b>
                                        ${escapeHTML(
                                            vehicle.registrationNumber ||
                                            "—"
                                        )}
                                    </div>

                                    <div>
                                        <b>Load:</b>
                                        ${Number(
                                            vehicle.fill || 0
                                        )}%
                                        ·
                                        ${formatTons(
                                            vehicle.currentLoadTons
                                        )}
                                        /
                                        ${formatTons(
                                            vehicle.capacityTons
                                        )}
                                    </div>

                                    <div>
                                        <b>Route:</b>
                                        ${escapeHTML(
                                            route?.routeCode ||
                                            "Unassigned"
                                        )}
                                    </div>

                                    <div>
                                        <b>Location:</b>
                                        ${
                                            vehicle.position
                                                ? `${vehicle.position[0].toFixed(5)}, ${vehicle.position[1].toFixed(5)}`
                                                : "No GPS data"
                                        }
                                    </div>

                                </div>

                            </div>


                            <div class="person-panel">

                                <div class="person-top">

                                    <div class="avatar-small">
                                        ${makeInitials(
                                            driver?.name
                                        )}
                                    </div>

                                    <div>
                                        <strong>
                                            ${escapeHTML(
                                                driver?.name ||
                                                "Unassigned Driver"
                                            )}
                                        </strong>

                                        <span>
                                            Current crew assignment
                                        </span>
                                    </div>

                                </div>

                                <div class="person-info">

                                    <div>
                                        <b>Employee ID:</b>
                                        ${escapeHTML(
                                            driver?.employeeId ||
                                            "—"
                                        )}
                                    </div>

                                    <div>
                                        <b>License:</b>
                                        ${escapeHTML(
                                            driver?.licenseType ||
                                            "—"
                                        )}
                                    </div>

                                    <div>
                                        <b>Route:</b>
                                        ${escapeHTML(
                                            route?.routeName ||
                                            "Unassigned"
                                        )}
                                    </div>

                                    <div>
                                        <b>Ward:</b>
                                        ${escapeHTML(
                                            vehicle.ward ||
                                            route?.ward?.name ||
                                            "—"
                                        )}
                                    </div>

                                </div>

                            </div>

                        </div>


                        <div class="pairing-footer">
                            <span>
                                ${
                                    vehicle.etaMinutes !==
                                        null &&
                                    vehicle.etaMinutes !==
                                        undefined
                                        ? `ETA ${vehicle.etaMinutes} min`
                                        : "ETA —"
                                }
                            </span>

                            <span>
                                ${
                                    vehicle.location?.recordedAt
                                        ? `Location ${timeAgo(
                                            vehicle.location.recordedAt
                                        )}`
                                        : "Location not recorded"
                                }
                            </span>
                        </div>

                        <div class="management-actions">

                            <button
                                type="button"
                                class="management-action-button"
                                data-fleet-action="edit-vehicle"
                                data-vehicle-id="${Number(
                                    vehicle.databaseId
                                )}"
                            >
                                Edit Vehicle
                            </button>

                            <button
                                type="button"
                                class="management-action-button danger"
                                data-fleet-action="deactivate-vehicle"
                                data-vehicle-id="${Number(
                                    vehicle.databaseId
                                )}"
                                ${
                                    vehicle.assignment
                                        ? "disabled title=\"Cancel or reassign the active route first.\""
                                        : ""
                                }
                            >
                                Deactivate
                            </button>

                        </div>

                    </article>
                `;
            }
        );

    const availableDrivers =
        drivers.filter(
            (driver) =>
                driver.status ===
                "available" &&
                !assignedDriverIds.has(
                    Number(
                        driver.databaseId
                    )
                )
        );

    if (availableDrivers.length) {
        cards.push(
            `
                <article class="pairing-card card-shell">

                    <div class="pairing-top">
                        <span class="pairing-id">
                            AVAILABLE DRIVERS
                        </span>

                        <span class="duty-state">
                            ${
                                availableDrivers.length
                            } READY
                        </span>
                    </div>

                    <div class="person-panel">

                        <div class="person-info">
                            ${availableDrivers
                                .slice(0, 8)
                                .map(
                                    (driver) =>
                                        `
                                            <div>
                                                <b>
                                                    ${escapeHTML(
                                                        driver.fullName
                                                    )}
                                                </b>
                                                ·
                                                ${
                                                    escapeHTML(
                                                        driver.employeeId ||
                                                        "No employee ID"
                                                    )
                                                }
                                                ·
                                                ${
                                                    escapeHTML(
                                                        driver.licenseType ||
                                                        "License"
                                                    )
                                                }
                                            </div>
                                        `
                                )
                                .join("")}
                        </div>

                    </div>

                    <div class="pairing-footer">
                        <span>
                            Select a driver when creating a route.
                        </span>
                    </div>

                </article>
            `
        );
    }

    vehiclePairings.innerHTML =
        cards.join("");
}


function renderDriverRegistry() {
    if (!driverRegistryList) {
        return;
    }

    if (driverRegistryStatus) {
        driverRegistryStatus.textContent =
            `${drivers.length} driver${
                drivers.length === 1 ? "" : "s"
            }`;
    }

    if (!drivers.length) {
        driverRegistryList.innerHTML = `
            <div class="summary-empty">
                No drivers found in the current operational scope.
            </div>
        `;
        return;
    }

    driverRegistryList.innerHTML =
        drivers
            .map(
                (driver) => {
                    const statusClass =
                        String(driver.status || "")
                            .toLowerCase()
                            .replace(/_/g, "-");

                    const scopeLabel =
                        driver.ward?.number !== null &&
                        driver.ward?.number !== undefined
                            ? `Ward ${driver.ward.number}${
                                driver.ward.name
                                    ? ` · ${driver.ward.name}`
                                    : ""
                            }`
                            : "No ward assigned";

                    const canDeactivate =
                        driver.status !== "assigned";

                    return `
                        <article class="driver-registry-card-item">

                            <div class="registry-card-top">

                                <div class="registry-card-title">
                                    <strong>
                                        ${escapeHTML(
                                            driver.fullName
                                        )}
                                    </strong>

                                    <span>
                                        ${escapeHTML(
                                            driver.employeeId ||
                                            "No employee ID"
                                        )}
                                    </span>
                                </div>

                                <span class="registry-status-badge ${escapeHTML(
                                    statusClass
                                )}">
                                    ${escapeHTML(
                                        humanizeEnum(
                                            driver.status
                                        )
                                    )}
                                </span>

                            </div>

                            <div class="registry-card-details">

                                <div>
                                    <span>Mobile</span>
                                    <strong>
                                        ${escapeHTML(
                                            driver.mobileNumber || "—"
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>License</span>
                                    <strong>
                                        ${escapeHTML(
                                            driver.licenseType ||
                                            driver.licenseNumber ||
                                            "—"
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>Ward</span>
                                    <strong>
                                        ${escapeHTML(
                                            scopeLabel
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>Email</span>
                                    <strong>
                                        ${escapeHTML(
                                            driver.email || "—"
                                        )}
                                    </strong>
                                </div>

                            </div>

                            <div class="management-actions">

                                <button
                                    type="button"
                                    class="management-action-button"
                                    data-fleet-action="edit-driver"
                                    data-driver-id="${Number(
                                        driver.databaseId
                                    )}"
                                >
                                    Edit Driver
                                </button>

                                <button
                                    type="button"
                                    class="management-action-button danger"
                                    data-fleet-action="deactivate-driver"
                                    data-driver-id="${Number(
                                        driver.databaseId
                                    )}"
                                    ${
                                        canDeactivate
                                            ? ""
                                            : "disabled title=\"Complete or cancel the driver's active route first.\""
                                    }
                                >
                                    Deactivate
                                </button>

                            </div>

                        </article>
                    `;
                }
            )
            .join("");
}


function renderReports() {
    if (!reportTableBody) {
        return;
    }

    const query =
        String(
            reportSearch?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const priority =
        reportPriorityFilter?.value ||
        "all";

    const status =
        reportStatusFilter?.value ||
        "all";

    const filtered =
        reports.filter(
            (report) => {
                const searchable = [
                    report.id,
                    report.type,
                    report.location,
                    report.status,
                    report.assignedVehicle,
                    report.assignedDriver,
                    report.wardNumber
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return (
                    (!query ||
                        searchable.includes(query)) &&
                    (
                        priority === "all" ||
                        report.priorityKey === priority
                    ) &&
                    (
                        status === "all" ||
                        report.statusKey === status
                    )
                );
            }
        );

    if (!filtered.length) {
        reportTableBody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="table-empty"
                >
                    No matching complaints found.
                </td>
            </tr>
        `;
        return;
    }

    const statusOptions = [
        "open",
        "in_progress",
        "resolved",
        "cancelled"
    ];

    reportTableBody.innerHTML =
        filtered
            .map(
                (report) => `
                    <tr>

                        <td>
                            <span class="ticket-id">
                                ${escapeHTML(report.id)}
                            </span>
                        </td>

                        <td>
                            <strong>
                                ${escapeHTML(report.type)}
                            </strong>
                            ${
                                report.description
                                    ? `
                                        <small>
                                            ${escapeHTML(
                                                report.description
                                            )}
                                        </small>
                                    `
                                    : ""
                            }
                        </td>

                        <td>
                            ${escapeHTML(
                                report.wardNumber !== null &&
                                report.wardNumber !== undefined
                                    ? `Ward ${report.wardNumber} · ${report.location}`
                                    : report.location
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                timeAgo(
                                    report.reportedAt
                                )
                            )}
                        </td>

                        <td>
                            <span class="priority ${escapeHTML(
                                report.priorityKey
                            )}">
                                ${escapeHTML(
                                    humanizeEnum(report.priority)
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="report-status ${
                                report.statusKey === "resolved"
                                    ? "resolved"
                                    : report.statusKey === "cancelled"
                                        ? "cancelled"
                                        : report.statusKey === "in-progress"
                                            ? "progress"
                                            : "assigned"
                            }">
                                ${escapeHTML(report.status)}
                            </span>
                        </td>

                        <td>
                            <select
                                class="report-status-select"
                                data-complaint-id="${Number(
                                    report.databaseId
                                )}"
                                aria-label="Update complaint status"
                            >
                                ${statusOptions
                                    .map(
                                        (option) => `
                                            <option
                                                value="${option}"
                                                ${
                                                    option ===
                                                    report.rawStatus
                                                        ? "selected"
                                                        : ""
                                                }
                                            >
                                                ${humanizeEnum(option)}
                                            </option>
                                        `
                                    )
                                    .join("")}
                            </select>
                        </td>

                    </tr>
                `
            )
            .join("");
}

reportSearch?.addEventListener(
    "input",
    renderReports
);

reportPriorityFilter?.addEventListener(
    "change",
    renderReports
);

reportStatusFilter?.addEventListener(
    "change",
    renderReports
);

reportTableBody?.addEventListener(
    "change",
    async (event) => {
        const select =
            event.target.closest(
                ".report-status-select"
            );

        if (!select) {
            return;
        }

        const complaintId =
            Number(
                select.dataset.complaintId
            );

        if (
            !Number.isInteger(
                complaintId
            )
        ) {
            showToast(
                "Invalid complaint ID."
            );
            return;
        }

        const nextStatus =
            select.value;

        select.disabled =
            true;

        try {
            await apiRequest(
                `/api/inspector/complaints/${complaintId}`,
                {
                    method: "PUT",
                    body:
                        JSON.stringify({
                            status:
                                nextStatus
                        })
                }
            );

            await loadDashboardData();

            showToast(
                "Complaint status updated."
            );
        } catch (error) {
            console.error(
                "Complaint update failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to update complaint."
            );
        } finally {
            select.disabled =
                false;
        }
    }
);



/* =========================================================
   ROUTE MODALS
========================================================= */

function openModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    modal.querySelector(
        "input:not([type='hidden']), select, button"
    )?.focus();
}

function closeModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.remove(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}

async function openAddRouteWithData() {
    try {
        await loadRouteFormOptions();

        openModal(
            addRouteModal
        );
    } catch (error) {
        console.error(
            "Route form initialization failed:",
            error
        );

        showToast(
            error.message ||
            "Unable to load route options."
        );
    }
}

function findRouteById(
    routeId
) {
    return routes.find(
        (route) =>
            Number(
                route.databaseId
            ) ===
            Number(routeId)
    );
}

async function loadEditRouteFormOptions(
    selectedZoneId = "",
    selectedWardId = ""
) {
    const zoneSelect =
        document.getElementById(
            "editRouteZoneSelect"
        );

    const wardSelect =
        document.getElementById(
            "editRouteWardSelect"
        );

    if (!zoneSelect || !wardSelect) {
        return;
    }

    const zonesResult =
        await apiRequest(
            "/api/inspector/zones"
        );

    const zones =
        zonesResult.zones ||
        [];

    setSelectOptions(
        zoneSelect,
        zones.map(
            (zone) => ({
                value: zone.id,
                label: `${zone.code} - ${zone.name}`
            })
        ),
        "Select Zone",
        selectedZoneId
    );

    const zoneId =
        Number(
            selectedZoneId ||
            zoneSelect.value ||
            0
        );

    if (!zoneId) {
        setSelectOptions(
            wardSelect,
            [],
            "Select Ward"
        );
        return;
    }

    const wardsResult =
        await apiRequest(
            `/api/inspector/wards?zone_id=${encodeURIComponent(
                zoneId
            )}`
        );

    const wards =
        wardsResult.wards ||
        [];

    setSelectOptions(
        wardSelect,
        wards.map(
            (ward) => ({
                value: ward.id,
                label: `Ward ${ward.number} - ${ward.name}`
            })
        ),
        "Select Ward",
        selectedWardId
    );

    zoneSelect.onchange =
        async () => {
            const nextZoneId =
                Number(
                    zoneSelect.value
                );

            if (!nextZoneId) {
                setSelectOptions(
                    wardSelect,
                    [],
                    "Select Ward"
                );
                return;
            }

            try {
                const result =
                    await apiRequest(
                        `/api/inspector/wards?zone_id=${encodeURIComponent(
                            nextZoneId
                        )}`
                    );

                setSelectOptions(
                    wardSelect,
                    (result.wards || [])
                        .map(
                            (ward) => ({
                                value: ward.id,
                                label: `Ward ${ward.number} - ${ward.name}`
                            })
                        ),
                    "Select Ward"
                );
            } catch (error) {
                console.error(
                    "Unable to load edit-route wards:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to load wards."
                );
            }
        };
}

async function openEditRoute(
    routeId
) {
    const route =
        findRouteById(
            routeId
        );

    if (
        !route ||
        !editRouteForm
    ) {
        showToast(
            "Route not found."
        );
        return;
    }

    const form =
        editRouteForm.elements;

    if (form.route_id) {
        form.route_id.value =
            String(
                route.databaseId
            );
    }

    if (form.route_code) {
        form.route_code.value =
            route.id ||
            "";
    }

    if (form.route_name) {
        form.route_name.value =
            route.routeName ||
            "";
    }

    const selectedZoneId =
        route.zone?.id ||
        "";

    const selectedWardId =
        route.ward?.id ||
        "";

    if (form.zone_id) {
        form.zone_id.value =
            String(
                selectedZoneId
            );
    }

    if (form.ward_id) {
        form.ward_id.value =
            String(
                selectedWardId
            );
    }

    if (form.status) {
        form.status.value =
            route.status ||
            "scheduled";
    }

    try {
        await loadEditRouteFormOptions(
            selectedZoneId,
            selectedWardId
        );
    } catch (error) {
        console.error(
            "Route edit form initialization failed:",
            error
        );

        showToast(
            error.message ||
            "Unable to load zone and ward options."
        );

        return;
    }

    /*
     * Active crew assignment changes are not supported by the
     * current PUT route endpoint. Hide those fields instead of
     * presenting a non-working operation.
     */
    [
        form.vehicle_id,
        form.driver_id
    ].forEach(
        (select) => {
            if (!select) {
                return;
            }

            select.disabled =
                true;

            const label =
                select.closest(
                    "label"
                );

            if (label) {
                label.style.display =
                    "none";
            }
        }
    );

    openModal(
        editRouteModal
    );
}

createRouteButton?.addEventListener(
    "click",
    openAddRouteWithData
);

routePlusButton?.addEventListener(
    "click",
    openAddRouteWithData
);

assignRouteFromOverview?.addEventListener(
    "click",
    openAddRouteWithData
);

document
    .querySelectorAll(
        "[data-close-modal]"
    )
    .forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    closeModal(
                        document.getElementById(
                            button.dataset
                                .closeModal
                        )
                    );
                }
            );
        }
    );

activeRoutesList?.addEventListener(
    "click",
    async (event) => {
        const button =
            event.target.closest(
                "[data-route-action]"
            );

        if (!button) {
            return;
        }

        const routeId =
            Number(
                button.dataset.routeId
            );

        if (
            !Number.isInteger(
                routeId
            )
        ) {
            showToast(
                "Invalid route ID."
            );
            return;
        }

        const action =
            button.dataset.routeAction;

        if (action === "edit") {
            await openEditRoute(
                routeId
            );
            return;
        }

        if (action !== "cancel") {
            return;
        }

        const route =
            findRouteById(
                routeId
            );

        const confirmed =
            window.confirm(
                route
                    ? `Cancel route ${route.id}?`
                    : "Cancel this route?"
            );

        if (!confirmed) {
            return;
        }

        try {
            await apiRequest(
                `/api/inspector/routes/${routeId}`,
                {
                    method:
                        "DELETE"
                }
            );

            await loadDashboardData();

            showToast(
                "Route cancelled successfully."
            );
        } catch (error) {
            console.error(
                "Route cancellation failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to cancel route."
            );
        }
    }
);

addRouteForm?.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (
            !addRouteForm.checkValidity()
        ) {
            addRouteForm.reportValidity();
            return;
        }

        const data =
            Object.fromEntries(
                new FormData(
                    addRouteForm
                ).entries()
            );

        const routeCode =
            String(
                data.route_code ||
                ""
            ).trim();

        const routeName =
            String(
                data.route_name ||
                ""
            ).trim();

        const zoneId =
            Number(
                data.zone_id
            );

        const wardId =
            Number(
                data.ward_id
            );

        const vehicleId =
            data.vehicle_id
                ? Number(
                    data.vehicle_id
                )
                : null;

        const driverId =
            data.driver_id
                ? Number(
                    data.driver_id
                )
                : null;

        const totalStops =
            data.total_stops ===
                undefined ||
            data.total_stops === ""
                ? 0
                : Number(
                    data.total_stops
                );

        if (
            !routeCode ||
            !routeName ||
            !Number.isInteger(
                zoneId
            ) ||
            !Number.isInteger(
                wardId
            )
        ) {
            showToast(
                "Please complete the route details."
            );
            return;
        }

        if (
            (vehicleId &&
                !driverId) ||
            (!vehicleId &&
                driverId)
        ) {
            showToast(
                "Vehicle and driver must be selected together."
            );
            return;
        }

        if (
            !Number.isInteger(
                totalStops
            ) ||
            totalStops < 0
        ) {
            showToast(
                "Total stops must be a non-negative integer."
            );
            return;
        }

        const submitButton =
            addRouteForm.querySelector(
                'button[type="submit"]'
            );

        if (submitButton) {
            submitButton.disabled =
                true;

            submitButton.textContent =
                "Creating...";
        }

        try {
            const result =
                await apiRequest(
                    "/api/inspector/routes",
                    {
                        method:
                            "POST",
                        body:
                            JSON.stringify({
                                route_code:
                                    routeCode,
                                route_name:
                                    routeName,
                                zone_id:
                                    zoneId,
                                ward_id:
                                    wardId,
                                vehicle_id:
                                    vehicleId,
                                driver_id:
                                    driverId,
                                total_stops:
                                    totalStops
                            })
                    }
                );

            addRouteForm.reset();

            closeModal(
                addRouteModal
            );

            await loadDashboardData();

            showToast(
                `${
                    result.route?.id ||
                    routeCode
                } created successfully.`
            );
        } catch (error) {
            console.error(
                "Route creation failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to create route."
            );
        } finally {
            if (submitButton) {
                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Create Route";
            }
        }
    }
);

editRouteForm?.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (
            !editRouteForm.checkValidity()
        ) {
            editRouteForm.reportValidity();
            return;
        }

        const data =
            Object.fromEntries(
                new FormData(
                    editRouteForm
                ).entries()
            );

        const routeId =
            Number(
                data.route_id
            );

        const routeName =
            String(
                data.route_name ||
                ""
            ).trim();

        const zoneId =
            Number(
                data.zone_id
            );

        const wardId =
            Number(
                data.ward_id
            );

        if (
            !Number.isInteger(
                routeId
            ) ||
            !routeName ||
            !Number.isInteger(
                zoneId
            ) ||
            !Number.isInteger(
                wardId
            )
        ) {
            showToast(
                "Please complete all route update fields."
            );
            return;
        }

        const submitButton =
            editRouteForm.querySelector(
                'button[type="submit"]'
            );

        if (submitButton) {
            submitButton.disabled =
                true;

            submitButton.textContent =
                "Saving...";
        }

        try {
            await apiRequest(
                `/api/inspector/routes/${routeId}`,
                {
                    method:
                        "PUT",
                    body:
                        JSON.stringify({
                            route_name:
                                routeName,
                            zone_id:
                                zoneId,
                            ward_id:
                                wardId,
                            status:
                                data.status
                        })
                }
            );

            closeModal(
                editRouteModal
            );

            await loadDashboardData();

            showToast(
                "Route updated successfully."
            );
        } catch (error) {
            console.error(
                "Route update failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to update route."
            );
        } finally {
            if (submitButton) {
                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Save Changes";
            }
        }
    }
);


    /* =========================================================
       VEHICLE & DRIVER MANAGEMENT
    ========================================================= */

    function resetVehicleForm() {
        if (!vehicleForm) {
            return;
        }

        vehicleForm.reset();

        const elements =
            vehicleForm.elements;

        if (elements.vehicle_id) {
            elements.vehicle_id.value = "";
        }

        if (elements.status) {
            elements.status.value = "available";
            elements.status.disabled = false;
        }
    }

    function resetDriverForm() {
        if (!driverForm) {
            return;
        }

        driverForm.reset();

        const elements =
            driverForm.elements;

        if (elements.driver_id) {
            elements.driver_id.value = "";
        }

        if (elements.status) {
            elements.status.value = "available";
            elements.status.disabled = false;
        }

        if (driverStatusHelp) {
            driverStatusHelp.textContent =
                "Route assignment automatically changes the driver to Assigned.";
        }
    }

    async function loadDriverFormOptions(
        selectedZoneId = "",
        selectedWardId = ""
    ) {
        if (!driverZoneSelect || !driverWardSelect) {
            return;
        }

        const zonesResult =
            await apiRequest(
                "/api/inspector/zones"
            );

        const zones =
            zonesResult.zones || [];

        setSelectOptions(
            driverZoneSelect,
            zones.map(zone => ({
                value: zone.id,
                label: `${zone.code} - ${zone.name}`
            })),
            "Select Zone",
            selectedZoneId
        );

        const zoneId =
            Number(
                selectedZoneId ||
                driverZoneSelect.value ||
                0
            );

        if (!zoneId) {
            setSelectOptions(
                driverWardSelect,
                [],
                "Select Ward"
            );
        } else {
            const wardsResult =
                await apiRequest(
                    `/api/inspector/wards?zone_id=${encodeURIComponent(
                        zoneId
                    )}`
                );

            setSelectOptions(
                driverWardSelect,
                (wardsResult.wards || []).map(ward => ({
                    value: ward.id,
                    label: `Ward ${ward.number} - ${ward.name}`
                })),
                "Select Ward",
                selectedWardId
            );
        }

        driverZoneSelect.onchange =
            async () => {
                const nextZoneId =
                    Number(
                        driverZoneSelect.value
                    );

                if (!nextZoneId) {
                    setSelectOptions(
                        driverWardSelect,
                        [],
                        "Select Ward"
                    );
                    return;
                }

                try {
                    const result =
                        await apiRequest(
                            `/api/inspector/wards?zone_id=${encodeURIComponent(
                                nextZoneId
                            )}`
                        );

                    setSelectOptions(
                        driverWardSelect,
                        (result.wards || []).map(ward => ({
                            value: ward.id,
                            label: `Ward ${ward.number} - ${ward.name}`
                        })),
                        "Select Ward"
                    );
                } catch (error) {
                    console.error(
                        "Unable to load driver wards:",
                        error
                    );

                    showToast(
                        error.message ||
                        "Unable to load wards."
                    );
                }
            };
    }

    function getVehicleById(vehicleId) {
        return trucks.find(
            vehicle =>
                Number(vehicle.databaseId) ===
                Number(vehicleId)
        );
    }

    function getDriverById(driverId) {
        return drivers.find(
            driver =>
                Number(driver.databaseId) ===
                Number(driverId)
        );
    }

    async function openAddVehicleModal() {
        resetVehicleForm();

        if (vehicleModalTitle) {
            vehicleModalTitle.textContent =
                "Add Vehicle";
        }

        const status =
            vehicleForm?.elements?.status;

        if (status) {
            status.value = "available";
            status.disabled = true;
        }

        openModal(vehicleModal);
    }

    async function openEditVehicleModal(
        vehicleId
    ) {
        const vehicle =
            getVehicleById(vehicleId);

        if (!vehicle || !vehicleForm) {
            showToast("Vehicle not found.");
            return;
        }

        const form =
            vehicleForm.elements;

        if (vehicleModalTitle) {
            vehicleModalTitle.textContent =
                "Edit Vehicle";
        }

        form.vehicle_id.value =
            String(vehicle.databaseId);
        form.vehicle_number.value =
            vehicle.id || "";
        form.registration_number.value =
            vehicle.registrationNumber || "";
        form.vehicle_type.value =
            vehicle.type || "";
        form.make.value =
            vehicle.make || "";
        form.capacity_tons.value =
            vehicle.capacityTons || "";
        form.image_path.value =
            vehicle.imagePath || "";
        form.status.value =
            vehicle.status || "available";
        form.status.disabled = false;

        openModal(vehicleModal);
    }

    async function openAddDriverModal() {
        resetDriverForm();

        if (driverModalTitle) {
            driverModalTitle.textContent =
                "Add Driver";
        }

        const status =
            driverForm?.elements?.status;

        if (status) {
            status.value = "available";
            status.disabled = true;
        }

        if (driverStatusHelp) {
            driverStatusHelp.textContent =
                "New drivers are added as Available. Route assignment changes the status to Assigned.";
        }

        try {
            await loadDriverFormOptions();
            openModal(driverModal);
        } catch (error) {
            console.error(
                "Driver form initialization failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to load driver options."
            );
        }
    }

    async function openEditDriverModal(
        driverId
    ) {
        const driver =
            getDriverById(driverId);

        if (!driver || !driverForm) {
            showToast("Driver not found.");
            return;
        }

        const form =
            driverForm.elements;

        if (driverModalTitle) {
            driverModalTitle.textContent =
                "Edit Driver";
        }

        form.driver_id.value =
            String(driver.databaseId);
        form.employee_id.value =
            driver.employeeId || "";
        form.full_name.value =
            driver.fullName || "";
        form.mobile_number.value =
            driver.mobileNumber || "";
        form.email.value =
            driver.email && driver.email !== "—"
                ? driver.email
                : "";
        form.license_number.value =
            driver.licenseNumber &&
            driver.licenseNumber !== "—"
                ? driver.licenseNumber
                : "";
        form.license_type.value =
            driver.licenseType &&
            driver.licenseType !== "—"
                ? driver.licenseType
                : "";

        try {
            await loadDriverFormOptions(
                driver.zone?.id || "",
                driver.ward?.id || ""
            );
        } catch (error) {
            console.error(
                "Driver edit form initialization failed:",
                error
            );

            showToast(
                error.message ||
                "Unable to load driver options."
            );

            return;
        }

        form.status.value =
            driver.status === "assigned"
                ? "available"
                : driver.status || "available";

        if (driver.status === "assigned") {
            form.status.disabled = true;

            if (driverStatusHelp) {
                driverStatusHelp.textContent =
                    "This driver is currently assigned to a route. Complete or cancel that assignment before changing availability.";
            }
        } else {
            form.status.disabled = false;

            if (driverStatusHelp) {
                driverStatusHelp.textContent =
                    "Route assignment automatically changes the driver to Assigned.";
            }
        }

        openModal(driverModal);
    }

    vehicleForm?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            if (!vehicleForm.checkValidity()) {
                vehicleForm.reportValidity();
                return;
            }

            const data =
                Object.fromEntries(
                    new FormData(vehicleForm).entries()
                );

            const vehicleId =
                Number(data.vehicle_id || 0);

            const payload = {
                vehicle_number:
                    String(
                        data.vehicle_number || ""
                    ).trim(),
                registration_number:
                    String(
                        data.registration_number || ""
                    ).trim(),
                vehicle_type:
                    String(
                        data.vehicle_type || ""
                    ).trim(),
                make:
                    String(
                        data.make || ""
                    ).trim(),
                capacity_tons:
                    Number(data.capacity_tons),
                image_path:
                    String(
                        data.image_path || ""
                    ).trim(),
                status:
                    data.status || "available"
            };

            const submitButton =
                vehicleForm.querySelector(
                    'button[type="submit"]'
                );

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent =
                    vehicleId
                        ? "Saving..."
                        : "Adding...";
            }

            try {
                const result =
                    await apiRequest(
                        vehicleId
                            ? `/api/inspector/vehicles/${vehicleId}`
                            : "/api/inspector/vehicles",
                        {
                            method:
                                vehicleId
                                    ? "PUT"
                                    : "POST",
                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );

                closeModal(vehicleModal);
                await loadDashboardData();

                showToast(
                    result.message ||
                    (
                        vehicleId
                            ? "Vehicle updated successfully."
                            : "Vehicle added successfully."
                    )
                );
            } catch (error) {
                console.error(
                    "Vehicle management failed:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to save vehicle."
                );
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent =
                        "Save Vehicle";
                }
            }
        }
    );

    driverForm?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            if (!driverForm.checkValidity()) {
                driverForm.reportValidity();
                return;
            }

            const data =
                Object.fromEntries(
                    new FormData(driverForm).entries()
                );

            const driverId =
                Number(data.driver_id || 0);

            const payload = {
                employee_id:
                    String(
                        data.employee_id || ""
                    ).trim(),
                full_name:
                    String(
                        data.full_name || ""
                    ).trim(),
                mobile_number:
                    String(
                        data.mobile_number || ""
                    ).trim(),
                email:
                    String(
                        data.email || ""
                    ).trim(),
                license_number:
                    String(
                        data.license_number || ""
                    ).trim(),
                license_type:
                    String(
                        data.license_type || ""
                    ).trim(),
                assigned_ward_id:
                    Number(
                        data.assigned_ward_id
                    )
            };

            if (!driverId && data.status) {
                payload.status = data.status;
            }

            if (driverId && !driverStatusSelect?.disabled) {
                payload.status = data.status;
            }

            if (!Number.isInteger(payload.assigned_ward_id)) {
                showToast(
                    "Please select an assigned ward."
                );
                return;
            }

            const submitButton =
                driverForm.querySelector(
                    'button[type="submit"]'
                );

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent =
                    driverId
                        ? "Saving..."
                        : "Adding...";
            }

            try {
                const result =
                    await apiRequest(
                        driverId
                            ? `/api/inspector/drivers/${driverId}`
                            : "/api/inspector/drivers",
                        {
                            method:
                                driverId
                                    ? "PUT"
                                    : "POST",
                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );

                closeModal(driverModal);
                await loadDashboardData();

                showToast(
                    result.message ||
                    (
                        driverId
                            ? "Driver updated successfully."
                            : "Driver added successfully."
                    )
                );
            } catch (error) {
                console.error(
                    "Driver management failed:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to save driver."
                );
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent =
                        "Save Driver";
                }
            }
        }
    );

    addVehicleButton?.addEventListener(
        "click",
        openAddVehicleModal
    );

    addDriverButton?.addEventListener(
        "click",
        openAddDriverModal
    );

    vehiclePairings?.addEventListener(
        "click",
        async event => {
            const button =
                event.target.closest(
                    "[data-fleet-action]"
                );

            if (!button) {
                return;
            }

            const action =
                button.dataset.fleetAction;

            const vehicleId =
                Number(
                    button.dataset.vehicleId
                );

            if (action === "edit-vehicle") {
                await openEditVehicleModal(
                    vehicleId
                );
                return;
            }

            if (action === "deactivate-vehicle") {
                if (button.disabled) {
                    return;
                }

                const confirmed =
                    window.confirm(
                        "Deactivate this vehicle? It will no longer appear in the active fleet."
                    );

                if (!confirmed) {
                    return;
                }

                try {
                    const result =
                        await apiRequest(
                            `/api/inspector/vehicles/${vehicleId}`,
                            {
                                method: "DELETE"
                            }
                        );

                    await loadDashboardData();

                    showToast(
                        result.message ||
                        "Vehicle deactivated successfully."
                    );
                } catch (error) {
                    console.error(
                        "Vehicle deactivation failed:",
                        error
                    );

                    showToast(
                        error.message ||
                        "Unable to deactivate vehicle."
                    );
                }
            }
        }
    );

    driverRegistryList?.addEventListener(
        "click",
        async event => {
            const button =
                event.target.closest(
                    "[data-fleet-action]"
                );

            if (!button) {
                return;
            }

            const action =
                button.dataset.fleetAction;

            const driverId =
                Number(
                    button.dataset.driverId
                );

            if (action === "edit-driver") {
                await openEditDriverModal(
                    driverId
                );
                return;
            }

            if (action === "deactivate-driver") {
                if (button.disabled) {
                    return;
                }

                const confirmed =
                    window.confirm(
                        "Deactivate this driver? The driver will no longer appear in the active driver registry."
                    );

                if (!confirmed) {
                    return;
                }

                try {
                    const result =
                        await apiRequest(
                            `/api/inspector/drivers/${driverId}`,
                            {
                                method: "DELETE"
                            }
                        );

                    await loadDashboardData();

                    showToast(
                        result.message ||
                        "Driver deactivated successfully."
                    );
                } catch (error) {
                    console.error(
                        "Driver deactivation failed:",
                        error
                    );

                    showToast(
                        error.message ||
                        "Unable to deactivate driver."
                    );
                }
            }
        }
    );

    /* =========================================================
       GLOBAL SEARCH
    ========================================================= */

    globalSearch?.addEventListener(
        "input",
        () => {
            const query =
                globalSearch.value
                    .trim()
                    .toLowerCase();

            if (!query) {
                return;
            }

            const routeHit =
                routes.some(
                    route =>
                        [
                            route.id,
                            route.zone,
                            route.vehicle,
                            route.driver
                        ]
                            .join(" ")
                            .toLowerCase()
                            .includes(
                                query
                            )
                );

            const vehicleHit =
                trucks.some(
                    truck =>
                        [
                            truck.id,
                            truck.driver,
                            truck.route,
                            truck.zone
                        ]
                            .join(" ")
                            .toLowerCase()
                            .includes(
                                query
                            )
                );

            const complaintHit =
                reports.some(
                    report =>
                        [
                            report.id,
                            report.type,
                            report.location,
                            report.status
                        ]
                            .join(" ")
                            .toLowerCase()
                            .includes(
                                query
                            )
                );

            if (
                complaintHit &&
                !routeHit &&
                !vehicleHit
            ) {
                switchTab(
                    "citizen-reports"
                );

                if (reportSearch) {
                    reportSearch.value =
                        query;
                }

                renderReports();

                return;
            }

            if (
                routeHit &&
                !vehicleHit
            ) {
                switchTab("routes");

                showToast(
                    `Route match found for "${globalSearch.value.trim()}"`
                );

                return;
            }

            if (vehicleHit) {
                switchTab(
                    "vehicles-drivers"
                );

                showToast(
                    `Vehicle/driver match found for "${globalSearch.value.trim()}"`
                );
            }
        }
    );

    /* =========================================================
       KEYBOARD
    ========================================================= */

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape"
            ) {
                closeNotifications();
                closeModal(
                    addRouteModal
                );
                closeModal(
                    editRouteModal
                );
                closeModal(
                    vehicleModal
                );
                closeModal(
                    driverModal
                );
            }

            if (
                event.key === "/" &&
                document.activeElement !==
                    globalSearch
            ) {
                event.preventDefault();
                globalSearch?.focus();
            }
        }
    );

    /* =========================================================
       RESIZE
    ========================================================= */

    window.addEventListener(
        "resize",
        () => {
            if (
                window.innerWidth >
                1050
            ) {
                closeSidebar();
            }

            setTimeout(() => {
                overviewMap?.invalidateSize();
                routeMap?.invalidateSize();
            }, 120);
        }
    );

    /* =========================================================
       INITIAL LOAD
    ========================================================= */

    initializeMaps();

    if (systemStatusText) {
        systemStatusText.textContent =
            "Loading database data...";
    }

    (async () => {
        try {
            await loadInspectorProfile();
            await loadDashboardData();
        } catch (error) {
            console.error(
                "Dashboard initialization failed:",
                error
            );

            if (
                error.message ===
                "Authentication required."
            ) {
                return;
            }

            showToast(
                error.message ||
                "Unable to initialize dashboard."
            );
        }
    })();
});

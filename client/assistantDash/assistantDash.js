/* =========================================================
   SWACHHITRA
   ASSISTANT COMMISSIONER DASHBOARD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = "/api/assistant";
    const PROFILE_URL = "/profile/";

    const KOLHAPUR_MAP_CENTER = [16.7050, 74.2433];
    const KOLHAPUR_MAP_ZOOM = 13;
    const KOLHAPUR_VIEW_BOUNDS = {
        minLat: 16.60,
        maxLat: 16.81,
        minLng: 74.14,
        maxLng: 74.34
    };

    const state = {
        overview: null,
        wards: [],
        inspectors: [],
        currentScope: null,
        selectedInspector: null,
        assignmentMap: null,
        assignmentMapLayers: [],
        assignmentDivisionBoundary: null,
        assignmentWardBoundary: null,
        assignmentWardBoundarySource: null,
        assignmentOfficePoint: null,
        selectedAssignmentWardId: null,
        assignmentAreaDraft: [],
        assignmentArea: null,
        assignmentMode: "idle",

        divisionOperationalArea: null,
        divisionAreaDraft: [],
        divisionAreaEditing: false,
        divisionAreaEditorLayers: [],

        wardCreateMap: null,
        wardCreateMapLayers: [],
        wardCreateDivisionArea: null,
        wardCreateAreaDraft: [],
        wardCreateArea: null,
        wardCreateMode: "idle",

        wardBoundaryEditMap: null,
        wardBoundaryEditLayers: [],
        wardBoundaryEditMode: "idle",
        wardBoundaryEditDraft: [],
        wardBoundaryEditOriginal: [],
        selectedWardForBoundaryEdit: null,

        supervision: null,
        reports: null,
        csrfToken: null,
        csrfTokenPromise: null,
        selectedChangeRequest: null,

        overviewMap: null,
        overviewMapLayers: [],
        overviewMapRoutes: [],
        overviewMapWards: [],
        overviewMapInspectorAreas: [],
        overviewMapVehicles: [],
        overviewMapRouteVisibility: true,
        overviewMapWardVisibility: true,
        overviewMapVehicleVisibility: true,
        overviewMapRoadGeometryCache: new Map(),
        mapData: null,

        loading: false
    };

    const el = id => document.getElementById(id);

    const dom = {
        app: document.querySelector(".assistant-app"),

        mobileBackdrop: el("mobileBackdrop"),
        sidebarBrandButton: el("sidebarBrandButton"),
        navButtons: document.querySelectorAll("[data-tab]"),
        panels: document.querySelectorAll("[data-panel]"),

        sidebarToggleButton: el("sidebarToggleButton"),
        mobileMenuButton: el("mobileMenuButton"),

        assignedDivisionName: el("assignedDivisionName"),
        assignedDivisionLocation: el("assignedDivisionLocation"),

        pageTitle: el("pageTitle"),
        systemStatus: el("systemStatus"),
        systemStatusText: el("systemStatusText"),

        headerAssistantName: el("headerAssistantName"),
        headerAssistantDivision: el("headerAssistantDivision"),
        logoutButton: el("logoutButton"),
        headerLogoutButton: el("headerLogoutButton"),

        pageMessage: el("pageMessage"),

        overviewSubtitle: el("overviewSubtitle"),
        overviewDivisionBadge: el("overviewDivisionBadge"),

        kpiWardCount: el("kpiWardCount"),
        kpiInspectorCount: el("kpiInspectorCount"),
        kpiActiveRouteCount: el("kpiActiveRouteCount"),
        kpiOpenComplaintCount: el("kpiOpenComplaintCount"),

        overviewDivisionName: el("overviewDivisionName"),
        overviewDivisionCode: el("overviewDivisionCode"),
        overviewDivisionOffice: el("overviewDivisionOffice"),
        overviewDivisionStatus: el("overviewDivisionStatus"),
        overviewInspectorCoverage: el("overviewInspectorCoverage"),
        wardDataNote: el("wardDataNote"),

        overviewMapSubtitle: el("overviewMapSubtitle"),
        overviewTrackingMap: el("overviewTrackingMap"),
        overviewMapRoutesButton: el("overviewMapRoutesButton"),
        overviewMapWardsButton: el("overviewMapWardsButton"),
        overviewMapVehiclesButton: el("overviewMapVehiclesButton"),
        overviewMapEditDivisionButton: el("overviewMapEditDivisionButton"),
        overviewMapSaveDivisionButton: el("overviewMapSaveDivisionButton"),
        overviewMapCancelDivisionButton: el("overviewMapCancelDivisionButton"),
        overviewMapFullscreenButton: el("overviewMapFullscreenButton"),
        overviewMapPlus: el("overviewMapPlus"),
        overviewMapMinus: el("overviewMapMinus"),
        overviewMapScopeText: el("overviewMapScopeText"),
        overviewMapAreaStatus: el("overviewMapAreaStatus"),
        overviewMapDataStatus: el("overviewMapDataStatus"),

        wardNavCount: el("wardNavCount"),
        wardsHeading: el("wardsHeading"),
        wardsStatus: el("wardsStatus"),
        createWardButton: el("createWardButton"),
        wardsTableBody: el("wardsTableBody"),

        inspectorNavCount: el("inspectorNavCount"),
        inspectorsStatus: el("inspectorsStatus"),
        inspectorsTableBody: el("inspectorsTableBody"),
        createInspectorAccountButton: el("createInspectorAccountButton"),
        createInspectorAccountModal: el("createInspectorAccountModal"),
        closeCreateInspectorAccountModal: el("closeCreateInspectorAccountModal"),
        createInspectorAccountForm: el("createInspectorAccountForm"),
        newInspectorFullName: el("newInspectorFullName"),
        newInspectorEmployeeId: el("newInspectorEmployeeId"),
        newInspectorEmail: el("newInspectorEmail"),
        newInspectorMobile: el("newInspectorMobile"),
        newInspectorWard: el("newInspectorWard"),
        newInspectorReason: el("newInspectorReason"),
        createInspectorAccountMessage: el("createInspectorAccountMessage"),
        cancelCreateInspectorAccountButton: el("cancelCreateInspectorAccountButton"),
        createInspectorAccountSubmit: el("createInspectorAccountSubmit"),
        operationNavCount: el("operationNavCount"),
        reportNavCount: el("reportNavCount"),

        reportsSubtitle: el("reportsSubtitle"),
        reportsStatus: el("reportsStatus"),
        reportsPeriodBadge: el("reportsPeriodBadge"),
        reportFromDate: el("reportFromDate"),
        reportToDate: el("reportToDate"),
        reportApplyButton: el("reportApplyButton"),
        reportRefreshButton: el("reportRefreshButton"),
        reportCollectionsMetric: el("reportCollectionsMetric"),
        reportWasteMetric: el("reportWasteMetric"),
        reportCollectionRateMetric: el("reportCollectionRateMetric"),
        reportRouteRateMetric: el("reportRouteRateMetric"),
        reportDelayedRoutesMetric: el("reportDelayedRoutesMetric"),
        reportOpenComplaintsMetric: el("reportOpenComplaintsMetric"),
        reportVehiclesMetric: el("reportVehiclesMetric"),
        reportInspectorCoverageMetric: el("reportInspectorCoverageMetric"),
        reportRouteStatusList: el("reportRouteStatusList"),
        reportCollectionStatusList: el("reportCollectionStatusList"),
        reportComplaintStatusList: el("reportComplaintStatusList"),
        reportFleetSummary: el("reportFleetSummary"),
        reportDailyActivityChart: el("reportDailyActivityChart"),
        reportWardTableBody: el("reportWardTableBody"),

        supervisionStatus: el("supervisionStatus"),
        supervisionRefreshButton: el("supervisionRefreshButton"),
        supervisionRoutesTableBody: el("supervisionRoutesTableBody"),
        supervisionVehiclesTableBody: el("supervisionVehiclesTableBody"),
        supervisionDriversTableBody: el("supervisionDriversTableBody"),
        supervisionCollectionsTableBody: el("supervisionCollectionsTableBody"),
        supervisionComplaintsTableBody: el("supervisionComplaintsTableBody"),
        supervisionNotificationsTableBody: el("supervisionNotificationsTableBody"),
        supervisionChangeRequestsTableBody: el("supervisionChangeRequestsTableBody"),
        supervisionRoutesMetric: el("supervisionRoutesMetric"),
        supervisionVehiclesMetric: el("supervisionVehiclesMetric"),
        supervisionDriversMetric: el("supervisionDriversMetric"),
        supervisionCollectionMetric: el("supervisionCollectionMetric"),
        supervisionComplaintMetric: el("supervisionComplaintMetric"),
        supervisionPendingMetric: el("supervisionPendingMetric"),
        supervisionCompletionMetric: el("supervisionCompletionMetric"),
        supervisionDelayMetric: el("supervisionDelayMetric"),

        reviewChangeRequestModal: el("reviewChangeRequestModal"),
        reviewChangeRequestModalTitle: el("reviewChangeRequestModalTitle"),
        closeReviewChangeRequestModal: el("closeReviewChangeRequestModal"),
        reviewChangeRequestId: el("reviewChangeRequestId"),
        reviewChangeRequestSummary: el("reviewChangeRequestSummary"),
        reviewChangeRequestDetails: el("reviewChangeRequestDetails"),
        reviewChangeRequestNotes: el("reviewChangeRequestNotes"),
        cancelReviewChangeRequestButton: el("cancelReviewChangeRequestButton"),
        rejectChangeRequestButton: el("rejectChangeRequestButton"),
        approveChangeRequestButton: el("approveChangeRequestButton"),
        reviewChangeRequestMessage: el("reviewChangeRequestMessage"),

        profilePreviewName: el("profilePreviewName"),
        profilePreviewEmail: el("profilePreviewEmail"),
        profilePreviewEmployeeId: el("profilePreviewEmployeeId"),
        profilePreviewDesignation: el("profilePreviewDesignation"),
        profilePreviewDepartment: el("profilePreviewDepartment"),
        profilePreviewDivision: el("profilePreviewDivision"),
        openProfileButton: el("openProfileButton"),

        assignInspectorModal: el("assignInspectorModal"),
        assignInspectorModalTitle: el("assignInspectorModalTitle"),
        assignInspectorModalSubtitle: el("assignInspectorModalSubtitle"),
        closeAssignInspectorModal: el("closeAssignInspectorModal"),
        assignInspectorForm: el("assignInspectorForm"),
        assignmentInspectorId: el("assignmentInspectorId"),
        assignmentInspectorName: el("assignmentInspectorName"),
        assignmentInspectorEmployeeId: el("assignmentInspectorEmployeeId"),
        assignmentWardSelect: el("assignmentWardSelect"),
        assignmentReason: el("assignmentReason"),
        assignInspectorMessage: el("assignInspectorMessage"),
        cancelAssignInspectorButton: el("cancelAssignInspectorButton"),
        saveInspectorAssignmentButton: el("saveInspectorAssignmentButton"),

        assignmentMapStatus: el("assignmentMapStatus"),
        assignmentMap: el("assignmentMap"),
        assignmentMapFullscreenButton: el("assignmentMapFullscreenButton"),
        assignmentAreaSummary: el("assignmentAreaSummary"),

        createWardModal: el("createWardModal"),
        createWardModalTitle: el("createWardModalTitle"),
        closeCreateWardModal: el("closeCreateWardModal"),
        createWardForm: el("createWardForm"),
        createWardNumber: el("createWardNumber"),
        createWardCode: el("createWardCode"),
        createWardName: el("createWardName"),
        createWardDivisionScope: el("createWardDivisionScope"),
        wardCreateSelectAreaButton: el("wardCreateSelectAreaButton"),
        wardCreateFinishAreaButton: el("wardCreateFinishAreaButton"),
        wardCreateUndoPointButton: el("wardCreateUndoPointButton"),
        wardCreateClearAreaButton: el("wardCreateClearAreaButton"),
        wardCreateMapStatus: el("wardCreateMapStatus"),
        wardCreateMap: el("wardCreateMap"),
        wardCreateMapFullscreenButton: el("wardCreateMapFullscreenButton"),
        wardCreateAreaSummary: el("wardCreateAreaSummary"),
        createWardMessage: el("createWardMessage"),
        cancelCreateWardButton: el("cancelCreateWardButton"),
        saveCreateWardButton: el("saveCreateWardButton"),

        editWardBoundaryModal: el("editWardBoundaryModal"),
        editWardBoundaryModalTitle: el("editWardBoundaryModalTitle"),
        closeEditWardBoundaryModal: el("closeEditWardBoundaryModal"),
        editWardBoundaryForm: el("editWardBoundaryForm"),
        editWardBoundaryWardScope: el("editWardBoundaryWardScope"),
        editWardBoundarySelectModeButton: el("editWardBoundarySelectModeButton"),
        editWardBoundaryFinishButton: el("editWardBoundaryFinishButton"),
        editWardBoundaryUndoButton: el("editWardBoundaryUndoButton"),
        editWardBoundaryClearButton: el("editWardBoundaryClearButton"),
        editWardBoundaryMapStatus: el("editWardBoundaryMapStatus"),
        editWardBoundaryMap: el("editWardBoundaryMap"),
        editWardBoundaryMapFullscreenButton: el("editWardBoundaryMapFullscreenButton"),
        editWardBoundarySummary: el("editWardBoundarySummary"),
        editWardBoundaryMessage: el("editWardBoundaryMessage"),
        cancelEditWardBoundaryButton: el("cancelEditWardBoundaryButton"),
        saveEditWardBoundaryButton: el("saveEditWardBoundaryButton"),

        toast: el("toast")
    };

    const REQUIRED_IDS = [
        "mobileBackdrop",
        "sidebarBrandButton",
        "sidebarToggleButton",
        "mobileMenuButton",
        "assignedDivisionName",
        "assignedDivisionLocation",
        "pageTitle",
        "systemStatusText",
        "headerAssistantName",
        "headerAssistantDivision",
        "logoutButton",
        "headerLogoutButton",
        "pageMessage",
        "overviewSubtitle",
        "overviewDivisionBadge",
        "kpiWardCount",
        "kpiInspectorCount",
        "kpiActiveRouteCount",
        "kpiOpenComplaintCount",
        "overviewDivisionName",
        "overviewDivisionCode",
        "overviewDivisionOffice",
        "overviewDivisionStatus",
        "overviewInspectorCoverage",
        "wardDataNote",
        "overviewMapSubtitle",
        "overviewTrackingMap",
        "overviewMapRoutesButton",
        "overviewMapWardsButton",
        "overviewMapVehiclesButton",
        "overviewMapEditDivisionButton",
        "overviewMapSaveDivisionButton",
        "overviewMapCancelDivisionButton",
        "overviewMapFullscreenButton",
        "overviewMapPlus",
        "overviewMapMinus",
        "overviewMapScopeText",
        "overviewMapAreaStatus",
        "overviewMapDataStatus",
        "wardNavCount",
        "wardsHeading",
        "wardsStatus",
        "createWardButton",
        "wardsTableBody",
        "inspectorNavCount",
        "inspectorsStatus",
        "inspectorsTableBody",
        "profilePreviewName",
        "profilePreviewEmail",
        "profilePreviewEmployeeId",
        "profilePreviewDesignation",
        "profilePreviewDepartment",
        "profilePreviewDivision",
        "openProfileButton",
        "assignInspectorModal",
        "assignInspectorModalTitle",
        "assignInspectorModalSubtitle",
        "closeAssignInspectorModal",
        "assignInspectorForm",
        "assignmentInspectorId",
        "assignmentInspectorName",
        "assignmentInspectorEmployeeId",
        "assignmentWardSelect",
        "assignmentReason",
        "assignInspectorMessage",
        "cancelAssignInspectorButton",
        "saveInspectorAssignmentButton",
        "assignmentMapStatus",
        "assignmentMap",
        "assignmentMapFullscreenButton",
        "assignmentAreaSummary",
        "createWardModal",
        "createWardModalTitle",
        "closeCreateWardModal",
        "createWardForm",
        "createWardNumber",
        "createWardCode",
        "createWardName",
        "createWardDivisionScope",
        "wardCreateSelectAreaButton",
        "wardCreateFinishAreaButton",
        "wardCreateUndoPointButton",
        "wardCreateClearAreaButton",
        "wardCreateMapStatus",
        "wardCreateMap",
        "wardCreateMapFullscreenButton",
        "wardCreateAreaSummary",
        "createWardMessage",
        "cancelCreateWardButton",
        "saveCreateWardButton",
        "editWardBoundaryModal",
        "editWardBoundaryModalTitle",
        "closeEditWardBoundaryModal",
        "editWardBoundaryForm",
        "editWardBoundaryWardScope",
        "editWardBoundarySelectModeButton",
        "editWardBoundaryFinishButton",
        "editWardBoundaryUndoButton",
        "editWardBoundaryClearButton",
        "editWardBoundaryMapStatus",
        "editWardBoundaryMap",
        "editWardBoundaryMapFullscreenButton",
        "editWardBoundarySummary",
        "editWardBoundaryMessage",
        "cancelEditWardBoundaryButton",
        "saveEditWardBoundaryButton",
        "toast"
    ];

    const missingIds = REQUIRED_IDS.filter(
        id => !document.getElementById(id)
    );
    if (missingIds.length) {
        console.error(
            "Assistant dashboard HTML is missing required IDs:",
            missingIds
        );
        return;
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function numberOrZero(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function cleanText(value, fallback = "—") {
        const text = String(value ?? "").trim();
        return text || fallback;
    }

    function showPageMessage(message = "", type = "") {
        if (!dom.pageMessage) {
            return;
        }

        dom.pageMessage.textContent = String(message || "");

        dom.pageMessage.className = "page-message";

        if (message) {
            dom.pageMessage.classList.add("show");

            if (type) {
                dom.pageMessage.dataset.type = type;
            } else {
                delete dom.pageMessage.dataset.type;
            }
        } else {
            delete dom.pageMessage.dataset.type;
        }
    }

    let toastTimer = null;

    function showToast(message, duration = 3200) {
        if (!dom.toast) {
            return;
        }

        dom.toast.textContent = String(message || "");
        dom.toast.classList.add("show");

        window.clearTimeout(toastTimer);

        toastTimer = window.setTimeout(() => {
            dom.toast.classList.remove("show");
        }, duration);
    }

    function setSystemStatus(text, isError = false) {
        if (!dom.systemStatusText) {
            return;
        }

        dom.systemStatusText.textContent = text;

        if (dom.systemStatus) {
            dom.systemStatus.classList.toggle("error", Boolean(isError));
        }
    }

    const MUTATION_METHODS = new Set([
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
    ]);

    async function loadAssistantCsrfToken(forceRefresh = false) {
        if (!forceRefresh && state.csrfToken) {
            return state.csrfToken;
        }

        if (!forceRefresh && state.csrfTokenPromise) {
            return state.csrfTokenPromise;
        }

        state.csrfTokenPromise = (async () => {
            const response = await fetch(
                `${API_BASE}/security/csrf-token`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            let payload = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }

            if (!response.ok || !payload?.success || !payload?.csrfToken) {
                const error = new Error(
                    payload?.message ||
                    `Unable to initialize dashboard security (HTTP ${response.status}).`
                );
                error.status = response.status;
                error.payload = payload;
                throw error;
            }

            state.csrfToken = String(payload.csrfToken);
            return state.csrfToken;
        })();

        try {
            return await state.csrfTokenPromise;
        } finally {
            state.csrfTokenPromise = null;
        }
    }

    async function fetchJSON(url, options = {}, retryAfterCsrf = true) {
        const method = String(options.method || "GET").toUpperCase();
        let csrfToken = null;

        if (MUTATION_METHODS.has(method)) {
            csrfToken = await loadAssistantCsrfToken();
        }

        const headers = {
            Accept: "application/json",
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(MUTATION_METHODS.has(method) && csrfToken
                ? { "X-CSRF-Token": csrfToken }
                : {}),
            ...(options.headers || {})
        };

        let response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            method,
            headers
        });

        let payload = null;

        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (
            response.status === 403 &&
            retryAfterCsrf &&
            MUTATION_METHODS.has(method) &&
            [
                "CSRF_TOKEN_MISSING",
                "CSRF_TOKEN_INVALID"
            ].includes(payload?.code)
        ) {
            state.csrfToken = null;
            csrfToken = await loadAssistantCsrfToken(true);

            response = await fetch(url, {
                credentials: "same-origin",
                ...options,
                method,
                headers: {
                    ...headers,
                    "X-CSRF-Token": csrfToken
                }
            });

            try {
                payload = await response.json();
            } catch {
                payload = null;
            }
        }

        if (!response.ok || !payload?.success) {
            const message =
                payload?.message ||
                `Request failed with HTTP ${response.status}.`;

            const error = new Error(message);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function handleUnauthorized(error) {
        if (error?.status === 401) {
            state.csrfToken = null;
            window.location.replace("/login/");
            return true;
        }

        if (error?.status === 403) {
            showPageMessage(
                error.message ||
                    "You are not authorized to access this dashboard.",
                "error"
            );
            setSystemStatus("Access denied", true);
            return true;
        }

        return false;
    }

    function setActiveTab(tabName) {
        const validTabs = new Set(
            Array.from(dom.panels).map(panel => panel.dataset.panel)
        );

        if (!validTabs.has(tabName)) {
            tabName = "overview";
        }

        dom.navButtons.forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.tab === tabName
            );
        });

        dom.panels.forEach(panel => {
            const active = panel.dataset.panel === tabName;
            panel.hidden = !active;
            panel.classList.toggle("active", active);
        });

        closeMobileNavigation();

        const titles = {
            overview: "Assistant Commissioner",
            wards: "Wards",
            inspectors: "Sanitary Inspectors",
            operations: "Operational Supervision",
            reports: "Reports & Analytics",
            profile: "Profile"
        };

        if (dom.pageTitle) {
            dom.pageTitle.textContent =
                titles[tabName] || "Assistant Commissioner";
        }
    }

    function openMobileNavigation() {
        if (!dom.app) {
            return;
        }

        dom.app.classList.add("mobile-nav-open");
        dom.mobileMenuButton?.setAttribute("aria-expanded", "true");
        dom.mobileBackdrop?.setAttribute("aria-hidden", "false");
    }

    function closeMobileNavigation() {
        if (!dom.app) {
            return;
        }

        dom.app.classList.remove("mobile-nav-open");
        dom.mobileMenuButton?.setAttribute("aria-expanded", "false");
        dom.mobileBackdrop?.setAttribute("aria-hidden", "true");
    }

    function toggleSidebar() {
        if (!dom.app) {
            return;
        }

        const collapsed =
            dom.app.classList.toggle("sidebar-collapsed");

        dom.sidebarToggleButton?.setAttribute(
            "aria-expanded",
            String(!collapsed)
        );

        const svgPath =
            dom.sidebarToggleButton?.querySelector("path");

        if (svgPath) {
            svgPath.setAttribute(
                "d",
                collapsed
                    ? "M9 6l6 6-6 6"
                    : "M15 6l-6 6 6 6"
            );
        }

        window.setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
        }, 270);
    }

    function renderScope(scope) {
        if (!scope) {
            return;
        }

        state.currentScope = scope;

        const divisionName =
            cleanText(scope.division_name);

        const officeLocation =
            cleanText(scope.office_location, "Office location not recorded.");

        const divisionCode =
            cleanText(scope.division_code);

        if (dom.assignedDivisionName) {
            dom.assignedDivisionName.textContent = divisionName;
        }

        if (dom.assignedDivisionLocation) {
            dom.assignedDivisionLocation.textContent =
                officeLocation;
        }

        if (dom.headerAssistantDivision) {
            dom.headerAssistantDivision.textContent =
                `${divisionName} • ${divisionCode}`;
        }

        if (dom.overviewDivisionBadge) {
            dom.overviewDivisionBadge.textContent =
                `Division ${divisionCode}`;
        }

        if (dom.overviewSubtitle) {
            dom.overviewSubtitle.textContent =
                `Monitor wards, sanitary inspectors and current operational activity within ${divisionName}.`;
        }
    }

    function renderOverview(data) {
        const overview = data?.overview || {};

        renderScope(data?.scope);

        if (dom.kpiWardCount) {
            dom.kpiWardCount.textContent =
                numberOrZero(overview.total_wards);
        }

        if (dom.kpiInspectorCount) {
            dom.kpiInspectorCount.textContent =
                numberOrZero(overview.total_inspectors);
        }

        if (dom.kpiActiveRouteCount) {
            dom.kpiActiveRouteCount.textContent =
                numberOrZero(overview.active_routes);
        }

        if (dom.kpiOpenComplaintCount) {
            dom.kpiOpenComplaintCount.textContent =
                numberOrZero(overview.unresolved_complaints);
        }

        if (dom.overviewDivisionName) {
            dom.overviewDivisionName.textContent =
                cleanText(data?.scope?.division_name);
        }

        if (dom.overviewDivisionCode) {
            dom.overviewDivisionCode.textContent =
                cleanText(data?.scope?.division_code);
        }

        if (dom.overviewDivisionOffice) {
            dom.overviewDivisionOffice.textContent =
                cleanText(data?.scope?.office_location);
        }

        if (dom.overviewDivisionStatus) {
            dom.overviewDivisionStatus.textContent =
                data?.overview?.division_exists
                    ? "Active"
                    : "Unavailable";
        }
    }


    /* =========================================================
       ASSISTANT COMMISSIONER DIVISION OVERVIEW MAP
    ========================================================= */

    function clearOverviewMapLayers() {
        clearDivisionAreaEditorLayers();

        [
            state.overviewMapLayers,
            state.overviewMapRoutes,
            state.overviewMapWards,
            state.overviewMapInspectorAreas,
            state.overviewMapVehicles
        ].forEach(layerCollection => {
            layerCollection.forEach(layer => {
                try {
                    if (
                        state.overviewMap &&
                        state.overviewMap.hasLayer(layer)
                    ) {
                        state.overviewMap.removeLayer(layer);
                    }
                } catch (error) {
                    console.warn(
                        "Overview map layer cleanup failed:",
                        error
                    );
                }
            });

            layerCollection.length = 0;
        });
    }

    function routeColorByStatus(status) {
        switch (String(status || "").toLowerCase()) {
            case "delayed":
                return "#e09c19";
            case "completed":
                return "#71916a";
            default:
                return "#35a24c";
        }
    }

    function validLatLng(point) {
        return (
            Array.isArray(point) &&
            point.length >= 2 &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1])) &&
            Number(point[0]) >= -90 &&
            Number(point[0]) <= 90 &&
            Number(point[1]) >= -180 &&
            Number(point[1]) <= 180
        );
    }

    function validKolhapurMapPoint(point) {
        if (!validLatLng(point)) {
            return false;
        }

        const lat = Number(point[0]);
        const lng = Number(point[1]);

        return (
            lat >= KOLHAPUR_VIEW_BOUNDS.minLat &&
            lat <= KOLHAPUR_VIEW_BOUNDS.maxLat &&
            lng >= KOLHAPUR_VIEW_BOUNDS.minLng &&
            lng <= KOLHAPUR_VIEW_BOUNDS.maxLng
        );
    }

    const KOLHAPUR_OPERATIONAL_LIMITS = {
        minLat: 16.50,
        maxLat: 16.90,
        minLng: 74.00,
        maxLng: 74.50
    };

    function validOperationalMapPoint(point) {
        if (!validLatLng(point)) {
            return false;
        }

        const lat = Number(point[0]);
        const lng = Number(point[1]);

        return (
            lat >= KOLHAPUR_OPERATIONAL_LIMITS.minLat &&
            lat <= KOLHAPUR_OPERATIONAL_LIMITS.maxLat &&
            lng >= KOLHAPUR_OPERATIONAL_LIMITS.minLng &&
            lng <= KOLHAPUR_OPERATIONAL_LIMITS.maxLng
        );
    }

    function clonePolygon(points) {
        return Array.isArray(points)
            ? points
                .filter(validOperationalMapPoint)
                .map(point => [
                    Number(point[0]),
                    Number(point[1])
                ])
            : [];
    }

    function polygonContainsPoint(point, polygon) {
        if (!Array.isArray(polygon) || polygon.length < 3) {
            return false;
        }

        const lat = Number(point?.[0]);
        const lng = Number(point?.[1]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return false;
        }

        if (pointOnAssistantBoundary(point, polygon)) {
            return true;
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
                    ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

                if (lng < intersection) {
                    inside = !inside;
                }
            }
        }

        return inside;
    }

    function validateEditablePolygon(points, containingPolygon = null) {
        if (!Array.isArray(points) || points.length < 3) {
            return {
                valid: false,
                message: "At least three boundary points are required."
            };
        }

        const seen = new Set();

        for (const point of points) {
            if (!validOperationalMapPoint(point)) {
                return {
                    valid: false,
                    message: "Every point must remain inside the configured Kolhapur application safety range."
                };
            }

            const key = `${Number(point[0]).toFixed(7)},${Number(point[1]).toFixed(7)}`;
            if (seen.has(key)) {
                return {
                    valid: false,
                    message: "The same boundary point cannot be used twice."
                };
            }
            seen.add(key);

            if (
                Array.isArray(containingPolygon) &&
                containingPolygon.length >= 3 &&
                !polygonContainsPoint(point, containingPolygon)
            ) {
                return {
                    valid: false,
                    message: "The polygon must remain completely inside the saved parent boundary."
                };
            }
        }

        if (polygonSelfIntersectsAssistant(points)) {
            return {
                valid: false,
                message: "The boundary lines cross each other. Reshape the polygon without crossing an earlier edge."
            };
        }

        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];
            area +=
                Number(current[1]) * Number(next[0]) -
                Number(next[1]) * Number(current[0]);
        }

        if (Math.abs(area) / 2 <= 1e-12) {
            return {
                valid: false,
                message: "The selected points do not enclose a usable area."
            };
        }

        if (
            Array.isArray(containingPolygon) &&
            containingPolygon.length >= 3
        ) {
            for (let i = 0; i < points.length; i++) {
                const a = points[i];
                const b = points[(i + 1) % points.length];

                for (const fraction of [0.25, 0.5, 0.75]) {
                    const sample = [
                        Number(a[0]) +
                            (Number(b[0]) - Number(a[0])) * fraction,
                        Number(a[1]) +
                            (Number(b[1]) - Number(a[1])) * fraction
                    ];

                    if (!polygonContainsPoint(sample, containingPolygon)) {
                        return {
                            valid: false,
                            message: "A boundary edge leaves the saved parent boundary."
                        };
                    }
                }
            }
        }

        return {
            valid: true,
            message: "Polygon is valid."
        };
    }

    function distancePointToSegmentSquared(point, a, b) {
        const px = Number(point?.[0]);
        const py = Number(point?.[1]);
        const ax = Number(a?.[0]);
        const ay = Number(a?.[1]);
        const bx = Number(b?.[0]);
        const by = Number(b?.[1]);

        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared <= 1e-18) {
            const ex = px - ax;
            const ey = py - ay;
            return ex * ex + ey * ey;
        }

        const t = Math.max(
            0,
            Math.min(
                1,
                ((px - ax) * dx + (py - ay) * dy) /
                    lengthSquared
            )
        );

        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const ex = px - cx;
        const ey = py - cy;

        return ex * ex + ey * ey;
    }

    function createEditableVertexIcon(type = "division") {
        const className =
            type === "ward"
                ? "ward-area-vertex-icon"
                : "division-area-vertex-icon";

        const innerClass =
            type === "ward"
                ? "ward-area-vertex"
                : "division-area-vertex";

        return L.divIcon({
            className,
            html: `<div class="${innerClass}" aria-hidden="true"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
    }

    function getDivisionOperationalAreaFromState() {
        const area =
            state.divisionOperationalArea ||
            state.mapData?.scope?.operational_area ||
            state.currentScope?.operational_area ||
            null;

        return Array.isArray(area?.polygon) && area.polygon.length >= 3
            ? area
            : null;
    }

    function updateDivisionAreaUi() {
        const hasArea =
            Array.isArray(state.divisionAreaDraft) &&
            state.divisionAreaDraft.length >= 3;

        if (dom.overviewMapEditDivisionButton) {
            dom.overviewMapEditDivisionButton.hidden =
                state.divisionAreaEditing;
        }

        if (dom.overviewMapSaveDivisionButton) {
            dom.overviewMapSaveDivisionButton.hidden =
                !state.divisionAreaEditing;
            dom.overviewMapSaveDivisionButton.disabled =
                !hasArea;
        }

        if (dom.overviewMapCancelDivisionButton) {
            dom.overviewMapCancelDivisionButton.hidden =
                !state.divisionAreaEditing;
        }

        if (dom.overviewMapAreaStatus) {
            if (state.divisionAreaEditing) {
                dom.overviewMapAreaStatus.textContent =
                    hasArea
                        ? `Editing ${state.divisionAreaDraft.length}-point Division working area • drag handles or click near an edge to add a point`
                        : "Editing Division working area • click the map to add at least 3 points";
            } else if (getDivisionOperationalAreaFromState()) {
                dom.overviewMapAreaStatus.textContent =
                    "Division working area: AC-defined";
            } else {
                dom.overviewMapAreaStatus.textContent =
                    "Division working area: not defined";
            }
        }
    }

    function clearDivisionAreaEditorLayers() {
        state.divisionAreaEditorLayers.forEach(layer => {
            try {
                layer.remove();
            } catch (error) {
                console.warn(
                    "Division area editor layer cleanup failed:",
                    error
                );
            }
        });
        state.divisionAreaEditorLayers.length = 0;
    }

    function renderDivisionAreaEditor() {
        if (!state.overviewMap) {
            return;
        }

        clearDivisionAreaEditorLayers();

        if (!state.divisionAreaEditing) {
            return;
        }

        const points = state.divisionAreaDraft;

        if (points.length >= 2) {
            const line = L.polyline(
                points,
                {
                    color: "#4f7d45",
                    weight: 3,
                    dashArray: "8 6",
                    opacity: 0.95
                }
            ).addTo(state.overviewMap);
            state.divisionAreaEditorLayers.push(line);
        }

        if (points.length >= 3) {
            const polygon = L.polygon(
                points,
                {
                    color: "#315b27",
                    weight: 2,
                    dashArray: "6 5",
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.15
                }
            ).addTo(state.overviewMap);

            polygon.bindTooltip(
                "AC-defined Division working area • not an official KMC boundary",
                { sticky: true }
            );

            state.divisionAreaEditorLayers.push(polygon);
        }

        points.forEach((point, index) => {
            const marker = L.marker(
                point,
                {
                    icon: createEditableVertexIcon("division"),
                    draggable: true,
                    keyboard: false
                }
            ).addTo(state.overviewMap);

            marker.bindTooltip(
                `Division area point ${index + 1} • drag to edit`,
                { direction: "top" }
            );

            marker.on("click", event => {
                L.DomEvent.stopPropagation(event);
            });

            marker.on("dragend", event => {
                const candidate = state.divisionAreaDraft.map(item => [...item]);
                const dragged = event.target.getLatLng();
                candidate[index] = [
                    Number(dragged.lat),
                    Number(dragged.lng)
                ];

                const validation = validateEditablePolygon(candidate);

                if (!validation.valid) {
                    marker.setLatLng(state.divisionAreaDraft[index]);
                    showToast(validation.message);
                    setDivisionAreaStatus(validation.message, "error");
                    return;
                }

                state.divisionAreaDraft = candidate;
                renderDivisionAreaEditor();
                updateDivisionAreaUi();
            });

            state.divisionAreaEditorLayers.push(marker);
        });
    }

    function setDivisionAreaStatus(message, tone = "neutral") {
        if (!dom.overviewMapAreaStatus) {
            return;
        }

        dom.overviewMapAreaStatus.textContent = String(message || "");
        dom.overviewMapAreaStatus.dataset.tone = tone;
    }

    function findNearestDivisionAreaEdge(mapPoint) {
        const points = state.divisionAreaDraft;
        if (!Array.isArray(points) || points.length < 3 || !state.overviewMap) {
            return -1;
        }

        const clicked = state.overviewMap.latLngToContainerPoint(mapPoint);
        let closestEdge = -1;
        let closestDistance = Infinity;

        for (let i = 0; i < points.length; i++) {
            const a = state.overviewMap.latLngToContainerPoint(
                L.latLng(points[i][0], points[i][1])
            );
            const b = state.overviewMap.latLngToContainerPoint(
                L.latLng(points[(i + 1) % points.length][0], points[(i + 1) % points.length][1])
            );

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSquared = dx * dx + dy * dy;

            const t = lengthSquared <= 1e-12
                ? 0
                : Math.max(
                    0,
                    Math.min(
                        1,
                        ((clicked.x - a.x) * dx +
                            (clicked.y - a.y) * dy) /
                            lengthSquared
                    )
                );

            const projection = {
                x: a.x + t * dx,
                y: a.y + t * dy
            };

            const distance = Math.hypot(
                clicked.x - projection.x,
                clicked.y - projection.y
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEdge = i;
            }
        }

        return closestDistance <= 34 ? closestEdge : -1;
    }

    function handleDivisionAreaMapClick(event) {
        if (!state.divisionAreaEditing) {
            return;
        }

        const point = [
            Number(event.latlng.lat),
            Number(event.latlng.lng)
        ];

        if (!validOperationalMapPoint(point)) {
            setDivisionAreaStatus(
                "That point is outside the configured Kolhapur application safety range.",
                "error"
            );
            return;
        }

        if (state.divisionAreaDraft.length < 3) {
            state.divisionAreaDraft.push(point);
            renderDivisionAreaEditor();
            updateDivisionAreaUi();
            setDivisionAreaStatus(
                `${state.divisionAreaDraft.length} point(s) added. Continue until the Division area is closed, then Save Area.`,
                "neutral"
            );
            return;
        }

        const edgeIndex = findNearestDivisionAreaEdge(event.latlng);

        if (edgeIndex < 0) {
            setDivisionAreaStatus(
                "Click directly near the Division boundary to add a new vertex, or drag an existing handle to reshape it.",
                "neutral"
            );
            return;
        }

        state.divisionAreaDraft.splice(edgeIndex + 1, 0, point);

        const validation = validateEditablePolygon(state.divisionAreaDraft);
        if (!validation.valid) {
            state.divisionAreaDraft.splice(edgeIndex + 1, 1);
            setDivisionAreaStatus(validation.message, "error");
            return;
        }

        renderDivisionAreaEditor();
        updateDivisionAreaUi();
        setDivisionAreaStatus(
            "Boundary point added. Drag it outward or reshape nearby points to increase the Division working area.",
            "success"
        );
    }

    function fitMapToPolygon(map, polygon, maxZoom = 15) {
        if (!map || !Array.isArray(polygon) || polygon.length < 3) {
            return;
        }

        const validPoints = polygon.filter(validOperationalMapPoint);
        if (validPoints.length < 3) {
            return;
        }

        map.fitBounds(
            L.latLngBounds(validPoints).pad(0.10),
            { maxZoom }
        );
    }

    async function beginDivisionAreaEditing() {
        const current = getDivisionOperationalAreaFromState();

        state.divisionAreaEditing = true;
        state.divisionAreaDraft = current
            ? clonePolygon(current.polygon)
            : [];

        updateDivisionAreaUi();
        await refreshOverviewMap();

        if (state.divisionAreaDraft.length >= 3) {
            fitMapToPolygon(
                state.overviewMap,
                state.divisionAreaDraft,
                15
            );
        } else {
            state.overviewMap?.setView(
                KOLHAPUR_MAP_CENTER,
                KOLHAPUR_MAP_ZOOM
            );
        }

        state.overviewMap?.invalidateSize();
        renderDivisionAreaEditor();
        updateDivisionAreaUi();
        setDivisionAreaStatus(
            state.divisionAreaDraft.length >= 3
                ? "Editing AC-defined Division working area. Drag handles to reshape it; click near an edge to add a new point and extend the area."
                : "No Division working area is saved yet. Click the map to add points, then Save Area.",
            "success"
        );
    }

    async function cancelDivisionAreaEditing() {
        state.divisionAreaEditing = false;
        state.divisionAreaDraft = [];
        await refreshOverviewMap();
        updateDivisionAreaUi();
    }

    async function saveDivisionArea(event) {
        event?.preventDefault?.();

        const validation = validateEditablePolygon(
            state.divisionAreaDraft
        );

        if (!validation.valid) {
            setDivisionAreaStatus(validation.message, "error");
            showToast(validation.message);
            return;
        }

        const button = dom.overviewMapSaveDivisionButton;
        if (button) {
            button.disabled = true;
        }

        try {
            await fetchJSON(`${API_BASE}/division-area`, {
                method: "PUT",
                body: JSON.stringify({
                    operational_area: {
                        polygon: state.divisionAreaDraft
                    }
                })
            });

            state.divisionAreaEditing = false;
            state.divisionOperationalArea = {
                source: "assistant_defined",
                polygon: clonePolygon(state.divisionAreaDraft)
            };
            state.divisionAreaDraft = [];

            await Promise.all([
                loadMapData(),
                loadWards()
            ]);

            updateDivisionAreaUi();
            showToast("Division working area saved successfully.");
        } catch (error) {
            console.error(
                "Assistant Commissioner division area save error:",
                error
            );

            if (handleUnauthorized(error)) {
                return;
            }

            setDivisionAreaStatus(
                error.message ||
                    "Unable to save the Division working area.",
                "error"
            );
        } finally {
            if (button) {
                button.disabled = false;
            }
            updateDivisionAreaUi();
        }
    }

    function setupOverviewDivisionAreaEditing() {
        if (!state.overviewMap) {
            return;
        }

        state.overviewMap.on(
            "click",
            handleDivisionAreaMapClick
        );
    }

    function updateFullscreenButton(button, target, openLabel, closeLabel) {
        if (!button || !target) {
            return;
        }

        const active =
            document.fullscreenElement === target ||
            target.classList.contains("map-fullscreen-fallback");

        button.textContent = active ? closeLabel : openLabel;
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute(
            "aria-label",
            active ? closeLabel : openLabel
        );
    }

    async function toggleMapFullscreen(target, button, openLabel, closeLabel) {
        if (!target) {
            return;
        }

        const active =
            document.fullscreenElement === target ||
            target.classList.contains("map-fullscreen-fallback");

        try {
            if (active) {
                if (document.fullscreenElement === target) {
                    await document.exitFullscreen();
                } else {
                    target.classList.remove("map-fullscreen-fallback");
                }
            } else if (target.requestFullscreen) {
                await target.requestFullscreen();
            } else {
                target.classList.add("map-fullscreen-fallback");
            }
        } catch (error) {
            console.warn(
                "Map fullscreen request failed; using fallback:",
                error
            );
            target.classList.toggle("map-fullscreen-fallback");
        }

        updateFullscreenButton(
            button,
            target,
            openLabel,
            closeLabel
        );

        window.setTimeout(() => {
            state.overviewMap?.invalidateSize();
            state.assignmentMap?.invalidateSize();
            state.wardCreateMap?.invalidateSize();
            state.wardBoundaryEditMap?.invalidateSize();
        }, 150);
    }

    function syncFullscreenUi() {
        const targets = [
            [
                dom.overviewMapFullscreenButton,
                document.querySelector(".overview-map-card"),
                "Open overview map in full screen",
                "Exit overview map full screen"
            ],
            [
                dom.assignmentMapFullscreenButton,
                document.querySelector(".assignment-map-section"),
                "Open Inspector assignment map in full screen",
                "Exit Inspector assignment map full screen"
            ],
            [
                dom.wardCreateMapFullscreenButton,
                document.querySelector(".ward-create-map-section"),
                "Open ward boundary map in full screen",
                "Exit ward boundary map full screen"
            ],
            [
                dom.editWardBoundaryMapFullscreenButton,
                document.querySelector(".ward-boundary-edit-map-section"),
                "Open ward boundary editor in full screen",
                "Exit ward boundary editor full screen"
            ]
        ];

        targets.forEach(([button, target, openLabel, closeLabel]) => {
            updateFullscreenButton(
                button,
                target,
                openLabel,
                closeLabel
            );
        });
    }

        function normalizeMapStops(route) {
        return (Array.isArray(route?.stops)
            ? route.stops
            : [])
            .filter(
                stop =>
                    Number.isFinite(Number(stop.latitude)) &&
                    Number.isFinite(Number(stop.longitude))
            )
            .sort(
                (a, b) =>
                    Number(a.order || 0) -
                    Number(b.order || 0)
            );
    }

    function getOverviewVehicleGpsState(vehicle, now = Date.now()) {
        const rawTimestamp = vehicle?.last_location_at;
        if (!rawTimestamp) return "unknown";

        const normalizedTimestamp = String(rawTimestamp).trim();
        const parseableTimestamp = normalizedTimestamp.includes("T")
            ? normalizedTimestamp
            : normalizedTimestamp.replace(" ", "T");
        const timestamp = Date.parse(parseableTimestamp);
        if (!Number.isFinite(timestamp)) return "unknown";

        const ageMs = now - timestamp;
        if (ageMs < -30000) return "unknown";
        if (ageMs <= 30000) return "live";
        if (ageMs <= 120000) return "delayed";
        return "stale";
    }

    function createOverviewVehicleIcon(vehicle) {
        const gpsState = getOverviewVehicleGpsState(vehicle);
        const markerClass = `custom-truck-marker${gpsState === "live" ? " gps-live" : gpsState === "delayed" ? " gps-delayed" : gpsState === "stale" ? " gps-stale" : " gps-unknown"}`;
        const accessibleLabel = gpsState === "live"
            ? "Truck with live GPS location"
            : gpsState === "delayed"
                ? "Truck with delayed GPS location"
                : gpsState === "stale"
                    ? "Truck with stale GPS location"
                    : "Truck, GPS status unavailable";

        return L.divIcon({
            className: "",
            html: `
                <div class="${markerClass}" data-gps-state="${gpsState}" role="img" aria-label="${accessibleLabel}">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
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

    function createOverviewVehiclePopup(route) {
        const vehicle = route?.vehicle;
        const driver = route?.driver;

        return `
            <div class="truck-popup">
                <strong>
                    ${escapeHTML(
                        vehicle?.vehicle_number || "Vehicle"
                    )}
                </strong>

                <span>
                    Route:
                    ${escapeHTML(route?.code || "—")}
                </span>

                <span>
                    Ward:
                    ${escapeHTML(
                        route?.ward?.name ||
                        `Ward ${route?.ward?.number ?? "—"}`
                    )}
                </span>

                <span>
                    Driver:
                    ${escapeHTML(
                        driver?.name ||
                        driver?.employee_id ||
                        "Unassigned"
                    )}
                </span>

                <span>
                    Status:
                    ${escapeHTML(
                        vehicle?.status || route?.status || "—"
                    )}
                </span>

                <span>
                    Last GPS update:
                    ${escapeHTML(
                        vehicle?.last_location_at || "—"
                    )}
                </span>
            </div>
        `;
    }

    function createOverviewOfficeIcon() {
        return L.divIcon({
            className: "",
            html: `
                <div class="division-office-marker" aria-hidden="true">
                    <span></span>
                </div>
            `,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            popupAnchor: [0, -11]
        });
    }

    function setupOverviewMap() {
        if (
            state.overviewMap ||
            !dom.overviewTrackingMap ||
            typeof window.L === "undefined"
        ) {
            return;
        }

        try {
            state.overviewMap = L.map(
                dom.overviewTrackingMap,
                {
                    zoomControl: true,
                    scrollWheelZoom: false,
                    attributionControl: true
                }
            );

            state.overviewMap.setView(
                KOLHAPUR_MAP_CENTER,
                KOLHAPUR_MAP_ZOOM
            );

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,
                    attribution:
                        "&copy; OpenStreetMap contributors"
                }
            ).addTo(state.overviewMap);

            setupOverviewDivisionAreaEditing();

        } catch (error) {
            console.error(
                "Assistant overview map initialization failed:",
                error
            );

            state.overviewMap = null;
        }
    }

    async function fetchOverviewRoadGeometry(points) {
        if (!Array.isArray(points) || points.length < 2) {
            return null;
        }

        const key = points
            .map(point => `${point[0].toFixed(6)},${point[1].toFixed(6)}`)
            .join("|");

        if (state.overviewMapRoadGeometryCache.has(key)) {
            return state.overviewMapRoadGeometryCache.get(key);
        }

        const coordinates =
            points
                .map(
                    point =>
                        `${Number(point[1])},${Number(point[0])}`
                )
                .join(";");

        try {
            const response = await fetch(
                "https://router.project-osrm.org/route/v1/driving/" +
                coordinates +
                "?overview=full&geometries=geojson&steps=false",
                {
                    method: "GET",
                    credentials: "omit"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `OSRM request failed with HTTP ${response.status}.`
                );
            }

            const payload = await response.json();

            const geometry =
                payload?.routes?.[0]?.geometry?.coordinates;

            if (
                !Array.isArray(geometry) ||
                geometry.length < 2
            ) {
                throw new Error(
                    "OSRM returned no usable route geometry."
                );
            }

            const latLng =
                geometry.map(
                    point => [
                        Number(point[1]),
                        Number(point[0])
                    ]
                );

            state.overviewMapRoadGeometryCache.set(
                key,
                latLng
            );

            return latLng;

        } catch (error) {
            console.warn(
                "Assistant overview road routing failed:",
                error
            );

            return null;
        }
    }

    function renderOverviewMapWards() {
        if (
            !state.overviewMap ||
            !state.overviewMapWardVisibility
        ) {
            return;
        }

        const wards =
            Array.isArray(state.mapData?.wards)
                ? state.mapData.wards
                : [];

        wards.forEach(ward => {
            const polygon =
                ward?.boundary?.polygon;

            if (
                !Array.isArray(polygon) ||
                polygon.length < 3 ||
                polygon.some(point => !validOperationalMapPoint(point))
            ) {
                return;
            }

            const source =
                ward?.boundary?.source || "unknown";

            const layer =
                L.polygon(
                    polygon,
                    {
                        color: source === "official"
                            ? "#6e875f"
                            : "#9aa694",
                        weight: 2,
                        fillColor: source === "official"
                            ? "#d6e2ce"
                            : "#edf1e8",
                        fillOpacity: 0.12,
                        dashArray: source === "official"
                            ? "5 4"
                            : "7 6"
                    }
                ).addTo(
                    state.overviewMap
                );

            layer.bindPopup(
                `
                    <strong>
                        ${escapeHTML(
                            `Ward ${ward.number}`
                        )}
                    </strong>
                    <br>
                    ${escapeHTML(
                        ward.name ||
                        ward.code ||
                        "Ward"
                    )}
                    <br>
                    <small>
                        ${source === "official"
                            ? "Official verified ward boundary"
                            : source === "assistant_defined"
                                ? "AC-defined operational ward boundary"
                                : source === "development"
                                    ? "Presentation/demo ward boundary"
                                    : "Unverified ward boundary"}
                    </small>
                `
            );

            state.overviewMapWards.push(layer);
        });
    }

    function renderOverviewMapInspectorAreas() {
        if (!state.overviewMap) {
            return;
        }

        const inspectors = Array.isArray(state.inspectors)
            ? state.inspectors
            : [];

        inspectors.forEach(inspector => {
            const polygon = inspector?.operational_area?.polygon;

            if (
                !Array.isArray(polygon) ||
                polygon.length < 3 ||
                polygon.some(point => !validOperationalMapPoint(point))
            ) {
                return;
            }

            const ward = inspector?.scope || {};
            const layer = L.polygon(
                polygon,
                {
                    color: "#245b36",
                    weight: 4,
                    opacity: 0.95,
                    fillColor: "#78a96b",
                    fillOpacity: 0.24
                }
            ).addTo(state.overviewMap);

            layer.bindTooltip(
                `${escapeHTML(inspector.full_name || inspector.email || "Inspector")} • Inspector assigned operational area`,
                { sticky: true }
            );

            layer.bindPopup(
                `
                    <div class="truck-popup">
                        <strong>${escapeHTML(inspector.full_name || inspector.email || "Inspector")}</strong>
                        <span>Ward: ${escapeHTML(
                            ward.ward_name
                                ? `Ward ${ward.ward_number}: ${ward.ward_name}`
                                : "Unassigned"
                        )}</span>
                        <span>Layer: Inspector assigned operational area</span>
                        <small>This is the Inspector's saved operational area. It is shown separately from the Ward boundary and is not the Ward boundary itself.</small>
                    </div>
                `
            );

            state.overviewMapInspectorAreas.push(layer);
        });
    }

    async function renderOverviewMapRoutes() {
        if (
            !state.overviewMap ||
            !state.overviewMapRouteVisibility
        ) {
            return;
        }

        const routes =
            Array.isArray(state.mapData?.routes)
                ? state.mapData.routes
                : [];

        await Promise.all(
            routes.map(
                async route => {
                    const stops =
                        normalizeMapStops(route);

                    if (stops.length < 2) {
                        if (stops.length === 1) {
                            const stop = stops[0];
                            const point = [
                                Number(stop.latitude),
                                Number(stop.longitude)
                            ];

                            const marker =
                                L.circleMarker(
                                    point,
                                    {
                                        radius: 5,
                                        color:
                                            routeColorByStatus(route.status),
                                        fillColor: "#ffffff",
                                        fillOpacity: 1,
                                        weight: 2
                                    }
                                ).addTo(
                                    state.overviewMap
                                );

                            marker.bindTooltip(
                                `${escapeHTML(
                                    route.code || `Route ${route.id}`
                                )} • Stop ${Number(
                                    normalizeMapStops(route)[0].order || 1
                                )}`
                            );

                            state.overviewMapRoutes.push(
                                marker
                            );
                        }

                        return;
                    }

                    const points =
                        stops.map(stop => [
                            Number(stop.latitude),
                            Number(stop.longitude)
                        ]);

                    const roadGeometry =
                        await fetchOverviewRoadGeometry(
                            points
                        );

                    const linePoints =
                        Array.isArray(roadGeometry) &&
                        roadGeometry.length >= 2
                            ? roadGeometry
                            : points;

                    const line =
                        L.polyline(
                            linePoints,
                            {
                                color:
                                    routeColorByStatus(
                                        route.status
                                    ),
                                weight: 5,
                                opacity: 0.88,
                                lineCap: "round",
                                lineJoin: "round"
                            }
                        ).addTo(
                            state.overviewMap
                        );

                    line.bindPopup(
                        `
                            <div class="truck-popup">
                                <strong>
                                    ${escapeHTML(
                                        route.code ||
                                        `Route ${route.id}`
                                    )}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        route.name ||
                                        "Collection route"
                                    )}
                                </span>

                                <span>
                                    Ward:
                                    ${escapeHTML(
                                        route?.ward?.name || "—"
                                    )}
                                </span>

                                <span>
                                    Status:
                                    ${escapeHTML(
                                        route.status || "—"
                                    )}
                                </span>

                                <span>
                                    Stops:
                                    ${Number(
                                        route.total_stops || 0
                                    )}
                                </span>
                            </div>
                        `
                    );

                    state.overviewMapRoutes.push(line);

                    stops.forEach(
                        (stop, index) => {
                            const marker =
                                L.circleMarker(
                                    [
                                        Number(stop.latitude),
                                        Number(stop.longitude)
                                    ],
                                    {
                                        radius: 5,
                                        color:
                                            routeColorByStatus(
                                                route.status
                                            ),
                                        fillColor: "#ffffff",
                                        fillOpacity: 1,
                                        weight: 2
                                    }
                                ).addTo(
                                    state.overviewMap
                                );

                            marker.bindTooltip(
                                `Stop ${Number(
                                    stop.order || index + 1
                                )}: ${escapeHTML(
                                    stop.name ||
                                    "Collection point"
                                )}`
                            );

                            state.overviewMapRoutes.push(
                                marker
                            );
                        }
                    );
                }
            )
        );
    }

    function renderOverviewMapVehicles() {
        if (
            !state.overviewMap ||
            !state.overviewMapVehicleVisibility
        ) {
            return;
        }

        const routes =
            Array.isArray(state.mapData?.routes)
                ? state.mapData.routes
                : [];

        routes.forEach(route => {
            const vehicle =
                route?.vehicle;

            if (
                !vehicle ||
                !validLatLng([
                    vehicle.latitude,
                    vehicle.longitude
                ])
            ) {
                return;
            }

            const icon = createOverviewVehicleIcon(vehicle);
            const marker =
                L.marker(
                    [
                        Number(vehicle.latitude),
                        Number(vehicle.longitude)
                    ],
                    { icon }
                ).addTo(
                    state.overviewMap
                );

            marker.bindPopup(
                createOverviewVehiclePopup(route)
            );

            state.overviewMapVehicles.push(marker);
        });
    }

    function renderOverviewMapOfficeAndDivision() {
        if (!state.overviewMap) {
            return [];
        }

        const boundsPoints = [];

        const office =
            state.mapData?.scope?.office_point;

        if (
            office &&
            validOperationalMapPoint([
                office.latitude,
                office.longitude
            ])
        ) {
            const marker =
                L.marker(
                    [
                        Number(office.latitude),
                        Number(office.longitude)
                    ],
                    {
                        icon:
                            createOverviewOfficeIcon()
                    }
                ).addTo(
                    state.overviewMap
                );

            marker.bindPopup(
                `
                    <div class="truck-popup">
                        <strong>
                            ${escapeHTML(
                                `${state.mapData.scope.division_code || ""} Divisional Office`
                            )}
                        </strong>

                        <span>
                            ${escapeHTML(
                                office.label ||
                                "KMC Divisional Office"
                            )}
                        </span>

                        <span>
                            ${escapeHTML(
                                office.address || ""
                            )}
                        </span>
                    </div>
                `
            );

            marker.bindTooltip(
                `${escapeHTML(
                    state.mapData?.scope?.division_name ||
                    "KMC Divisional Office"
                )}`,
                { sticky: true }
            );

            state.overviewMapLayers.push(marker);

            boundsPoints.push([
                Number(office.latitude),
                Number(office.longitude)
            ]);
        }

        const planningBoundary =
            state.mapData?.scope?.planning_boundary;

        if (
            planningBoundary?.source === "official" &&
            Array.isArray(planningBoundary.polygon) &&
            planningBoundary.polygon.length >= 3
        ) {
            const boundary =
                L.polygon(
                    planningBoundary.polygon,
                    {
                        color: "#6e875f",
                        weight: 2,
                        fillColor: "#d6e2ce",
                        fillOpacity: 0.08,
                        dashArray: "7 6"
                    }
                ).addTo(
                    state.overviewMap
                );

            boundary.bindPopup(
                `
                    <strong>
                        ${escapeHTML(
                            state.mapData?.scope?.division_name ||
                            "Division"
                        )}
                    </strong>
                    <br>
                    <small>
                        Verified official division boundary
                    </small>
                `
            );

            state.overviewMapLayers.push(boundary);

            planningBoundary.polygon.forEach(point => {
                if (validOperationalMapPoint(point)) {
                    boundsPoints.push([
                        Number(point[0]),
                        Number(point[1])
                    ]);
                }
            });
        }

        const operationalArea =
            getDivisionOperationalAreaFromState();

        if (
            operationalArea &&
            !state.divisionAreaEditing
        ) {
            const polygon = clonePolygon(
                operationalArea.polygon
            );

            if (polygon.length >= 3) {
                const workingArea = L.polygon(
                    polygon,
                    {
                        color: "#4f7d45",
                        weight: 2,
                        dashArray: "8 6",
                        fillColor: "#b7cf9f",
                        fillOpacity: 0.10
                    }
                ).addTo(state.overviewMap);

                workingArea.bindPopup(
                    `
                        <strong>
                            AC-defined Division working area
                        </strong>
                        <br>
                        <small>
                            Application-managed working envelope. This is not an official KMC administrative boundary.
                        </small>
                    `
                );

                workingArea.bindTooltip(
                    "AC-defined Division working area",
                    { sticky: true }
                );

                state.overviewMapLayers.push(workingArea);
                polygon.forEach(point => boundsPoints.push(point));
            }
        }

        return boundsPoints;
    }

    async function refreshOverviewMap() {
        if (!state.overviewMap) {
            return;
        }

        clearOverviewMapLayers();

        /*
         * Always start from Kolhapur. This prevents the world/India view from
         * appearing when there is temporarily no usable route geometry.
         */
        state.overviewMap.setView(
            KOLHAPUR_MAP_CENTER,
            KOLHAPUR_MAP_ZOOM
        );

        const boundsPoints =
            renderOverviewMapOfficeAndDivision();

        renderOverviewMapWards();
        renderOverviewMapInspectorAreas();

        await renderOverviewMapRoutes();

        renderOverviewMapVehicles();

        const routes =
            Array.isArray(state.mapData?.routes)
                ? state.mapData.routes
                : [];

        routes.forEach(route => {
            normalizeMapStops(route)
                .forEach(stop => {
                    const point = [
                        Number(stop.latitude),
                        Number(stop.longitude)
                    ];

                    if (validKolhapurMapPoint(point)) {
                        boundsPoints.push(point);
                    }
                });

            const vehicle =
                route?.vehicle;

            if (
                vehicle &&
                validKolhapurMapPoint([
                    vehicle.latitude,
                    vehicle.longitude
                ])
            ) {
                boundsPoints.push([
                    Number(vehicle.latitude),
                    Number(vehicle.longitude)
                ]);
            }
        });

        if (dom.overviewMapScopeText) {
            dom.overviewMapScopeText.textContent =
                `${cleanText(
                    state.mapData?.scope?.division_name,
                    "assigned division"
                )} map view`;
        }

        if (dom.overviewMapSubtitle) {
            const wardCount =
                Number(
                    state.mapData?.wards?.length || 0
                );

            const routeCount =
                Number(
                    state.mapData?.routes?.length || 0
                );

            dom.overviewMapSubtitle.textContent =
                `${wardCount} active wards • ${routeCount} routes • database vehicle locations`;
        }

        const officialBoundaryCount =
            Array.isArray(state.mapData?.wards)
                ? state.mapData.wards.filter(
                    ward =>
                        Array.isArray(
                            ward?.boundary?.polygon
                        ) &&
                        ward.boundary.polygon.length >= 3 &&
                        ward.boundary.source === "official"
                ).length
                : 0;

        if (dom.overviewMapDataStatus) {
            dom.overviewMapDataStatus.textContent =
                officialBoundaryCount > 0
                    ? `${officialBoundaryCount} official ward boundary layer(s)`
                    : "No verified official ward boundary geometry available yet";
        }

        state.divisionOperationalArea =
            getDivisionOperationalAreaFromState();

        updateDivisionAreaUi();

        if (state.divisionAreaEditing) {
            renderDivisionAreaEditor();
            return;
        }

        if (dom.overviewMapVehiclesButton) {
            const vehicleCount =
                routes.filter(
                    route =>
                        route?.vehicle &&
                        validKolhapurMapPoint([
                            route.vehicle.latitude,
                            route.vehicle.longitude
                        ])
                ).length;

            dom.overviewMapVehiclesButton.textContent =
                `Vehicles (${vehicleCount})`;
        }

        const validBounds =
            boundsPoints.filter(
                validKolhapurMapPoint
            );

        /*
         * Only fit when all considered points are genuine Kolhapur-area
         * coordinates. A bad coordinate can never move the map to another
         * country/continent.
         */
        if (validBounds.length >= 2) {
            state.overviewMap.fitBounds(
                L.latLngBounds(validBounds).pad(0.10),
                {
                    maxZoom: 15
                }
            );
        } else if (validBounds.length === 1) {
            state.overviewMap.setView(
                validBounds[0],
                14
            );
        }
    }

    function updateOverviewMapButtonState() {
        dom.overviewMapRoutesButton?.classList.toggle(
            "active",
            state.overviewMapRouteVisibility
        );

        dom.overviewMapWardsButton?.classList.toggle(
            "active",
            state.overviewMapWardVisibility
        );

        dom.overviewMapVehiclesButton?.classList.toggle(
            "active",
            state.overviewMapVehicleVisibility
        );
    }

    async function loadMapData() {
        const payload =
            await fetchJSON(`${API_BASE}/map`);

        state.mapData = payload;
        state.divisionOperationalArea =
            payload?.scope?.operational_area ||
            state.divisionOperationalArea ||
            null;

        updateOverviewMapButtonState();
        await refreshOverviewMap();
    }

    function renderCoverage() {
        if (!dom.overviewInspectorCoverage) {
            return;
        }

        const wardMap = new Map(
            state.wards.map(ward => [
                Number(ward.id),
                ward
            ])
        );

        const inspectorsByWard = new Map();

        state.inspectors.forEach(inspector => {
            const wardId = Number(
                inspector?.scope?.ward_id
            );

            if (!wardId) {
                return;
            }

            if (!inspectorsByWard.has(wardId)) {
                inspectorsByWard.set(wardId, []);
            }

            inspectorsByWard
                .get(wardId)
                .push(inspector);
        });

        const rows = Array.from(
            wardMap.values()
        );

        if (!rows.length) {
            dom.overviewInspectorCoverage.innerHTML =
                `<div class="empty-state compact">
                    No verified active wards are currently mapped to this division.
                 </div>`;
            return;
        }

        dom.overviewInspectorCoverage.innerHTML = rows
            .map(ward => {
                const inspectors =
                    inspectorsByWard.get(Number(ward.id)) || [];

                const names =
                    inspectors.length
                        ? inspectors
                            .map(item =>
                                cleanText(
                                    item.full_name,
                                    item.email
                                )
                            )
                            .join(", ")
                        : "No Inspector assigned";

                return `
                    <div class="coverage-item">
                        <div class="coverage-item-main">
                            <strong>
                                ${escapeHTML(
                                    `Ward ${ward.number}`
                                )}
                            </strong>
                            <span>
                                ${escapeHTML(
                                    cleanText(ward.name)
                                )}
                            </span>
                        </div>

                        <div class="coverage-item-side">
                            <strong>
                                ${inspectors.length}
                            </strong>
                            <span>
                                ${escapeHTML(
                                    inspectors.length === 1
                                        ? names
                                        : `${inspectors.length} Inspectors`
                                )}
                            </span>
                        </div>
                    </div>
                `;
            })
            .join("");

        const unassignedCount =
            state.inspectors.filter(
                item => item.assignment_state === "unassigned"
            ).length;

        if (unassignedCount > 0) {
            dom.overviewInspectorCoverage.insertAdjacentHTML(
                "beforeend",
                `
                <div class="coverage-item">
                    <div class="coverage-item-main">
                        <strong>Unassigned Inspectors</strong>
                        <span>
                            Active Inspector accounts awaiting operational ward assignment
                        </span>
                    </div>
                    <div class="coverage-item-side">
                        <strong>${unassignedCount}</strong>
                        <span>Pending</span>
                    </div>
                </div>
                `
            );
        }
    }

    function renderWards() {
        const wards = Array.isArray(state.wards)
            ? state.wards
            : [];

        if (dom.wardNavCount) {
            dom.wardNavCount.textContent = wards.length;
        }

        if (dom.wardsHeading) {
            dom.wardsHeading.textContent =
                state.currentScope?.division_name
                    ? `${state.currentScope.division_name} wards`
                    : "Division wards";
        }

        if (dom.wardsStatus) {
            dom.wardsStatus.textContent =
                `${wards.length} active`;
        }

        if (dom.wardDataNote) {
            dom.wardDataNote.textContent = wards.length
                ? `Showing ${wards.length} active operational ward${wards.length === 1 ? "" : "s"} in your authenticated Division. AC-defined ward areas are application-managed and are not presented as official KMC boundary data.`
                : "No active operational wards are currently available for this Division. Use Create Operational Ward to add one.";
        }

        if (!wards.length) {
            dom.wardsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        No active wards are currently assigned to this division.
                    </td>
                </tr>
            `;
            return;
        }

        const inspectorCounts = new Map();

        state.inspectors.forEach(inspector => {
            const wardId =
                Number(inspector?.scope?.ward_id);

            if (!wardId) {
                return;
            }

            inspectorCounts.set(
                wardId,
                (inspectorCounts.get(wardId) || 0) + 1
            );
        });

        dom.wardsTableBody.innerHTML = wards
            .map(ward => {
                const count =
                    inspectorCounts.get(Number(ward.id)) || 0;

                const boundarySource =
                    ward.planning_boundary?.source || null;

                const boundaryClass =
                    boundarySource === "official"
                        ? "official"
                        : boundarySource === "development"
                            ? "development"
                            : boundarySource === "assistant_defined"
                                ? "assistant"
                                : "missing";

                const boundaryText =
                    boundarySource === "official"
                        ? "Official"
                        : boundarySource === "development"
                            ? "Development"
                            : boundarySource === "assistant_defined"
                                ? "AC defined"
                                : "Not configured";

                const canEditBoundary =
                    boundarySource !== "official" &&
                    Array.isArray(ward.planning_boundary?.polygon) &&
                    ward.planning_boundary.polygon.length >= 3;

                return `
                    <tr>
                        <td>
                            <strong>
                                ${escapeHTML(
                                    `Ward ${ward.number}`
                                )}
                            </strong>
                            <div>
                                ${escapeHTML(
                                    cleanText(ward.name)
                                )}
                            </div>
                        </td>
                        <td>
                            ${escapeHTML(
                                cleanText(ward.code)
                            )}
                        </td>
                        <td>
                            <span class="boundary-pill ${boundaryClass}">
                                ${escapeHTML(boundaryText)}
                            </span>
                        </td>
                        <td>
                            ${count}
                        </td>
                        <td>
                            <span class="status-pill active">
                                Active
                            </span>
                        </td>
                        <td>
                            ${canEditBoundary
                                ? `
                                    <button
                                        type="button"
                                        class="assign-action-button ward-boundary-edit-action"
                                        data-action="edit-ward-boundary"
                                        data-ward-id="${Number(ward.id)}"
                                    >
                                        Edit Boundary
                                    </button>
                                `
                                : `<span class="table-action-muted">Read only</span>`}
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    function showCreateWardMessage(message = "", type = "") {
        if (!dom.createWardMessage) {
            return;
        }

        dom.createWardMessage.textContent = String(message || "");
        dom.createWardMessage.className = "modal-message";

        if (message) {
            dom.createWardMessage.classList.add("show");
            if (type) {
                dom.createWardMessage.classList.add(type);
            }
        }
    }

    function setWardCreateMapStatus(message, tone = "neutral") {
        if (!dom.wardCreateMapStatus) {
            return;
        }

        dom.wardCreateMapStatus.textContent = String(message || "");
        dom.wardCreateMapStatus.dataset.tone = tone;
    }

    function setWardCreateMode(mode) {
        state.wardCreateMode = mode;

        dom.wardCreateSelectAreaButton?.classList.toggle(
            "active",
            mode === "area"
        );

        if (dom.wardCreateFinishAreaButton) {
            dom.wardCreateFinishAreaButton.disabled =
                mode !== "area" ||
                state.wardCreateAreaDraft.length < 3;
        }

        if (dom.wardCreateUndoPointButton) {
            dom.wardCreateUndoPointButton.disabled =
                state.wardCreateAreaDraft.length === 0;
        }

        if (dom.wardCreateMap?.getContainer()) {
            dom.wardCreateMap.getContainer().style.cursor =
                mode === "area" ? "crosshair" : "grab";
        }
    }

    function clearWardCreateMapLayers() {
        state.wardCreateMapLayers.forEach(layer => {
            try {
                layer.remove();
            } catch (error) {
                console.warn(
                    "Ward create map layer cleanup failed:",
                    error
                );
            }
        });
        state.wardCreateMapLayers.length = 0;
    }

    function renderWardCreateMap() {
        if (!state.wardCreateMap) {
            return;
        }

        clearWardCreateMapLayers();

        if (
            Array.isArray(state.wardCreateDivisionArea) &&
            state.wardCreateDivisionArea.length >= 3
        ) {
            const area = L.polygon(
                state.wardCreateDivisionArea,
                {
                    color: "#4f7d45",
                    weight: 2,
                    dashArray: "8 6",
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.06
                }
            ).addTo(state.wardCreateMap);

            area.bindTooltip(
                "AC-defined Division working area • not an official KMC boundary",
                { sticky: true }
            );

            state.wardCreateMapLayers.push(area);
        }

        renderWardBoundaryContext(
            state.wardCreateMap,
            state.wardCreateMapLayers,
            null
        );

        if (state.wardCreateAreaDraft.length >= 2) {
            const line = L.polyline(
                state.wardCreateAreaDraft,
                {
                    color: "#4f7d45",
                    weight: 3,
                    dashArray: "7 6",
                    opacity: 0.9
                }
            ).addTo(state.wardCreateMap);
            state.wardCreateMapLayers.push(line);
        }

        if (state.wardCreateAreaDraft.length >= 3) {
            const polygon = L.polygon(
                state.wardCreateAreaDraft,
                {
                    color: "#315b27",
                    weight: 2,
                    dashArray: "6 5",
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.14
                }
            ).addTo(state.wardCreateMap);

            polygon.bindTooltip(
                "New AC-defined operational ward boundary",
                { sticky: true }
            );

            state.wardCreateMapLayers.push(polygon);
        }

        state.wardCreateAreaDraft.forEach((point, index) => {
            const marker = L.circleMarker(
                point,
                {
                    radius: 5,
                    color: "#4f7d45",
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    weight: 2
                }
            ).addTo(state.wardCreateMap);

            marker.bindTooltip(`Ward area point ${index + 1}`);
            state.wardCreateMapLayers.push(marker);
        });

        if (
            Array.isArray(state.wardCreateArea) &&
            state.wardCreateArea.length >= 3
        ) {
            const finalPolygon = L.polygon(
                state.wardCreateArea,
                {
                    color: "#315b27",
                    weight: 2,
                    fillColor: "#9dc87f",
                    fillOpacity: 0.22
                }
            ).addTo(state.wardCreateMap);

            finalPolygon.bindTooltip(
                "Operational ward boundary selected",
                { sticky: true }
            );

            state.wardCreateMapLayers.push(finalPolygon);
        }
    }

    function updateWardCreateAreaSummary() {
        if (!dom.wardCreateAreaSummary) {
            return;
        }

        if (
            Array.isArray(state.wardCreateArea) &&
            state.wardCreateArea.length >= 3
        ) {
            dom.wardCreateAreaSummary.textContent =
                `Ward boundary selected: ${state.wardCreateArea.length} boundary points. The server will verify containment and Division scope before creating the record.`;
            dom.wardCreateAreaSummary.dataset.selected = "true";
        } else {
            dom.wardCreateAreaSummary.textContent =
                "No ward boundary selected yet.";
            dom.wardCreateAreaSummary.dataset.selected = "false";
        }
    }

    function fitWardCreateMap() {
        if (!state.wardCreateMap) {
            return;
        }

        const polygon =
            state.wardCreateArea ||
            state.wardCreateDivisionArea ||
            [];

        if (polygon.length >= 3) {
            fitMapToPolygon(
                state.wardCreateMap,
                polygon,
                15
            );
        } else {
            const office =
                state.mapData?.scope?.office_point ||
                null;

            if (
                office &&
                validOperationalMapPoint([
                    office.latitude,
                    office.longitude
                ])
            ) {
                state.wardCreateMap.setView(
                    [
                        Number(office.latitude),
                        Number(office.longitude)
                    ],
                    14
                );
            } else {
                state.wardCreateMap.setView(
                    KOLHAPUR_MAP_CENTER,
                    KOLHAPUR_MAP_ZOOM
                );
            }
        }

        state.wardCreateMap.invalidateSize();
    }

    function initializeWardCreateMap() {
        if (
            state.wardCreateMap ||
            !dom.wardCreateMap ||
            typeof window.L === "undefined"
        ) {
            return;
        }

        state.wardCreateMap = L.map(
            dom.wardCreateMap,
            {
                zoomControl: true,
                attributionControl: true
            }
        );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }
        ).addTo(state.wardCreateMap);

        state.wardCreateMap.on(
            "click",
            event => {
                if (state.wardCreateMode !== "area") {
                    return;
                }

                const point = [
                    Number(event.latlng.lat),
                    Number(event.latlng.lng)
                ];

                if (!validOperationalMapPoint(point)) {
                    setWardCreateMapStatus(
                        "That point is outside the configured Kolhapur application safety range.",
                        "error"
                    );
                    return;
                }

                if (
                    Array.isArray(state.wardCreateDivisionArea) &&
                    state.wardCreateDivisionArea.length >= 3 &&
                    !polygonContainsPoint(
                        point,
                        state.wardCreateDivisionArea
                    )
                ) {
                    setWardCreateMapStatus(
                        "That point is outside the AC-defined Division working area.",
                        "error"
                    );
                    return;
                }

                state.wardCreateAreaDraft.push(point);
                renderWardCreateMap();
                setWardCreateMode("area");
                setWardCreateMapStatus(
                    `${state.wardCreateAreaDraft.length} point(s) added. Continue around the ward boundary and click Finish Area when complete.`,
                    "neutral"
                );
            }
        );

        setWardCreateMode("idle");
    }

    function openCreateWardModal() {
        if (!dom.createWardModal) {
            return;
        }

        state.wardCreateAreaDraft = [];
        state.wardCreateArea = null;
        state.wardCreateDivisionArea =
            getDivisionOperationalAreaFromState()?.polygon
                ? clonePolygon(
                    getDivisionOperationalAreaFromState().polygon
                )
                : null;

        dom.createWardForm?.reset();
        showCreateWardMessage("");
        updateWardCreateAreaSummary();

        if (dom.createWardDivisionScope) {
            dom.createWardDivisionScope.textContent =
                state.currentScope?.division_name
                    ? `${state.currentScope.division_name} • ${state.currentScope.division_code || ""}`
                    : "Authenticated Division";
        }

        dom.createWardModal.hidden = false;
        dom.createWardModal.setAttribute(
            "aria-hidden",
            "false"
        );
        document.body.classList.add("modal-open");

        window.setTimeout(() => {
            initializeWardCreateMap();
            renderWardCreateMap();
            fitWardCreateMap();
            setWardCreateMode("idle");
            setWardCreateMapStatus(
                state.wardCreateDivisionArea
                    ? "Division working area loaded. Select Area and draw the new ward completely inside the outer boundary."
                    : "No Division working area is saved yet. Select Area and draw the new operational ward within the configured Kolhapur safety range.",
                state.wardCreateDivisionArea ? "success" : "warning"
            );
            dom.createWardNumber?.focus();
            syncFullscreenUi();
        }, 120);
    }

    function closeCreateWardModal() {
        if (!dom.createWardModal) {
            return;
        }

        const target =
            dom.createWardModal.querySelector(".ward-create-map-section");

        if (document.fullscreenElement === target) {
            void document.exitFullscreen().catch(() => {});
        }
        target?.classList.remove("map-fullscreen-fallback");

        dom.createWardModal.hidden = true;
        dom.createWardModal.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove("modal-open");

        state.wardCreateAreaDraft = [];
        state.wardCreateArea = null;
        state.wardCreateDivisionArea = null;
        setWardCreateMode("idle");
        clearWardCreateMapLayers();
        showCreateWardMessage("");
    }

    function startWardCreateAreaSelection() {
        state.wardCreateAreaDraft = [];
        state.wardCreateArea = null;
        renderWardCreateMap();
        updateWardCreateAreaSummary();
        setWardCreateMode("area");
        setWardCreateMapStatus(
            state.wardCreateDivisionArea
                ? "Click points around the new ward. Every point and every boundary edge must remain inside the AC-defined Division working area."
                : "Click points around the new ward. Every point must remain inside the configured Kolhapur application safety range.",
            "success"
        );
    }

    function finishWardCreateAreaSelection() {
        const validation = validateEditablePolygon(
            state.wardCreateAreaDraft,
            state.wardCreateDivisionArea
        );

        if (!validation.valid) {
            setWardCreateMapStatus(validation.message, "error");
            return;
        }

        state.wardCreateArea = state.wardCreateAreaDraft.map(point => [...point]);
        state.wardCreateAreaDraft = [];
        renderWardCreateMap();
        updateWardCreateAreaSummary();
        setWardCreateMode("idle");
        setWardCreateMapStatus(
            "Ward boundary selected. Review it, then click Create Ward.",
            "success"
        );
    }

    function undoWardCreatePoint() {
        if (!state.wardCreateAreaDraft.length) {
            setWardCreateMapStatus(
                "There are no draft points to remove.",
                "neutral"
            );
            return;
        }

        state.wardCreateAreaDraft.pop();
        renderWardCreateMap();
        setWardCreateMode("area");
        setWardCreateMapStatus(
            `${state.wardCreateAreaDraft.length} point(s) remain in the draft.`,
            "neutral"
        );
    }

    function clearWardCreateArea() {
        state.wardCreateAreaDraft = [];
        state.wardCreateArea = null;
        renderWardCreateMap();
        updateWardCreateAreaSummary();
        setWardCreateMode("idle");
        setWardCreateMapStatus(
            "Ward boundary cleared. Select Area to draw it again.",
            "warning"
        );
    }

    async function saveOperationalWard(event) {
        event.preventDefault();

        const wardNumber = Number(
            dom.createWardNumber?.value
        );
        const wardCode = String(
            dom.createWardCode?.value || ""
        ).trim();
        const wardName = String(
            dom.createWardName?.value || ""
        ).trim();

        if (!Number.isInteger(wardNumber) || wardNumber < 1 || wardNumber > 9999) {
            showCreateWardMessage(
                "Ward Number must be an integer between 1 and 9999.",
                "error"
            );
            dom.createWardNumber?.focus();
            return;
        }

        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(wardCode)) {
            showCreateWardMessage(
                "Ward Code must be 2-30 characters using letters, numbers, hyphens or underscores.",
                "error"
            );
            dom.createWardCode?.focus();
            return;
        }

        if (wardName.length < 2 || wardName.length > 120) {
            showCreateWardMessage(
                "Ward Name must contain between 2 and 120 characters.",
                "error"
            );
            dom.createWardName?.focus();
            return;
        }

        const validation = validateEditablePolygon(
            state.wardCreateArea,
            state.wardCreateDivisionArea
        );

        if (!validation.valid) {
            showCreateWardMessage(
                "Please select a valid ward boundary before saving it.",
                "error"
            );
            setWardCreateMapStatus(
                validation.message,
                "error"
            );
            return;
        }

        const button = dom.saveCreateWardButton;
        const originalText = button?.textContent;
        if (button) {
            button.disabled = true;
            button.textContent = "Creating…";
        }

        try {
            const payload = await fetchJSON(`${API_BASE}/wards`, {
                method: "POST",
                body: JSON.stringify({
                    ward_number: wardNumber,
                    ward_code: wardCode,
                    ward_name: wardName,
                    boundary: {
                        polygon: state.wardCreateArea
                    }
                })
            });

            const created = payload?.ward;
            showToast(
                created
                    ? `Operational Ward ${created.number} created successfully.`
                    : "Operational ward created successfully."
            );

            closeCreateWardModal();
            await Promise.all([
                loadWards(),
                loadMapData(),
                loadOverview(),
                loadInspectors()
            ]);
        } catch (error) {
            console.error(
                "Operational ward creation error:",
                error
            );

            if (handleUnauthorized(error)) {
                return;
            }

            showCreateWardMessage(
                error.message ||
                    "Unable to create the operational ward.",
                "error"
            );
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || "Create Ward";
            }
        }
    }


    function clearWardBoundaryEditLayers() {
        state.wardBoundaryEditLayers.forEach(layer => {
            try {
                layer.remove();
            } catch (error) {
                console.warn(
                    "Ward boundary editor layer cleanup failed:",
                    error
                );
            }
        });
        state.wardBoundaryEditLayers.length = 0;
    }

    function setWardBoundaryEditMode(mode = "idle") {
        state.wardBoundaryEditMode = mode;

        dom.editWardBoundarySelectModeButton?.classList.toggle(
            "active",
            mode === "add"
        );

        if (dom.editWardBoundaryFinishButton) {
            dom.editWardBoundaryFinishButton.disabled =
                state.wardBoundaryEditDraft.length < 3;
        }

        if (dom.editWardBoundaryUndoButton) {
            dom.editWardBoundaryUndoButton.disabled =
                state.wardBoundaryEditDraft.length <= 3;
        }
    }

    function updateWardBoundaryEditSummary() {
        const points = state.wardBoundaryEditDraft;

        if (!dom.editWardBoundarySummary) {
            return;
        }

        if (points.length >= 3) {
            dom.editWardBoundarySummary.textContent =
                `${points.length} boundary points. Drag a vertex to reshape the ward, use Add Point to extend it, or double-click a vertex to remove it.`;
            dom.editWardBoundarySummary.dataset.selected = "true";
        } else {
            dom.editWardBoundarySummary.textContent =
                "A valid ward boundary requires at least three points.";
            dom.editWardBoundarySummary.dataset.selected = "false";
        }
    }

    function setWardBoundaryEditStatus(message, tone = "neutral") {
        if (!dom.editWardBoundaryMapStatus) {
            return;
        }

        dom.editWardBoundaryMapStatus.textContent =
            String(message || "");
        dom.editWardBoundaryMapStatus.dataset.tone = tone;
    }

    function validateWardBoundaryEditPolygon(points) {
        return validateEditablePolygon(
            points,
            getDivisionOperationalAreaFromState()?.polygon || null
        );
    }

    function findNearestWardBoundaryEditEdge(mapPoint) {
        const points = state.wardBoundaryEditDraft;
        if (!state.wardBoundaryEditMap || points.length < 3) {
            return -1;
        }

        const clicked =
            state.wardBoundaryEditMap.latLngToContainerPoint(
                mapPoint
            );

        let closestEdge = -1;
        let closestDistance = Infinity;

        for (let i = 0; i < points.length; i++) {
            const a =
                state.wardBoundaryEditMap.latLngToContainerPoint(
                    points[i]
                );
            const b =
                state.wardBoundaryEditMap.latLngToContainerPoint(
                    points[(i + 1) % points.length]
                );

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSquared = dx * dx + dy * dy;

            const t = lengthSquared <= 1e-12
                ? 0
                : Math.max(
                    0,
                    Math.min(
                        1,
                        ((clicked.x - a.x) * dx +
                            (clicked.y - a.y) * dy) /
                            lengthSquared
                    )
                );

            const projection = {
                x: a.x + t * dx,
                y: a.y + t * dy
            };

            const distance = Math.hypot(
                clicked.x - projection.x,
                clicked.y - projection.y
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEdge = i;
            }
        }

        return closestDistance <= 34
            ? closestEdge
            : -1;
    }

    function renderWardBoundaryEditor() {
        if (!state.wardBoundaryEditMap) {
            return;
        }

        clearWardBoundaryEditLayers();

        const points = state.wardBoundaryEditDraft;

        const selectedWardId =
            state.selectedWardForBoundaryEdit?.id ?? null;

        renderWardBoundaryContext(
            state.wardBoundaryEditMap,
            state.wardBoundaryEditLayers,
            selectedWardId
        );

        if (points.length >= 2) {
            const line = L.polyline(
                points,
                {
                    color: "#4f7d45",
                    weight: 3,
                    dashArray: "8 6",
                    opacity: 0.95
                }
            ).addTo(state.wardBoundaryEditMap);
            state.wardBoundaryEditLayers.push(line);
        }

        if (points.length >= 3) {
            const polygon = L.polygon(
                points,
                {
                    color: "#315b27",
                    weight: 2,
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.18
                }
            ).addTo(state.wardBoundaryEditMap);

            polygon.bindTooltip(
                "AC-defined operational ward boundary • not official KMC geometry",
                { sticky: true }
            );
            state.wardBoundaryEditLayers.push(polygon);
        }

        points.forEach((point, index) => {
            const marker = L.marker(
                point,
                {
                    icon: createEditableVertexIcon("ward"),
                    draggable: true,
                    keyboard: false
                }
            ).addTo(state.wardBoundaryEditMap);

            marker.bindTooltip(
                `Ward boundary point ${index + 1} • drag to edit • double-click to remove`,
                { direction: "top" }
            );

            marker.on("click", event => {
                L.DomEvent.stopPropagation(event);
            });

            marker.on("dblclick", event => {
                L.DomEvent.stopPropagation(event);
                event.originalEvent?.preventDefault?.();

                if (state.wardBoundaryEditDraft.length <= 3) {
                    setWardBoundaryEditStatus(
                        "At least three boundary points are required.",
                        "warning"
                    );
                    return;
                }

                const candidate =
                    state.wardBoundaryEditDraft.filter(
                        (_, pointIndex) => pointIndex !== index
                    );

                const validation =
                    validateWardBoundaryEditPolygon(candidate);

                if (!validation.valid) {
                    setWardBoundaryEditStatus(
                        validation.message,
                        "error"
                    );
                    return;
                }

                state.wardBoundaryEditDraft = candidate;
                renderWardBoundaryEditor();
                updateWardBoundaryEditSummary();
                setWardBoundaryEditMode("idle");
                setWardBoundaryEditStatus(
                    "Boundary point removed. Review the edited ward shape before saving.",
                    "success"
                );
            });

            marker.on("dragend", event => {
                const candidate =
                    state.wardBoundaryEditDraft.map(
                        item => [...item]
                    );
                const dragged = event.target.getLatLng();

                candidate[index] = [
                    Number(dragged.lat),
                    Number(dragged.lng)
                ];

                const validation =
                    validateWardBoundaryEditPolygon(candidate);

                if (!validation.valid) {
                    marker.setLatLng(
                        state.wardBoundaryEditDraft[index]
                    );
                    setWardBoundaryEditStatus(
                        validation.message,
                        "error"
                    );
                    return;
                }

                state.wardBoundaryEditDraft = candidate;
                renderWardBoundaryEditor();
                updateWardBoundaryEditSummary();
                setWardBoundaryEditStatus(
                    "Boundary point moved. Continue editing or save the ward boundary.",
                    "success"
                );
            });

            state.wardBoundaryEditLayers.push(marker);
        });
    }

    function initializeWardBoundaryEditMap() {
        if (
            state.wardBoundaryEditMap ||
            !dom.editWardBoundaryMap ||
            typeof window.L === "undefined"
        ) {
            return;
        }

        state.wardBoundaryEditMap = L.map(
            dom.editWardBoundaryMap,
            {
                zoomControl: true,
                attributionControl: true
            }
        );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }
        ).addTo(state.wardBoundaryEditMap);

        state.wardBoundaryEditMap.on(
            "click",
            event => {
                if (state.wardBoundaryEditMode !== "add") {
                    return;
                }

                const point = [
                    Number(event.latlng.lat),
                    Number(event.latlng.lng)
                ];

                if (!validOperationalMapPoint(point)) {
                    setWardBoundaryEditStatus(
                        "That point is outside the configured Kolhapur application safety range.",
                        "error"
                    );
                    return;
                }

                const current =
                    state.wardBoundaryEditDraft;

                const edgeIndex =
                    current.length >= 3
                        ? findNearestWardBoundaryEditEdge(
                            event.latlng
                        )
                        : -1;

                if (current.length >= 3 && edgeIndex < 0) {
                    setWardBoundaryEditStatus(
                        "Click near an existing ward boundary edge to insert a point.",
                        "neutral"
                    );
                    return;
                }

                const insertIndex =
                    current.length >= 3
                        ? edgeIndex + 1
                        : current.length;

                const candidate = [
                    ...current.slice(0, insertIndex),
                    point,
                    ...current.slice(insertIndex)
                ];

                const validation =
                    validateWardBoundaryEditPolygon(candidate);

                if (!validation.valid) {
                    setWardBoundaryEditStatus(
                        validation.message,
                        "error"
                    );
                    return;
                }

                state.wardBoundaryEditDraft = candidate;
                renderWardBoundaryEditor();
                updateWardBoundaryEditSummary();
                setWardBoundaryEditStatus(
                    "Boundary point added. Drag the new handle to extend or reshape the ward.",
                    "success"
                );
            }
        );
    }

    function fitWardBoundaryEditMap() {
        if (!state.wardBoundaryEditMap) {
            return;
        }

        const points = state.wardBoundaryEditDraft;
        const divisionArea =
            getDivisionOperationalAreaFromState()?.polygon || null;

        const bounds = points.length >= 3
            ? points
            : divisionArea?.length >= 3
                ? divisionArea
                : [KOLHAPUR_MAP_CENTER];

        state.wardBoundaryEditMap.fitBounds(
            L.latLngBounds(bounds).pad(0.12),
            { maxZoom: 16 }
        );
        state.wardBoundaryEditMap.invalidateSize();
    }

    function showEditWardBoundaryMessage(message = "", type = "") {
        if (!dom.editWardBoundaryMessage) {
            return;
        }

        dom.editWardBoundaryMessage.textContent =
            String(message || "");
        dom.editWardBoundaryMessage.className = "modal-message";

        if (message) {
            dom.editWardBoundaryMessage.classList.add("show");
            if (type) {
                dom.editWardBoundaryMessage.classList.add(type);
            }
        }
    }

    async function openEditWardBoundaryModal(ward) {
        if (!ward || !dom.editWardBoundaryModal) {
            return;
        }

        const source =
            ward.planning_boundary?.source || null;

        if (source === "official") {
            showToast(
                "Official ward boundary geometry is read-only."
            );
            return;
        }

        const polygon =
            Array.isArray(ward.planning_boundary?.polygon)
                ? ward.planning_boundary.polygon.map(point => [
                    Number(point[0]),
                    Number(point[1])
                ])
                : [];

        if (polygon.length < 3) {
            showToast(
                "This ward does not have an existing application-managed boundary to edit yet."
            );
            return;
        }

        state.selectedWardForBoundaryEdit = ward;
        state.wardBoundaryEditDraft = clonePolygon(polygon);
        state.wardBoundaryEditOriginal = clonePolygon(polygon);

        dom.editWardBoundaryModalTitle.textContent =
            `Edit Ward ${Number(ward.number)} Boundary`;

        dom.editWardBoundaryWardScope.textContent =
            `${cleanText(ward.name, `Ward ${Number(ward.number)}`)} • ${cleanText(ward.code)} • ${cleanText(state.currentScope?.division_name, "Authenticated Division")}`;

        showEditWardBoundaryMessage("");
        updateWardBoundaryEditSummary();

        dom.editWardBoundaryModal.hidden = false;
        dom.editWardBoundaryModal.setAttribute(
            "aria-hidden",
            "false"
        );
        document.body.classList.add("modal-open");

        window.setTimeout(() => {
            initializeWardBoundaryEditMap();
            renderWardBoundaryEditor();
            fitWardBoundaryEditMap();
            setWardBoundaryEditMode("idle");

            const sourceLabel =
                source === "development"
                    ? "current development/demo boundary"
                    : "current AC-defined boundary";

            setWardBoundaryEditStatus(
                `Editing the ${sourceLabel}. Official KMC boundary geometry is not being edited. Routes linked to Ward ${Number(ward.number)} keep the same Ward ID and are not reassigned by this boundary edit.`,
                source === "development" ? "warning" : "success"
            );

            syncFullscreenUi();
        }, 120);
    }

    function closeEditWardBoundaryModal() {
        if (!dom.editWardBoundaryModal) {
            return;
        }

        const target =
            dom.editWardBoundaryModal.querySelector(
                ".ward-boundary-edit-map-section"
            );

        if (document.fullscreenElement === target) {
            void document.exitFullscreen().catch(() => {});
        }
        target?.classList.remove("map-fullscreen-fallback");

        dom.editWardBoundaryModal.hidden = true;
        dom.editWardBoundaryModal.setAttribute(
            "aria-hidden",
            "true"
        );
        document.body.classList.remove("modal-open");

        state.wardBoundaryEditMode = "idle";
        state.wardBoundaryEditDraft = [];
        state.wardBoundaryEditOriginal = [];
        state.selectedWardForBoundaryEdit = null;
        clearWardBoundaryEditLayers();
        showEditWardBoundaryMessage("");
    }

    function finishWardBoundaryEdit() {
        const validation =
            validateWardBoundaryEditPolygon(
                state.wardBoundaryEditDraft
            );

        if (!validation.valid) {
            setWardBoundaryEditStatus(
                validation.message,
                "error"
            );
            return;
        }

        setWardBoundaryEditMode("idle");
        setWardBoundaryEditStatus(
            "Boundary edit complete. Review the polygon and click Save Boundary to persist it.",
            "success"
        );
    }

    function undoWardBoundaryEditPoint() {
        if (state.wardBoundaryEditDraft.length <= 3) {
            setWardBoundaryEditStatus(
                "At least three boundary points are required.",
                "warning"
            );
            return;
        }

        state.wardBoundaryEditDraft.pop();
        renderWardBoundaryEditor();
        updateWardBoundaryEditSummary();
        setWardBoundaryEditStatus(
            "Removed the last boundary point. Review the edited ward shape before saving.",
            "neutral"
        );
    }

    function clearWardBoundaryEdit() {
        state.wardBoundaryEditDraft =
            clonePolygon(state.wardBoundaryEditOriginal);
        renderWardBoundaryEditor();
        updateWardBoundaryEditSummary();
        setWardBoundaryEditMode("idle");
        setWardBoundaryEditStatus(
            "Reverted the unsaved ward boundary edits to the original saved shape.",
            "neutral"
        );
    }

    async function saveEditedWardBoundary(event) {
        event?.preventDefault?.();

        const ward = state.selectedWardForBoundaryEdit;
        if (!ward) {
            return;
        }

        const validation =
            validateWardBoundaryEditPolygon(
                state.wardBoundaryEditDraft
            );

        if (!validation.valid) {
            setWardBoundaryEditStatus(
                validation.message,
                "error"
            );
            return;
        }

        dom.saveEditWardBoundaryButton.disabled = true;

        try {
            const payload = await fetchJSON(
                `${API_BASE}/wards/${Number(ward.id)}/boundary`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        boundary: {
                            polygon: state.wardBoundaryEditDraft
                        }
                    })
                }
            );

            closeEditWardBoundaryModal();
            showToast(
                payload.message ||
                    "Operational ward boundary saved successfully."
            );

            await Promise.all([
                loadMapData(),
                loadWards()
            ]);
        } catch (error) {
            console.error(
                "Operational ward boundary save error:",
                error
            );

            if (handleUnauthorized(error)) {
                return;
            }

            showEditWardBoundaryMessage(
                error.message ||
                    "Unable to save the operational ward boundary.",
                "error"
            );
        } finally {
            dom.saveEditWardBoundaryButton.disabled = false;
        }
    }


    function showCreateInspectorAccountMessage(message = "", type = "") {
        if (!dom.createInspectorAccountMessage) return;
        dom.createInspectorAccountMessage.textContent = String(message || "");
        dom.createInspectorAccountMessage.className = "modal-message";
        if (message) {
            dom.createInspectorAccountMessage.classList.add("show");
            if (type) dom.createInspectorAccountMessage.classList.add(type);
        }
    }

    function populateInspectorAccountWardSelect() {
        if (!dom.newInspectorWard) return;
        const wards = (Array.isArray(state.wards) ? state.wards : []).filter(ward =>
            Array.isArray(ward?.planning_boundary?.polygon) && ward.planning_boundary.polygon.length >= 3
        );
        const options = ['<option value="">Select a Ward with a configured boundary</option>'];
        for (const ward of wards) {
            options.push(`
                <option value="${Number(ward.id)}">
                    ${escapeHTML(`Ward ${ward.number} - ${ward.name}`)}
                </option>
            `);
        }
        if (!wards.length) {
            options[0] = '<option value="">No active Wards with a usable boundary are available</option>';  
        }
        dom.newInspectorWard.innerHTML = options.join("");
        dom.createInspectorAccountSubmit.disabled = wards.length === 0;
    }

    function openCreateInspectorAccountModal() {
        if (!dom.createInspectorAccountModal) return;
        dom.createInspectorAccountForm?.reset();
        populateInspectorAccountWardSelect();
        showCreateInspectorAccountMessage("");
        dom.createInspectorAccountModal.hidden = false;
        dom.createInspectorAccountModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        window.setTimeout(() => dom.newInspectorFullName?.focus(), 0);
    }

    function closeCreateInspectorAccountModal() {
        if (!dom.createInspectorAccountModal) return;
        dom.createInspectorAccountModal.hidden = true;
        dom.createInspectorAccountModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        dom.createInspectorAccountForm?.reset();
        showCreateInspectorAccountMessage("");
        if (dom.createInspectorAccountSubmit) {
            dom.createInspectorAccountSubmit.disabled = false;
            dom.createInspectorAccountSubmit.textContent = "Create Account";
        }
    }

    async function saveInspectorAccount(event) {
        event.preventDefault();
        showCreateInspectorAccountMessage("");
        if (!dom.createInspectorAccountForm?.checkValidity()) {
            dom.createInspectorAccountForm?.reportValidity();
            return;
        }

        const payload = {
            full_name: String(dom.newInspectorFullName?.value || "").trim(),
            employee_id: String(dom.newInspectorEmployeeId?.value || "").trim(),
            email: String(dom.newInspectorEmail?.value || "").trim(),
            mobile_number: String(dom.newInspectorMobile?.value || "").trim() || null,
            ward_id: Number(dom.newInspectorWard?.value),
            reason: String(dom.newInspectorReason?.value || "").trim() || null
        };
        if (!Number.isSafeInteger(payload.ward_id) || payload.ward_id <= 0) {
            showCreateInspectorAccountMessage("Select an active Ward in your assigned Division.", "error");
            dom.newInspectorWard?.focus();
            return;
        }

        const button = dom.createInspectorAccountSubmit;
        const originalText = button?.textContent || "Create Account";
        if (button) {
            button.disabled = true;
            button.textContent = "Creating…";
        }

        try {
            const result = await fetchJSON(`${API_BASE}/inspectors/accounts`, {
                method: "POST",
                body: JSON.stringify(payload)
            });
            closeCreateInspectorAccountModal();
            showToast(result.message || "Inspector login created successfully.");
            await loadAll();
        } catch (error) {
            console.error("Inspector account provisioning failed:", error);
            if (handleUnauthorized(error)) {
                closeCreateInspectorAccountModal();
                return;
            }
            showCreateInspectorAccountMessage(error.message || "Unable to create the Inspector account.", "error");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }


    function renderInspectors() {
        const inspectors =
            Array.isArray(state.inspectors)
                ? state.inspectors
                : [];

        if (dom.inspectorNavCount) {
            dom.inspectorNavCount.textContent =
                inspectors.length;
        }

        if (dom.inspectorsStatus) {
            const assigned = inspectors.filter(
                item => item.assignment_state === "assigned"
            ).length;

            dom.inspectorsStatus.textContent =
                `${assigned}/${inspectors.length} assigned`;
        }

        if (!inspectors.length) {
            dom.inspectorsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        No active Sanitary Inspectors are currently available to this division.
                    </td>
                </tr>
            `;
            return;
        }

        dom.inspectorsTableBody.innerHTML =
            inspectors.map(inspector => {
                const scope =
                    inspector.scope || {};

                const assigned =
                    inspector.assignment_state === "assigned";

                const wardLabel =
                    scope.ward_id
                        ? `Ward ${scope.ward_number}: ${cleanText(scope.ward_name)}`
                        : "Not assigned";

                let action = `
                    <button
                        type="button"
                        class="assign-action-button"
                        data-action="assign-inspector"
                        data-inspector-id="${Number(inspector.user_id)}"
                    >
                        ${assigned ? "Edit Ward" : "Assign Ward"}
                    </button>
                `;

                if (!inspector.has_profile) {
                    action = `
                        <span
                            class="status-pill unassigned"
                            title="Inspector must complete their basic profile before scope can be assigned."
                        >
                            Profile incomplete
                        </span>
                    `;
                }

                const scopeText =
                    scope.division_name
                        ? cleanText(scope.division_name)
                        : "Pending division";

                const hasWardJurisdiction =
                    assigned &&
                    Number.isInteger(Number(scope.ward_id)) &&
                    Number(scope.ward_id) > 0;

                return `
                    <tr>
                        <td>
                            <strong>
                                ${escapeHTML(
                                    cleanText(
                                        inspector.full_name,
                                        inspector.email
                                    )
                                )}
                            </strong>
                            <div>
                                ${escapeHTML(
                                    cleanText(
                                        inspector.email
                                    )
                                )}
                            </div>
                        </td>

                        <td>
                            ${escapeHTML(
                                cleanText(
                                    inspector.employee_id
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(wardLabel)}
                        </td>

                        <td>
                            <span class="operational-area-pill ${hasWardJurisdiction ? "" : "missing"}">
                                ${hasWardJurisdiction ? "Ward jurisdiction" : "Ward not assigned"}
                            </span>
                        </td>

                        <td>
                            <span class="scope-badge small">
                                ${escapeHTML(scopeText)}
                            </span>
                        </td>

                        <td>
                            ${action}
                        </td>
                    </tr>
                `;
            }).join("");
    }

    function renderProfile(profile, user) {
        const resolvedProfile =
            profile || {};

        const profileDivision =
            resolvedProfile?.division || {};

        const divisionName =
            cleanText(
                profileDivision.name ||
                state.currentScope?.division_name
            );

        const divisionCode =
            cleanText(
                profileDivision.code ||
                state.currentScope?.division_code
            );

        if (dom.profilePreviewName) {
            dom.profilePreviewName.textContent =
                cleanText(
                    resolvedProfile.full_name,
                    user?.email || "—"
                );
        }

        if (dom.profilePreviewEmail) {
            dom.profilePreviewEmail.textContent =
                cleanText(
                    resolvedProfile.official_email,
                    user?.email || "—"
                );
        }

        if (dom.profilePreviewEmployeeId) {
            dom.profilePreviewEmployeeId.textContent =
                cleanText(resolvedProfile.employee_id);
        }

        if (dom.profilePreviewDesignation) {
            dom.profilePreviewDesignation.textContent =
                cleanText(resolvedProfile.designation);
        }

        if (dom.profilePreviewDepartment) {
            dom.profilePreviewDepartment.textContent =
                cleanText(resolvedProfile.department);
        }

        if (dom.profilePreviewDivision) {
            dom.profilePreviewDivision.textContent =
                divisionName;
        }

        if (dom.headerAssistantName) {
            dom.headerAssistantName.textContent =
                cleanText(
                    resolvedProfile.full_name,
                    user?.email || "Assistant Commissioner"
                );
        }

        if (dom.headerAssistantDivision) {
            dom.headerAssistantDivision.textContent =
                divisionCode && divisionName !== "—"
                    ? `${divisionName} • ${divisionCode}`
                    : divisionName;
        }
    }

    async function loadAssistantProfile() {
        const payload =
            await fetchJSON("/api/profile");

        const profile =
            payload?.profile || {};

        const scope =
            payload?.scope || {};

        const division =
            profile?.division ||
            scope?.division ||
            null;

        if (division?.id) {
            state.currentScope = {
                ...(state.currentScope || {}),
                division_id: Number(division.id),
                division_code:
                    division.code ||
                    state.currentScope?.division_code ||
                    null,
                division_name:
                    division.name ||
                    state.currentScope?.division_name ||
                    null
            };
        }

        renderProfile(
            profile,
            payload?.user
        );
    }

    function populateWardSelect(currentWardId = null) {
        if (!dom.assignmentWardSelect) {
            return;
        }

        const options = [
            `<option value="">Select ward</option>`,
            ...state.wards.map(ward => {
                const selected =
                    currentWardId !== null &&
                    Number(currentWardId) ===
                        Number(ward.id);

                return `
                    <option
                        value="${Number(ward.id)}"
                        ${selected ? "selected" : ""}
                    >
                        ${escapeHTML(
                            `Ward ${ward.number} - ${ward.name}`
                        )}
                    </option>
                `;
            })
        ];

        dom.assignmentWardSelect.innerHTML =
            options.join("");
    }

    function showAssignmentMessage(
        message = "",
        type = ""
    ) {
        if (!dom.assignInspectorMessage) {
            return;
        }

        dom.assignInspectorMessage.textContent =
            String(message || "");

        dom.assignInspectorMessage.className =
            "modal-message";

        if (message) {
            dom.assignInspectorMessage.classList.add("show");

            if (type) {
                dom.assignInspectorMessage.classList.add(
                    type
                );
            }
        }
    }

    function openAssignmentModal(inspector) {
        if (!inspector || !dom.assignInspectorModal) {
            return;
        }

        state.selectedInspector = inspector;

        const scope = inspector.scope || {};
        const assigned = inspector.assignment_state === "assigned";

        dom.assignmentInspectorId.value =
            String(inspector.user_id);

        dom.assignmentInspectorName.textContent =
            cleanText(
                inspector.full_name,
                inspector.email
            );

        dom.assignmentInspectorEmployeeId.textContent =
            `Employee ID: ${cleanText(
                inspector.employee_id
            )}`;

        dom.assignInspectorModalTitle.textContent =
            assigned
                ? "Reassign Inspector"
                : "Assign Inspector";

        dom.assignInspectorModalSubtitle.textContent =
            assigned
                ? "Update the Inspector's Ward jurisdiction within your assigned Division."
                : "Select a Ward within your assigned Division to define this Inspector's jurisdiction.";

        dom.assignmentReason.value = "";

        populateWardSelect(
            assigned
                ? scope.ward_id
                : null
        );

        showAssignmentMessage("");

        dom.assignInspectorModal.hidden = false;
        dom.assignInspectorModal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add("modal-open");

        const modalBody =
            dom.assignInspectorModal.querySelector(".modal-body");

        if (modalBody) {
            modalBody.scrollTop = 0;
        }

        window.setTimeout(() => {
            initializeAssignmentMap();

            const initialWard = state.wards.find(
                ward => Number(ward.id) ===
                    Number(assigned ? scope.ward_id : 0)
            );

            if (initialWard) {
                loadAssignmentWardMap(initialWard);
            } else {
                state.assignmentDivisionBoundary = null;
                state.assignmentWardBoundary = null;
                state.assignmentWardBoundarySource = null;
                state.assignmentOfficePoint = null;
                state.assignmentArea = null;
                state.assignmentAreaDraft = [];
                renderAssignmentMap();
                updateAssignmentAreaSummary();
                setAssignmentMapStatus(
                    "Select a ward to load the ward boundary map.",
                    "neutral"
                );
                setAssignmentMode("idle");
            }

            dom.assignmentWardSelect?.focus();

            if (state.assignmentMap) {
                state.assignmentMap.invalidateSize();
            }
        }, 120);
    }

    function closeAssignmentModal() {
        if (!dom.assignInspectorModal) {
            return;
        }

        const target =
            dom.assignInspectorModal.querySelector(".assignment-map-section");

        if (document.fullscreenElement === target) {
            void document.exitFullscreen().catch(() => {});
        }
        target?.classList.remove("map-fullscreen-fallback");

        dom.assignInspectorModal.hidden = true;
        dom.assignInspectorModal.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove("modal-open");

        state.selectedInspector = null;
        state.assignmentDivisionBoundary = null;
        state.assignmentWardBoundary = null;
        state.assignmentWardBoundarySource = null;
        state.assignmentOfficePoint = null;
        state.selectedAssignmentWardId = null;
        state.assignmentAreaDraft = [];
        state.assignmentArea = null;
        setAssignmentMode("idle");

        if (dom.assignInspectorForm) {
            dom.assignInspectorForm.reset();
        }

        showAssignmentMessage("");
    }

    function setAssignmentMapStatus(message, tone = "neutral") {
        if (!dom.assignmentMapStatus) {
            return;
        }

        dom.assignmentMapStatus.textContent = String(message || "");
        dom.assignmentMapStatus.dataset.tone = tone;
    }

    function setAssignmentMode(mode) {
        state.assignmentMode = mode;

        const assignmentMap = state.assignmentMap;
        const assignmentMapContainer =
            assignmentMap &&
            typeof assignmentMap.getContainer === "function"
                ? assignmentMap.getContainer()
                : null;

        if (assignmentMapContainer) {
            assignmentMapContainer.style.cursor = "grab";
        }
    }

    function clearAssignmentMapLayers() {
        state.assignmentMapLayers.forEach(layer => layer.remove());
        state.assignmentMapLayers.length = 0;
    }

    function pointOnAssistantBoundary(point, polygon) {
        if (!Array.isArray(polygon) || polygon.length < 3) {
            return false;
        }

        const lat = Number(point?.[0]);
        const lng = Number(point?.[1]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return false;
        }

        const tolerance = 0.00001;

        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i];
            const b = polygon[(i + 1) % polygon.length];

            const ax = Number(a[0]);
            const ay = Number(a[1]);
            const bx = Number(b[0]);
            const by = Number(b[1]);

            const dx = bx - ax;
            const dy = by - ay;
            const lengthSquared = dx * dx + dy * dy;

            if (lengthSquared <= 1e-18) {
                continue;
            }

            const cross =
                (lat - ax) * dy -
                (lng - ay) * dx;

            if (Math.abs(cross) > tolerance) {
                continue;
            }

            const dot =
                (lat - ax) * dx +
                (lng - ay) * dy;

            if (
                dot >= -tolerance &&
                dot <= lengthSquared + tolerance
            ) {
                return true;
            }
        }

        return false;
    }

    function pointInsideAssistantBoundary(point) {
        const polygon = state.assignmentWardBoundary;

        if (!Array.isArray(polygon) || polygon.length < 3) {
            return false;
        }

        const lat = Number(point?.[0]);
        const lng = Number(point?.[1]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return false;
        }

        if (pointOnAssistantBoundary(point, polygon)) {
            return true;
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

    function orientationAssistant(a, b, c) {
        return (
            (Number(b[0]) - Number(a[0])) *
                (Number(c[1]) - Number(a[1])) -
            (Number(b[1]) - Number(a[1])) *
                (Number(c[0]) - Number(a[0]))
        );
    }

    function segmentsStrictlyIntersectAssistant(a, b, c, d) {
        const epsilon = 1e-10;

        const o1 = orientationAssistant(a, b, c);
        const o2 = orientationAssistant(a, b, d);
        const o3 = orientationAssistant(c, d, a);
        const o4 = orientationAssistant(c, d, b);

        return (
            ((o1 > epsilon && o2 < -epsilon) ||
                (o1 < -epsilon && o2 > epsilon)) &&
            ((o3 > epsilon && o4 < -epsilon) ||
                (o3 < -epsilon && o4 > epsilon))
        );
    }

    function polygonSelfIntersectsAssistant(points) {
        if (!Array.isArray(points) || points.length < 3) {
            return false;
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

                if (
                    segmentsStrictlyIntersectAssistant(
                        a,
                        b,
                        c,
                        d
                    )
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    function validateAssignmentAreaDraft(points) {
        if (!Array.isArray(points) || points.length < 3) {
            return {
                valid: false,
                message: "Add at least three distinct boundary points first."
            };
        }

        const seen = new Set();

        for (const point of points) {
            const lat = Number(point?.[0]);
            const lng = Number(point?.[1]);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return {
                    valid: false,
                    message: "One of the selected map points is invalid."
                };
            }

            const key = `${lat.toFixed(7)},${lng.toFixed(7)}`;

            if (seen.has(key)) {
                return {
                    valid: false,
                    message: "The same boundary point was selected more than once."
                };
            }

            seen.add(key);

            if (!pointInsideAssistantBoundary(point)) {
                return {
                    valid: false,
                    message: "Every selected point must stay inside the selected ward boundary."
                };
            }
        }

        if (polygonSelfIntersectsAssistant(points)) {
            return {
                valid: false,
                message: "The boundary lines cross each other. Continue around the area without crossing an earlier line."
            };
        }

        /* Check each edge at several points. This catches a segment that
           leaves a concave working envelope even when its two endpoints
           happen to be inside. */
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];

            for (const fraction of [0.25, 0.5, 0.75]) {
                const sample = [
                    Number(a[0]) +
                        (Number(b[0]) - Number(a[0])) * fraction,
                    Number(a[1]) +
                        (Number(b[1]) - Number(a[1])) * fraction
                ];

                if (!pointInsideAssistantBoundary(sample)) {
                    return {
                        valid: false,
                        message: "A boundary edge leaves the selected ward boundary. Keep the complete polygon inside the highlighted boundary."
                    };
                }
            }
        }

        let area = 0;

        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];

            area +=
                Number(current[1]) * Number(next[0]) -
                Number(next[1]) * Number(current[0]);
        }

        if (Math.abs(area) / 2 <= 1e-12) {
            return {
                valid: false,
                message: "The selected points do not enclose a usable area."
            };
        }

        return {
            valid: true,
            message: "Operational area is valid."
        };
    }

    function getKnownWardMapRecords() {
        if (Array.isArray(state.mapData?.wards) && state.mapData.wards.length) {
            return state.mapData.wards;
        }

        return Array.isArray(state.wards) ? state.wards : [];
    }

    function renderWardBoundaryContext(map, layers, selectedWardId = null) {
        if (!map || !Array.isArray(layers)) {
            return;
        }

        getKnownWardMapRecords().forEach(ward => {
            const polygon =
                ward?.boundary?.polygon ||
                ward?.planning_boundary?.polygon;

            if (
                !Array.isArray(polygon) ||
                polygon.length < 3 ||
                polygon.some(point => !validOperationalMapPoint(point))
            ) {
                return;
            }

            const source =
                ward?.boundary?.source ||
                ward?.planning_boundary?.source ||
                "unknown";

            const selected =
                selectedWardId !== null &&
                Number(selectedWardId) === Number(ward.id);

            const boundary = L.polygon(
                polygon,
                {
                    color: selected
                        ? "#315b27"
                        : source === "official"
                            ? "#6e875f"
                            : "#9aa694",
                    weight: selected ? 3 : 2,
                    fillColor: selected
                        ? "#9dc87f"
                        : source === "official"
                            ? "#d6e2ce"
                            : "#edf1e8",
                    fillOpacity: selected ? 0.22 : 0.08,
                    dashArray: selected
                        ? "5 4"
                        : source === "official"
                            ? "5 4"
                            : "7 6"
                }
            ).addTo(map);

            boundary.bindPopup(
                `
                    <strong>${escapeHTML(`Ward ${ward.number}`)}</strong><br>
                    ${escapeHTML(ward.name || ward.code || "Operational ward")}<br>
                    <small>${source === "official"
                        ? "Official verified ward boundary"
                        : source === "assistant_defined"
                            ? "AC-defined operational ward boundary"
                            : source === "development"
                                ? "Presentation/demo ward boundary"
                                : "Ward boundary"}</small>
                `
            );

            layers.push(boundary);
        });
    }

    function renderAssignmentMap() {
        if (!state.assignmentMap || typeof window.L === "undefined") {
            return;
        }

        clearAssignmentMapLayers();

        if (
            Array.isArray(state.assignmentDivisionBoundary) &&
            state.assignmentDivisionBoundary.length >= 3
        ) {
            const divisionPolygon = L.polygon(
                state.assignmentDivisionBoundary,
                {
                    color: "#4f7d45",
                    weight: 2,
                    dashArray: "8 6",
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.06
                }
            ).addTo(state.assignmentMap);

            divisionPolygon.bindTooltip(
                "AC-defined Division working area • not an official KMC boundary",
                { sticky: true }
            );

            state.assignmentMapLayers.push(divisionPolygon);
        }

        renderWardBoundaryContext(
            state.assignmentMap,
            state.assignmentMapLayers,
            state.selectedAssignmentWardId
        );

        const selectedWard = state.wards.find(
            ward => Number(ward.id) === Number(state.selectedAssignmentWardId)
        );

        if (
            selectedWard?.boundary?.polygon?.length >= 3 &&
            Array.isArray(selectedWard.boundary.polygon)
        ) {
            const bounds = L.latLngBounds(selectedWard.boundary.polygon);
            state.assignmentMap.fitBounds(bounds.pad(0.10), { maxZoom: 16 });
        }

        if (
            state.assignmentOfficePoint &&
            validLatLng([
                state.assignmentOfficePoint.latitude,
                state.assignmentOfficePoint.longitude
            ])
        ) {
            const officeMarker = L.marker(
                [
                    Number(state.assignmentOfficePoint.latitude),
                    Number(state.assignmentOfficePoint.longitude)
                ],
                { icon: createOverviewOfficeIcon() }
            ).addTo(state.assignmentMap);

            officeMarker.bindTooltip(
                `${escapeHTML(
                    state.currentScope?.division_name ||
                    "KMC Divisional Office"
                )} • ${escapeHTML(
                    state.assignmentOfficePoint.label ||
                    state.currentScope?.office_location ||
                    "Divisional Office"
                )}`,
                { sticky: true }
            );

            officeMarker.bindPopup(
                `
                    <div class="truck-popup">
                        <strong>${escapeHTML(
                            state.currentScope?.division_name ||
                            "KMC Divisional Office"
                        )}</strong>
                        <span>${escapeHTML(
                            state.assignmentOfficePoint.address || ""
                        )}</span>
                    </div>
                `
            );

            state.assignmentMapLayers.push(officeMarker);
        }
    }

    function updateAssignmentAreaSummary() {
        if (!dom.assignmentAreaSummary) {
            return;
        }

        const ward = state.wards.find(
            item => Number(item.id) === Number(state.selectedAssignmentWardId)
        );

        if (!ward) {
            dom.assignmentAreaSummary.textContent =
                "Select a Ward to assign this Inspector. Ward boundaries are shown for reference.";
            dom.assignmentAreaSummary.dataset.selected = "false";
            return;
        }

        const source = ward?.boundary?.source;
        const boundaryText =
            source === "official"
                ? "Official ward boundary"
                : source === "assistant_defined"
                    ? "AC-defined ward boundary"
                    : source === "development"
                        ? "Presentation/demo ward boundary"
                        : "Boundary not configured";

        dom.assignmentAreaSummary.textContent =
            `${cleanText(ward.name, `Ward ${ward.number}`)} selected • ${boundaryText}. The selected Ward is the Inspector's jurisdiction. No separate Inspector polygon is maintained by the AC workflow.`;
        dom.assignmentAreaSummary.dataset.selected = "true";
    }

    function fitAssignmentMapToWard() {
        if (
            !state.assignmentMap ||
            !Array.isArray(state.assignmentWardBoundary) ||
            state.assignmentWardBoundary.length < 3
        ) {
            return;
        }

        const bounds = L.latLngBounds(
            state.assignmentWardBoundary
        );

        state.assignmentMap.fitBounds(
            bounds.pad(0.08),
            { maxZoom: 16 }
        );

        state.assignmentMap.setMaxBounds(
            bounds.pad(0.16)
        );

        state.assignmentMap.options.maxBoundsViscosity = 0.92;
    }

    function loadAssignmentWardMap(ward) {
        const divisionOperationalArea =
            getDivisionOperationalAreaFromState();

        state.assignmentDivisionBoundary =
            divisionOperationalArea?.polygon
                ? clonePolygon(divisionOperationalArea.polygon)
                : null;

        state.assignmentWardBoundary =
            Array.isArray(ward?.planning_boundary?.polygon)
                ? ward.planning_boundary.polygon.map(point => [
                    Number(point[0]),
                    Number(point[1])
                ])
                : Array.isArray(ward?.boundary?.polygon)
                    ? ward.boundary.polygon.map(point => [
                        Number(point[0]),
                        Number(point[1])
                    ])
                    : null;

        state.assignmentWardBoundarySource =
            ward?.planning_boundary?.source ||
            ward?.boundary?.source ||
            null;

        state.selectedAssignmentWardId = Number(ward?.id) || null;
        state.assignmentOfficePoint =
            state.mapData?.scope?.office_point ||
            null;

        state.assignmentArea = null;
        state.assignmentAreaDraft = [];

        renderAssignmentMap();
        updateAssignmentAreaSummary();

        if (!state.assignmentMap) {
            return;
        }

        state.assignmentMap.invalidateSize();

        const selectedBoundary =
            state.assignmentWardBoundary;

        if (selectedBoundary?.length >= 3) {
            state.assignmentMap.fitBounds(
                L.latLngBounds(selectedBoundary).pad(0.12),
                { maxZoom: 16 }
            );

            setAssignmentMapStatus(
                `Ward ${Number(ward.number)} is selected. The Ward boundary is the Inspector's jurisdiction. Any previous standalone Inspector-area geometry has been retired from the AC workflow.`,
                "success"
            );
        } else {
            state.assignmentMap.setMaxBounds(null);
            state.assignmentMap.setView(
                KOLHAPUR_MAP_CENTER,
                KOLHAPUR_MAP_ZOOM
            );

            setAssignmentMapStatus(
                "The selected Ward has no usable boundary geometry. The Ward can still be assigned, but its jurisdiction cannot be visualized until the Ward boundary is configured.",
                "warning"
            );
        }

        setAssignmentMode("idle");
    }

    function initializeAssignmentMap() {
        if (
            state.assignmentMap ||
            !dom.assignmentMap ||
            typeof window.L === "undefined"
        ) {
            return;
        }

        state.assignmentMap = L.map(
            dom.assignmentMap,
            {
                zoomControl: true,
                attributionControl: true
            }
        );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }
        ).addTo(state.assignmentMap);
    }

    function startAssignmentAreaSelection() {
        setAssignmentMapStatus(
            "Inspector area selection is no longer a separate workflow. Assign the Inspector to a Ward; the Ward boundary defines the jurisdiction.",
            "warning"
        );
    }

    function finishAssignmentAreaSelection() {
        setAssignmentMapStatus(
            "Inspector area selection is no longer a separate workflow. Assign the Inspector to a Ward.",
            "warning"
        );
    }

    function undoAssignmentAreaPoint() {
        state.assignmentAreaDraft = [];
        renderAssignmentMap();
        setAssignmentMode("idle");
    }

    function clearAssignmentAreaSelection() {
        state.assignmentArea = null;
        state.assignmentAreaDraft = [];
        renderAssignmentMap();
        updateAssignmentAreaSummary();
        setAssignmentMode("idle");
        setAssignmentMapStatus(
            "Select a Ward to view its operational boundary.",
            "neutral"
        );
    }

    function parseRequestSnapshot(value) {
        if (!value) {
            return null;
        }

        if (typeof value === "object") {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch {
            return {
                raw: String(value)
            };
        }
    }

    function showReviewChangeRequestMessage(message = "", type = "") {
        if (!dom.reviewChangeRequestMessage) {
            return;
        }

        dom.reviewChangeRequestMessage.textContent = String(message || "");
        dom.reviewChangeRequestMessage.className = "modal-message";

        if (message) {
            dom.reviewChangeRequestMessage.classList.add("show");
            if (type) {
                dom.reviewChangeRequestMessage.classList.add(type);
            }
        }
    }

    function openReviewChangeRequestModal(request) {
        if (!request || !dom.reviewChangeRequestModal) {
            return;
        }

        state.selectedChangeRequest = request;

        const requestType = String(request.request_type || "route_update");
        const requester = cleanText(
            request.requester_name || request.requester_email,
            "Inspector"
        );
        const route = cleanText(request.route_code, "Route");

        dom.reviewChangeRequestId.value = String(request.id);
        dom.reviewChangeRequestModalTitle.textContent =
            request.status === "pending"
                ? "Review Route Change Request"
                : "Route Change Request Details";
        dom.reviewChangeRequestSummary.innerHTML = `
            <strong>${escapeHTML(route)}</strong>\n            <span>${escapeHTML(requestType)} • Requested by ${escapeHTML(requester)}</span>\n            <span>Status: ${escapeHTML(request.status || "—")}</span>\n            <span>Requested: ${escapeHTML(request.requested_at || "—")}</span>
        `;

        const beforeSnapshot = parseRequestSnapshot(request.before_state);
        const afterSnapshot = parseRequestSnapshot(request.after_state);

        dom.reviewChangeRequestDetails.textContent = JSON.stringify(
            {
                before_state: beforeSnapshot,
                proposed_change: afterSnapshot
            },
            null,
            2
        );

        dom.reviewChangeRequestNotes.value = "";
        showReviewChangeRequestMessage("");

        const pending = request.status === "pending";
        dom.approveChangeRequestButton.disabled = !pending;
        dom.rejectChangeRequestButton.disabled = !pending;
        dom.reviewChangeRequestNotes.disabled = !pending;

        dom.reviewChangeRequestModal.hidden = false;
        dom.reviewChangeRequestModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    }

    function closeReviewChangeRequestModal() {
        if (!dom.reviewChangeRequestModal) {
            return;
        }

        dom.reviewChangeRequestModal.hidden = true;
        dom.reviewChangeRequestModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        state.selectedChangeRequest = null;
        showReviewChangeRequestMessage("");
    }

    async function reviewRouteChangeRequest(decision) {
        const request = state.selectedChangeRequest;

        if (!request || request.status !== "pending") {
            return;
        }

        const reviewNotes = String(
            dom.reviewChangeRequestNotes?.value || ""
        ).trim();

        if (reviewNotes.length > 1000) {
            showReviewChangeRequestMessage(
                "Review notes cannot exceed 1000 characters.",
                "error"
            );
            return;
        }

        dom.approveChangeRequestButton.disabled = true;
        dom.rejectChangeRequestButton.disabled = true;
        dom.cancelReviewChangeRequestButton.disabled = true;

        const originalApprove = dom.approveChangeRequestButton.textContent;
        const originalReject = dom.rejectChangeRequestButton.textContent;

        dom.approveChangeRequestButton.textContent = "Processing…";
        dom.rejectChangeRequestButton.textContent = "Processing…";
        showReviewChangeRequestMessage(
            decision === "approved"
                ? "Applying the approved route change…"
                : "Rejecting the route change request…"
        );

        try {
            const payload = await fetchJSON(
                `${API_BASE}/route-change-requests/${Number(request.id)}/review`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        decision,
                        review_notes: reviewNotes
                    })
                }
            );

            closeReviewChangeRequestModal();
            showToast(payload.message || "Route change request reviewed.");

            await Promise.all([
                loadSupervision(),
                loadMapData(),
                loadOverview()
            ]);
        } catch (error) {
            console.error("Route change review failed:", error);

            if (handleUnauthorized(error)) {
                closeReviewChangeRequestModal();
                return;
            }

            showReviewChangeRequestMessage(
                error.message || "Unable to review the route change request.",
                "error"
            );
        } finally {
            dom.approveChangeRequestButton.disabled = false;
            dom.rejectChangeRequestButton.disabled = false;
            dom.cancelReviewChangeRequestButton.disabled = false;
            dom.approveChangeRequestButton.textContent = originalApprove;
            dom.rejectChangeRequestButton.textContent = originalReject;
        }
    }

    async function loadOverview() {
        const payload =
            await fetchJSON(`${API_BASE}/overview`);

        state.overview = payload;

        renderOverview(payload);
    }

    async function loadWards() {
        const payload =
            await fetchJSON(`${API_BASE}/wards`);

        state.wards =
            Array.isArray(payload.wards)
                ? payload.wards
                : [];

        if (payload.division) {
            state.currentScope = {
                ...(state.currentScope || {}),
                division_id: payload.division.id,
                division_code: payload.division.code,
                division_name: payload.division.name,
                planning_boundary:
                    payload.division.planning_boundary ||
                    state.currentScope?.planning_boundary ||
                    null,
                operational_area:
                    payload.division.operational_area ||
                    state.currentScope?.operational_area ||
                    null
            };

            state.divisionOperationalArea =
                payload.division.operational_area ||
                state.divisionOperationalArea ||
                null;
        }

        renderWards();
    }

    async function loadInspectors() {
        const payload =
            await fetchJSON(`${API_BASE}/inspectors`);

        state.inspectors =
            Array.isArray(payload.inspectors)
                ? payload.inspectors
                : [];

        renderInspectors();
        renderCoverage();

        // Map rendering can finish before the Inspector query because the
        // dashboard loads data in parallel. Refresh once the Inspector
        // operational areas are available so the smaller saved areas are
        // actually visible on the Overview map.
        if (state.mapData && state.overviewMap) {
            await refreshOverviewMap();
        }
    }


    function supervisionEmptyRow(message, colspan) {
        return `
            <tr>
                <td colspan="${Number(colspan)}" class="table-empty">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;
    }

    function renderSupervision(data) {
        state.supervision = data || null;
        const summary = data?.summary || {};

        if (dom.supervisionRoutesMetric) {
            dom.supervisionRoutesMetric.textContent =
                numberOrZero(summary.routes_total);
        }
        if (dom.supervisionVehiclesMetric) {
            dom.supervisionVehiclesMetric.textContent =
                numberOrZero(summary.vehicles_visible);
        }
        if (dom.supervisionDriversMetric) {
            dom.supervisionDriversMetric.textContent =
                numberOrZero(summary.drivers_visible);
        }
        if (dom.supervisionCollectionMetric) {
            dom.supervisionCollectionMetric.textContent =
                numberOrZero(summary.collections_total);
        }
        if (dom.supervisionComplaintMetric) {
            dom.supervisionComplaintMetric.textContent =
                numberOrZero(summary.open_complaints);
        }
        if (dom.supervisionPendingMetric) {
            dom.supervisionPendingMetric.textContent =
                numberOrZero(summary.pending_change_requests);
        }
        if (dom.supervisionCompletionMetric) {
            dom.supervisionCompletionMetric.textContent =
                `${Number(summary.route_completion_rate || 0).toFixed(1)}%`;
        }
        if (dom.supervisionDelayMetric) {
            dom.supervisionDelayMetric.textContent =
                `${numberOrZero(summary.total_delay_minutes)} min`;
        }

        const routes = Array.isArray(data?.routes) ? data.routes : [];
        const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
        const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
        const collections = Array.isArray(data?.collections) ? data.collections : [];
        const complaints = Array.isArray(data?.complaints) ? data.complaints : [];
        const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
        const changeRequests = Array.isArray(data?.route_change_requests)
            ? data.route_change_requests
            : [];

        if (dom.operationNavCount) {
            const pendingRequests = changeRequests.filter(
                item => String(item.status || "").toLowerCase() === "pending"
            ).length;
            dom.operationNavCount.textContent =
                pendingRequests ? `${pendingRequests} PENDING` : "VIEW";
        }

        if (dom.supervisionRoutesTableBody) {
            dom.supervisionRoutesTableBody.innerHTML = routes.length
                ? routes.map(route => `
                    <tr>
                        <td><strong>${escapeHTML(route.code || "—")}</strong><div>${escapeHTML(route.name || "—")}</div></td>
                        <td>${escapeHTML(route.ward?.name || `Ward ${route.ward?.number ?? "—"}`)}</td>
                        <td><span class="status-pill ${escapeHTML(route.status || "")}">${escapeHTML(route.status || "—")}</span></td>
                        <td>${Number(route.completed_stops || 0)} / ${Number(route.total_stops || 0)}</td>
                        <td>${Number(route.delay_minutes || 0)} min</td>
                        <td>${escapeHTML(route.vehicle?.vehicle_number || "Unassigned")}</td>
                        <td>${escapeHTML(route.driver?.name || "Unassigned")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No routes are currently visible for this Division.", 7);
        }

        if (dom.supervisionVehiclesTableBody) {
            dom.supervisionVehiclesTableBody.innerHTML = vehicles.length
                ? vehicles.map(vehicle => `
                    <tr>
                        <td><strong>${escapeHTML(vehicle.vehicle_number || "—")}</strong><div>${escapeHTML(vehicle.registration_number || "—")}</div></td>
                        <td>${escapeHTML(vehicle.vehicle_type || "—")}</td>
                        <td><span class="status-pill">${escapeHTML(vehicle.status || "—")}</span></td>
                        <td>${vehicle.route_code ? escapeHTML(vehicle.route_code) : "—"}</td>
                        <td>${escapeHTML(vehicle.driver_name || "—")}</td>
                        <td>${escapeHTML(vehicle.last_location_at || "—")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No vehicle records are currently visible through Division route assignments.", 6);
        }

        if (dom.supervisionDriversTableBody) {
            dom.supervisionDriversTableBody.innerHTML = drivers.length
                ? drivers.map(driver => `
                    <tr>
                        <td><strong>${escapeHTML(driver.full_name || "—")}</strong><div>${escapeHTML(driver.employee_id || driver.email || "—")}</div></td>
                        <td>${escapeHTML(driver.status || "—")}</td>
                        <td>${escapeHTML(driver.ward_name || "Unassigned")}</td>
                        <td>${escapeHTML(driver.vehicle_number || "—")}</td>
                        <td>${escapeHTML(driver.route_code || "—")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No driver records are currently visible for this Division.", 5);
        }

        if (dom.supervisionCollectionsTableBody) {
            dom.supervisionCollectionsTableBody.innerHTML = collections.length
                ? collections.map(item => `
                    <tr>
                        <td>${escapeHTML(item.collection_date || "—")}</td>
                        <td>${escapeHTML(item.ward_name || "—")}</td>
                        <td>${escapeHTML(item.route_code || "—")}</td>
                        <td>${escapeHTML(item.status || "—")}</td>
                        <td>${Number(item.waste_tons || 0).toFixed(2)}</td>
                        <td>${escapeHTML(item.collected_at || "—")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No collection records are currently available for this Division.", 6);
        }

        if (dom.supervisionComplaintsTableBody) {
            dom.supervisionComplaintsTableBody.innerHTML = complaints.length
                ? complaints.map(item => `
                    <tr>
                        <td><strong>${escapeHTML(item.complaint_code || "—")}</strong></td>
                        <td>${escapeHTML(item.complaint_type || "—")}</td>
                        <td>${escapeHTML(item.ward_name || "—")}</td>
                        <td><span class="status-pill">${escapeHTML(item.status || "—")}</span></td>
                        <td>${escapeHTML(item.priority || "—")}</td>
                        <td>${escapeHTML(item.reported_at || "—")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No complaint records are currently available for this Division.", 6);
        }

        if (dom.supervisionNotificationsTableBody) {
            dom.supervisionNotificationsTableBody.innerHTML = notifications.length
                ? notifications.map(item => `
                    <tr>
                        <td><strong>${escapeHTML(item.title || "—")}</strong><div>${escapeHTML(item.message || "—")}</div></td>
                        <td>${escapeHTML(item.notification_type || "—")}</td>
                        <td>${escapeHTML(item.priority || "—")}</td>
                        <td>${Number(item.is_read) ? "Read" : "Unread"}</td>
                        <td>${escapeHTML(item.created_at || "—")}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No notifications are currently addressed to this Assistant Commissioner.", 5);
        }

        if (dom.supervisionChangeRequestsTableBody) {
            dom.supervisionChangeRequestsTableBody.innerHTML = changeRequests.length
                ? changeRequests.map(item => {
                    const pending = String(item.status || "").toLowerCase() === "pending";
                    return `
                        <tr>
                            <td><strong>${escapeHTML(item.route_code || "—")}</strong><div>${escapeHTML(item.route_name || "—")}</div></td>
                            <td>${escapeHTML(item.request_type || "—")}</td>
                            <td>${escapeHTML(item.requester_name || item.requester_email || "—")}</td>
                            <td><span class="status-pill">${escapeHTML(item.status || "—")}</span></td>
                            <td>${escapeHTML(item.requested_at || "—")}</td>
                            <td>
                                <button
                                    type="button"
                                    class="assign-action-button review-request-button"
                                    data-action="review-route-request"
                                    data-request-id="${Number(item.id)}"
                                    ${pending ? "" : "disabled"}
                                >
                                    ${pending ? "Review" : "View"}
                                </button>
                            </td>
                        </tr>
                    `;
                }).join("")
                : supervisionEmptyRow("No pending or historical route-change requests are currently visible for this Division.", 6);
        }

        if (dom.supervisionStatus) {
            dom.supervisionStatus.textContent =
                data?.generated_at
                    ? `Read-only snapshot • ${data.generated_at}`
                    : "Read-only operational snapshot";
        }
    }

    function getReportDateDefaults() {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 29);

        const format = date => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        return {
            from: format(from),
            to: format(to)
        };
    }

    function renderReportStatusList(container, items, total) {
        if (!container) {
            return;
        }

        const denominator = Math.max(1, Number(total || 0));

        container.innerHTML = items.map(item => {
            const count = Number(item.count || 0);
            const percentage = Number((count / denominator * 100).toFixed(1));
            return `
                <div class="report-status-row">
                    <div>
                        <div class="report-status-head">
                            <span>${escapeHTML(item.label)}</span>
                            <strong>${count}</strong>
                        </div>
                        <div class="report-progress-track">
                            <div class="report-progress-fill" style="width:${Math.min(100, Math.max(0, percentage))}%"></div>
                        </div>
                    </div>
                    <span class="report-status-share">${percentage.toFixed(1)}%</span>
                </div>
            `;
        }).join("");
    }

    function renderFleetSummary(summary) {
        if (!dom.reportFleetSummary) {
            return;
        }

        dom.reportFleetSummary.innerHTML = `
            <div class="report-fleet-item"><span>Deployed</span><strong>${numberOrZero(summary.vehicles_deployed)}</strong></div>
            <div class="report-fleet-item"><span>Average load</span><strong>${Number(summary.average_current_load_percent || 0).toFixed(1)}%</strong></div>
            <div class="report-fleet-item"><span>En route</span><strong>${numberOrZero(summary.vehicles_en_route)}</strong></div>
            <div class="report-fleet-item"><span>Collecting</span><strong>${numberOrZero(summary.vehicles_collecting)}</strong></div>
            <div class="report-fleet-item"><span>Delayed</span><strong>${numberOrZero(summary.vehicles_delayed)}</strong></div>
            <div class="report-fleet-item"><span>Inspectors</span><strong>${numberOrZero(summary.inspectors_assigned)} assigned</strong></div>
        `;
    }

    function renderDailyActivityChart(data) {
        if (!dom.reportDailyActivityChart) {
            return;
        }

        const collections = new Map(
            (Array.isArray(data?.collection_trend) ? data.collection_trend : [])
                .map(row => [String(row.date).slice(0, 10), Number(row.records || 0)])
        );
        const complaints = new Map(
            (Array.isArray(data?.complaint_trend) ? data.complaint_trend : [])
                .map(row => [String(row.date).slice(0, 10), Number(row.records || 0)])
        );

        const dates = Array.from(new Set([...collections.keys(), ...complaints.keys()])).sort();

        if (!dates.length) {
            dom.reportDailyActivityChart.innerHTML =
                '<div class="report-chart-empty">No daily activity was recorded for the selected period.</div>';
            return;
        }

        const maxValue = Math.max(
            1,
            ...dates.map(date => Math.max(
                Number(collections.get(date) || 0),
                Number(complaints.get(date) || 0)
            ))
        );

        dom.reportDailyActivityChart.innerHTML = dates.map(date => {
            const collectionCount = Number(collections.get(date) || 0);
            const complaintCount = Number(complaints.get(date) || 0);
            const collectionHeight = collectionCount > 0
                ? Math.max(4, Math.round(collectionCount / maxValue * 145))
                : 2;
            const complaintHeight = complaintCount > 0
                ? Math.max(4, Math.round(complaintCount / maxValue * 145))
                : 2;

            return `
                <div class="report-chart-day" title="${escapeHTML(date)}: ${collectionCount} collections, ${complaintCount} complaints">
                    <div class="report-chart-bars">
                        <span class="report-chart-bar collection" style="height:${collectionHeight}px"></span>
                        <span class="report-chart-bar complaints" style="height:${complaintHeight}px"></span>
                    </div>
                    <span class="report-chart-label">${escapeHTML(date.slice(5))}</span>
                </div>
            `;
        }).join("");
    }

    function renderReports(data) {
        state.reports = data || null;
        const summary = data?.summary || {};
        const period = data?.period || {};

        if (dom.reportFromDate && period.from_date) {
            dom.reportFromDate.value = period.from_date;
        }
        if (dom.reportToDate && period.to_date) {
            dom.reportToDate.value = period.to_date;
        }

        if (dom.reportsPeriodBadge) {
            dom.reportsPeriodBadge.textContent =
                `${period.from_date || "—"} → ${period.to_date || "—"}`;
        }

        if (dom.reportsSubtitle) {
            dom.reportsSubtitle.textContent =
                `Measured divisional activity from ${period.from_date || "the selected start"} through ${period.to_date || "the selected end"}. Current route, fleet and Inspector metrics reflect the present operational state.`;
        }

        if (dom.reportNavCount) {
            const days = Number(period.day_count || 30);
            dom.reportNavCount.textContent = days === 30 ? "30D" : `${days}D`;
        }

        if (dom.reportCollectionsMetric) dom.reportCollectionsMetric.textContent = numberOrZero(summary.collections_total);
        if (dom.reportWasteMetric) dom.reportWasteMetric.textContent = `${Number(summary.waste_tons_total || 0).toFixed(2)} t`;
        if (dom.reportCollectionRateMetric) dom.reportCollectionRateMetric.textContent = `${Number(summary.collection_completion_rate || 0).toFixed(1)}%`;
        if (dom.reportRouteRateMetric) dom.reportRouteRateMetric.textContent = `${Number(summary.route_completion_rate || 0).toFixed(1)}%`;
        if (dom.reportDelayedRoutesMetric) dom.reportDelayedRoutesMetric.textContent = numberOrZero(summary.routes_delayed);
        if (dom.reportOpenComplaintsMetric) dom.reportOpenComplaintsMetric.textContent = numberOrZero(summary.open_complaints);
        if (dom.reportVehiclesMetric) dom.reportVehiclesMetric.textContent = numberOrZero(summary.vehicles_deployed);
        if (dom.reportInspectorCoverageMetric) dom.reportInspectorCoverageMetric.textContent = `${Number(summary.inspector_coverage_rate || 0).toFixed(1)}%`;

        renderReportStatusList(
            dom.reportRouteStatusList,
            [
                { label: "Scheduled", count: summary.routes_scheduled },
                { label: "Active", count: summary.routes_active },
                { label: "Delayed", count: summary.routes_delayed },
                { label: "Completed", count: summary.routes_completed },
                { label: "Cancelled", count: summary.routes_cancelled }
            ],
            summary.routes_total
        );

        renderReportStatusList(
            dom.reportCollectionStatusList,
            [
                { label: "Collected", count: summary.collected_records },
                { label: "In progress", count: summary.in_progress_records },
                { label: "Skipped", count: summary.skipped_records }
            ],
            summary.collections_total
        );

        renderReportStatusList(
            dom.reportComplaintStatusList,
            [
                { label: "Open", count: summary.open_complaints },
                { label: "In progress", count: summary.in_progress_complaints },
                { label: "Resolved", count: summary.resolved_complaints },
                { label: "Cancelled", count: summary.cancelled_complaints }
            ],
            summary.complaints_total
        );

        renderFleetSummary(summary);
        renderDailyActivityChart(data);

        if (dom.reportWardTableBody) {
            const wards = Array.isArray(data?.ward_performance) ? data.ward_performance : [];
            dom.reportWardTableBody.innerHTML = wards.length
                ? wards.map(ward => `
                    <tr>
                        <td><strong>${escapeHTML(ward.ward_code || `WARD-${ward.ward_number}`)}</strong><div>${escapeHTML(ward.ward_name || `Ward ${ward.ward_number}`)}</div></td>
                        <td>${Number(ward.routes_completed || 0)} / ${Number(ward.routes_total || 0)}${ward.routes_delayed ? ` <span class="report-status-share">(${ward.routes_delayed} delayed)</span>` : ""}</td>
                        <td>${Number(ward.stops_collected || 0)} / ${Number(ward.stops_total || 0)}</td>
                        <td><span class="report-rate-cell"><span>${Number(ward.route_completion_rate || 0).toFixed(1)}%</span><span class="report-rate-track"><span class="report-rate-fill" style="width:${Math.min(100, Math.max(0, Number(ward.route_completion_rate || 0)))}%"></span></span></span></td>
                        <td>${numberOrZero(ward.collection_records)}</td>
                        <td>${Number(ward.waste_tons || 0).toFixed(2)}</td>
                        <td>${numberOrZero(ward.complaint_records)}${Number(ward.complaint_records || 0) ? ` <span class="report-status-share">(${Number(ward.complaints_resolved || 0)} resolved)</span>` : ""}</td>
                        <td>${Number(ward.inspectors_assigned || 0) > 0 ? `${ward.inspectors_assigned} assigned` : "Unassigned"}</td>
                    </tr>
                `).join("")
                : supervisionEmptyRow("No active wards are currently available in this Division.", 8);
        }

        if (dom.reportsStatus) {
            const generatedAt = data?.generated_at
                ? new Date(data.generated_at).toLocaleString()
                : "—";
            dom.reportsStatus.textContent = `Report generated ${generatedAt}`;
        }
    }

    async function loadReports() {
        try {
            const defaults = getReportDateDefaults();
            const fromDate = String(dom.reportFromDate?.value || defaults.from);
            const toDate = String(dom.reportToDate?.value || defaults.to);
            const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });

            if (dom.reportsStatus) {
                dom.reportsStatus.textContent = "Loading report data…";
            }

            const payload = await fetchJSON(`${API_BASE}/reports?${params.toString()}`);
            renderReports(payload);
            return payload;
        } catch (error) {
            console.error("Assistant Commissioner reports load error:", error);
            if (dom.reportsStatus) {
                dom.reportsStatus.textContent = error.message || "Unable to load divisional reports.";
            }
            if (dom.reportWardTableBody) {
                dom.reportWardTableBody.innerHTML = supervisionEmptyRow("Unable to load the report data.", 8);
            }
            throw error;
        }
    }

    async function loadSupervision() {
        try {
            const payload = await fetchJSON(`${API_BASE}/supervision`);
            renderSupervision(payload);
            return payload;
        } catch (error) {
            console.error("Assistant Commissioner supervision load error:", error);
            if (dom.supervisionStatus) {
                dom.supervisionStatus.textContent =
                    error.message || "Unable to load operational supervision.";
            }
            throw error;
        }
    }

    async function loadAll() {
        if (state.loading) {
            return;
        }

        state.loading = true;

        setSystemStatus("Loading…");
        showPageMessage("");

        try {
            const results = await Promise.all([
                loadOverview(),
                loadWards(),
                loadInspectors(),
                loadMapData(),
                loadAssistantProfile()
            ]);

            void results;

            try {
                await loadSupervision();
            } catch (supervisionError) {
                console.warn(
                    "Operational supervision is temporarily unavailable:",
                    supervisionError
                );
            }

            try {
                await loadReports();
            } catch (reportsError) {
                console.warn(
                    "Divisional reports are temporarily unavailable:",
                    reportsError
                );
            }

            setSystemStatus("System operational");
        } catch (error) {
            console.error(
                "Assistant Commissioner dashboard load error:",
                error
            );

            if (handleUnauthorized(error)) {
                return;
            }

            setSystemStatus("Connection error", true);

            showPageMessage(
                error.message ||
                    "Unable to load the Assistant Commissioner dashboard.",
                "error"
            );
        } finally {
            state.loading = false;
        }
    }

    async function saveInspectorAssignment(event) {
        event.preventDefault();

        const inspectorId =
            Number(dom.assignmentInspectorId?.value);

        const wardId =
            Number(dom.assignmentWardSelect?.value);

        const reason =
            String(
                dom.assignmentReason?.value || ""
            ).trim();

        if (!Number.isInteger(inspectorId) || inspectorId <= 0) {
            showAssignmentMessage(
                "The selected Inspector is invalid.",
                "error"
            );
            return;
        }

        if (!Number.isInteger(wardId) || wardId <= 0) {
            showAssignmentMessage(
                "Please select a ward.",
                "error"
            );
            dom.assignmentWardSelect?.focus();
            return;
        }

        if (reason.length > 500) {
            showAssignmentMessage(
                "Reason cannot exceed 500 characters.",
                "error"
            );
            return;
        }

        const targetWard = state.wards.find(
            ward => Number(ward.id) === wardId
        );

        if (!targetWard) {
            showAssignmentMessage(
                "The selected ward is not available in your assigned division.",
                "error"
            );
            return;
        }

        const inspector =
            state.inspectors.find(
                item =>
                    Number(item.user_id) === inspectorId
            );

        if (!inspector?.has_profile) {
            showAssignmentMessage(
                "The Inspector must complete their basic profile before receiving a jurisdiction.",
                "error"
            );
            return;
        }

        const existingDivisionId =
            inspector.scope?.division_id;

        if (
            existingDivisionId !== null &&
            existingDivisionId !== undefined &&
            state.currentScope?.division_id &&
            Number(existingDivisionId) !==
                Number(state.currentScope.division_id)
        ) {
            showAssignmentMessage(
                "This Inspector belongs to another division and cannot be transferred from this dashboard.",
                "error"
            );
            return;
        }

        const originalText =
            dom.saveInspectorAssignmentButton.textContent;

        dom.saveInspectorAssignmentButton.disabled = true;
        dom.cancelAssignInspectorButton.disabled = true;

        dom.saveInspectorAssignmentButton.textContent =
            "Saving…";

        showAssignmentMessage(
            "Validating assignment and saving the new jurisdiction…"
        );

        try {
            const payload =
                await fetchJSON(
                    `${API_BASE}/inspectors/${inspectorId}/scope`,
                    {
                        method: "PUT",
                        body: JSON.stringify({
                            ward_id: wardId,
                            reason
                        })
                    }
                );

            closeAssignmentModal();

            showToast(
                payload.message ||
                    "Inspector jurisdiction saved."
            );

            await loadAll();
        } catch (error) {
            console.error(
                "Inspector scope assignment error:",
                error
            );

            if (handleUnauthorized(error)) {
                closeAssignmentModal();
                return;
            }

            showAssignmentMessage(
                error.message ||
                    "Unable to save the Inspector's jurisdiction.",
                "error"
            );
        } finally {
            dom.saveInspectorAssignmentButton.disabled = false;
            dom.cancelAssignInspectorButton.disabled = false;
            dom.saveInspectorAssignmentButton.textContent =
                originalText;
        }
    }

    function handleInspectorTableClick(event) {
        const button =
            event.target.closest(
                '[data-action="assign-inspector"]'
            );

        if (!button) {
            return;
        }

        const inspectorId =
            Number(button.dataset.inspectorId);

        const inspector =
            state.inspectors.find(
                item =>
                    Number(item.user_id) === inspectorId
            );

        if (!inspector) {
            showToast(
                "Inspector record is no longer available. Refreshing…"
            );
            loadAll();
            return;
        }

        openAssignmentModal(inspector);
    }

    async function logout() {
        const buttons = [
            dom.logoutButton,
            dom.headerLogoutButton
        ].filter(Boolean);

        buttons.forEach(button => {
            button.disabled = true;
        });

        try {
            await fetchJSON("/api/auth/logout", {
                method: "POST"
            });

            state.csrfToken = null;
            window.location.replace("/login/");
        } catch (error) {
            console.error(
                "Assistant Commissioner logout error:",
                error
            );

            buttons.forEach(button => {
                button.disabled = false;
            });

            if (error?.status === 401) {
                state.csrfToken = null;
            window.location.replace("/login/");
                return;
            }

            showToast(
                error.message ||
                    "Unable to log out. Please try again."
            );
        }
    }

    function bindEvents() {
        document.addEventListener(
            "click",
            event => {
                const tabButton =
                    event.target.closest("[data-tab]");

                if (
                    tabButton &&
                    tabButton.closest(".sidebar, .panel-card")
                ) {
                    event.preventDefault();
                    setActiveTab(
                        tabButton.dataset.tab
                    );
                    return;
                }

                if (
                    event.target ===
                    dom.mobileBackdrop
                ) {
                    closeMobileNavigation();
                    return;
                }

                if (event.target === dom.createWardModal) {
                    closeCreateWardModal();
                    return;
                }

                if (event.target === dom.assignInspectorModal) {
                    closeAssignmentModal();
                    return;
                }

                if (event.target === dom.createInspectorAccountModal) {
                    closeCreateInspectorAccountModal();
                    return;
                }

                if (event.target === dom.reviewChangeRequestModal) {
                    closeReviewChangeRequestModal();
                    return;
                }

                if (event.target.closest("#createInspectorAccountButton")) {
                    event.preventDefault();
                    openCreateInspectorAccountModal();
                    return;
                }

                if (
                    event.target === dom.closeCreateInspectorAccountModal ||
                    event.target === dom.cancelCreateInspectorAccountButton
                ) {
                    closeCreateInspectorAccountModal();
                    return;
                }

                if (
                    event.target ===
                    dom.closeAssignInspectorModal ||
                    event.target ===
                    dom.cancelAssignInspectorButton
                ) {
                    closeAssignmentModal();
                    return;
                }

                if (
                    event.target ===
                    dom.closeCreateWardModal ||
                    event.target ===
                    dom.cancelCreateWardButton
                ) {
                    closeCreateWardModal();
                    return;
                }

                if (
                    event.target ===
                    dom.openProfileButton
                ) {
                    window.location.href =
                        PROFILE_URL;
                    return;
                }
            }
        );

        dom.inspectorsTableBody?.addEventListener(
            "click",
            handleInspectorTableClick
        );

        dom.assignInspectorForm?.addEventListener(
            "submit",
            saveInspectorAssignment
        );

        dom.createInspectorAccountForm?.addEventListener(
            "submit",
            saveInspectorAccount
        );

        dom.mobileMenuButton?.addEventListener(
            "click",
            openMobileNavigation
        );

        dom.mobileBackdrop?.addEventListener(
            "click",
            closeMobileNavigation
        );

        dom.sidebarToggleButton?.addEventListener(
            "click",
            toggleSidebar
        );

        dom.sidebarBrandButton?.addEventListener(
            "click",
            () => setActiveTab("overview")
        );

        dom.supervisionChangeRequestsTableBody?.addEventListener(
            "click",
            event => {
                const button = event.target.closest(
                    '[data-action="review-route-request"]'
                );

                if (!button || button.disabled) {
                    return;
                }

                const requestId = Number(button.dataset.requestId);
                const request = (state.supervision?.route_change_requests || []).find(
                    item => Number(item.id) === requestId
                );

                if (!request) {
                    showToast("Route change request is no longer available. Refreshing…");
                    void loadSupervision();
                    return;
                }

                openReviewChangeRequestModal(request);
            }
        );

        dom.closeReviewChangeRequestModal?.addEventListener(
            "click",
            closeReviewChangeRequestModal
        );

        dom.cancelReviewChangeRequestButton?.addEventListener(
            "click",
            closeReviewChangeRequestModal
        );

        dom.approveChangeRequestButton?.addEventListener(
            "click",
            () => void reviewRouteChangeRequest("approved")
        );

        dom.rejectChangeRequestButton?.addEventListener(
            "click",
            () => void reviewRouteChangeRequest("rejected")
        );

        dom.supervisionRefreshButton?.addEventListener(
            "click",
            async () => {
                const button = dom.supervisionRefreshButton;
                const original = button.textContent;
                button.disabled = true;
                button.textContent = "Refreshing…";
                try {
                    await loadSupervision();
                } finally {
                    button.disabled = false;
                    button.textContent = original;
                }
            }
        );

        dom.reportApplyButton?.addEventListener(
            "click",
            async () => {
                const from = String(dom.reportFromDate?.value || "").trim();
                const to = String(dom.reportToDate?.value || "").trim();

                if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
                    showToast("Please select valid report dates.");
                    return;
                }
                if (from > to) {
                    showToast("Report start date cannot be after the end date.");
                    return;
                }

                const button = dom.reportApplyButton;
                const original = button.textContent;
                button.disabled = true;
                button.textContent = "Applying…";
                try {
                    await loadReports();
                } finally {
                    button.disabled = false;
                    button.textContent = original;
                }
            }
        );

        dom.reportRefreshButton?.addEventListener(
            "click",
            async () => {
                const button = dom.reportRefreshButton;
                const original = button.textContent;
                button.disabled = true;
                button.textContent = "Refreshing…";
                try {
                    await loadReports();
                } finally {
                    button.disabled = false;
                    button.textContent = original;
                }
            }
        );

        dom.logoutButton?.addEventListener(
            "click",
            logout
        );

        dom.headerLogoutButton?.addEventListener(
            "click",
            logout
        );

        dom.closeAssignInspectorModal?.addEventListener(
            "click",
            closeAssignmentModal
        );

        dom.cancelAssignInspectorButton?.addEventListener(
            "click",
            closeAssignmentModal
        );

        dom.assignmentWardSelect?.addEventListener(
            "change",
            () => {
                const wardId = Number(
                    dom.assignmentWardSelect.value
                );

                const ward = state.wards.find(
                    item => Number(item.id) === wardId
                );

                state.selectedAssignmentWardId = ward ? Number(ward.id) : null;

                if (!ward) {
                    state.assignmentDivisionBoundary = null;
                    state.assignmentWardBoundary = null;
                    state.assignmentWardBoundarySource = null;
                    state.assignmentOfficePoint = null;
                    state.assignmentArea = null;
                    state.assignmentAreaDraft = [];
                    renderAssignmentMap();
                    updateAssignmentAreaSummary();
                    setAssignmentMapStatus(
                        "Select a ward to load the Inspector assignment map.",
                        "neutral"
                    );
                    setAssignmentMode("idle");
                    return;
                }

                loadAssignmentWardMap(ward);
            }
        );

        dom.wardsTableBody?.addEventListener(
            "click",
            event => {
                const button = event.target.closest(
                    '[data-action="edit-ward-boundary"]'
                );

                if (!button) {
                    return;
                }

                const wardId = Number(button.dataset.wardId);
                const ward = state.wards.find(
                    item => Number(item.id) === wardId
                );

                if (!ward) {
                    showToast(
                        "Ward record is no longer available. Refreshing…"
                    );
                    void loadAll();
                    return;
                }

                void openEditWardBoundaryModal(ward);
            }
        );

        dom.overviewMapPlus?.addEventListener(
            "click",
            () => {
                state.overviewMap?.zoomIn();
            }
        );

        dom.overviewMapMinus?.addEventListener(
            "click",
            () => {
                state.overviewMap?.zoomOut();
            }
        );

        dom.overviewMapRoutesButton?.addEventListener(
            "click",
            async () => {
                state.overviewMapRouteVisibility =
                    !state.overviewMapRouteVisibility;

                updateOverviewMapButtonState();

                if (state.mapData) {
                    await refreshOverviewMap();
                }
            }
        );

        dom.overviewMapWardsButton?.addEventListener(
            "click",
            async () => {
                state.overviewMapWardVisibility =
                    !state.overviewMapWardVisibility;

                updateOverviewMapButtonState();

                if (state.mapData) {
                    await refreshOverviewMap();
                }
            }
        );

        dom.overviewMapVehiclesButton?.addEventListener(
            "click",
            async () => {
                state.overviewMapVehicleVisibility =
                    !state.overviewMapVehicleVisibility;

                updateOverviewMapButtonState();

                if (state.mapData) {
                    await refreshOverviewMap();
                }
            }
        );

        dom.overviewMapEditDivisionButton?.addEventListener(
            "click",
            () => {
                void beginDivisionAreaEditing();
            }
        );

        dom.overviewMapSaveDivisionButton?.addEventListener(
            "click",
            saveDivisionArea
        );

        dom.overviewMapCancelDivisionButton?.addEventListener(
            "click",
            () => {
                void cancelDivisionAreaEditing();
            }
        );

        dom.overviewMapFullscreenButton?.addEventListener(
            "click",
            () => {
                toggleMapFullscreen(
                    document.querySelector(".overview-map-card"),
                    dom.overviewMapFullscreenButton,
                    "Open overview map in full screen",
                    "Exit overview map full screen"
                );
            }
        );

        dom.assignmentMapFullscreenButton?.addEventListener(
            "click",
            () => {
                toggleMapFullscreen(
                    document.querySelector(".assignment-map-section"),
                    dom.assignmentMapFullscreenButton,
                    "Open Inspector assignment map in full screen",
                    "Exit Inspector assignment map full screen"
                );
            }
        );

        dom.createWardButton?.addEventListener(
            "click",
            openCreateWardModal
        );

        dom.closeCreateWardModal?.addEventListener(
            "click",
            closeCreateWardModal
        );

        dom.cancelCreateWardButton?.addEventListener(
            "click",
            closeCreateWardModal
        );

        dom.createWardForm?.addEventListener(
            "submit",
            saveOperationalWard
        );

        dom.wardCreateSelectAreaButton?.addEventListener(
            "click",
            startWardCreateAreaSelection
        );

        dom.wardCreateFinishAreaButton?.addEventListener(
            "click",
            finishWardCreateAreaSelection
        );

        dom.wardCreateUndoPointButton?.addEventListener(
            "click",
            undoWardCreatePoint
        );

        dom.wardCreateClearAreaButton?.addEventListener(
            "click",
            clearWardCreateArea
        );

        dom.closeEditWardBoundaryModal?.addEventListener(
            "click",
            closeEditWardBoundaryModal
        );

        dom.cancelEditWardBoundaryButton?.addEventListener(
            "click",
            closeEditWardBoundaryModal
        );

        dom.editWardBoundaryForm?.addEventListener(
            "submit",
            saveEditedWardBoundary
        );

        dom.editWardBoundarySelectModeButton?.addEventListener(
            "click",
            () => {
                setWardBoundaryEditMode(
                    state.wardBoundaryEditMode === "add"
                        ? "idle"
                        : "add"
                );
                setWardBoundaryEditStatus(
                    state.wardBoundaryEditMode === "add"
                        ? "Add Point mode enabled. Click near an existing ward boundary edge to insert a vertex."
                        : "Add Point mode disabled.",
                    "success"
                );
            }
        );

        dom.editWardBoundaryFinishButton?.addEventListener(
            "click",
            finishWardBoundaryEdit
        );

        dom.editWardBoundaryUndoButton?.addEventListener(
            "click",
            undoWardBoundaryEditPoint
        );

        dom.editWardBoundaryClearButton?.addEventListener(
            "click",
            clearWardBoundaryEdit
        );

        dom.editWardBoundaryMapFullscreenButton?.addEventListener(
            "click",
            () => {
                toggleMapFullscreen(
                    document.querySelector(
                        ".ward-boundary-edit-map-section"
                    ),
                    dom.editWardBoundaryMapFullscreenButton,
                    "Open ward boundary editor in full screen",
                    "Exit ward boundary editor full screen"
                );
            }
        );

        dom.wardCreateMapFullscreenButton?.addEventListener(
            "click",
            () => {
                toggleMapFullscreen(
                    document.querySelector(".ward-create-map-section"),
                    dom.wardCreateMapFullscreenButton,
                    "Open ward boundary map in full screen",
                    "Exit ward boundary map full screen"
                );
            }
        );

        document.addEventListener(
            "fullscreenchange",
            () => {
                syncFullscreenUi();
                window.setTimeout(() => {
                    state.overviewMap?.invalidateSize();
                    state.assignmentMap?.invalidateSize();
                    state.wardCreateMap?.invalidateSize();
                    state.wardBoundaryEditMap?.invalidateSize();
                }, 120);
            }
        );

        document.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Escape"
                ) {
                    if (
                        dom.editWardBoundaryModal &&
                        !dom.editWardBoundaryModal.hidden
                    ) {
                        closeEditWardBoundaryModal();
                    } else if (
                        dom.createWardModal &&
                        !dom.createWardModal.hidden
                    ) {
                        closeCreateWardModal();
                    } else if (
                        dom.createInspectorAccountModal &&
                        !dom.createInspectorAccountModal.hidden
                    ) {
                        closeCreateInspectorAccountModal();
                    } else if (
                        dom.assignInspectorModal &&
                        !dom.assignInspectorModal.hidden
                    ) {
                        closeAssignmentModal();
                    } else {
                        closeMobileNavigation();
                    }
                }
            }
        );

        window.addEventListener(
            "resize",
            () => {
                if (
                    window.innerWidth > 860
                ) {
                    closeMobileNavigation();
                }

                window.setTimeout(
                    () => {
                        state.overviewMap?.invalidateSize();
                        state.assignmentMap?.invalidateSize();
                    },
                    120
                );
            }
        );
    }

    setActiveTab("overview");
    setupOverviewMap();
    bindEvents();
    syncFullscreenUi();

    void loadAssistantCsrfToken().catch(error => {
        console.error("Assistant Commissioner CSRF initialization failed:", error);
        setSystemStatus(
            error.message || "Dashboard security initialization failed.",
            true
        );
    });
    updateDivisionAreaUi();
    loadAll();
});

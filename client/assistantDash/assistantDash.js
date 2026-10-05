/* =========================================================
   SWACHHITRA
   ASSISTANT COMMISSIONER DASHBOARD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = "/api/assistant";
    const PROFILE_URL = "/profile/";

    const state = {
        overview: null,
        wards: [],
        inspectors: [],
        currentScope: null,
        selectedInspector: null,
        assignmentMap: null,
        assignmentMapLayers: [],
        assignmentDivisionBoundary: null,
        assignmentAreaDraft: [],
        assignmentArea: null,
        assignmentMode: "idle",
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

        wardNavCount: el("wardNavCount"),
        wardsHeading: el("wardsHeading"),
        wardsStatus: el("wardsStatus"),
        wardsTableBody: el("wardsTableBody"),

        inspectorNavCount: el("inspectorNavCount"),
        inspectorsStatus: el("inspectorsStatus"),
        inspectorsTableBody: el("inspectorsTableBody"),

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

        assignmentSelectAreaButton: el("assignmentSelectAreaButton"),
        assignmentFinishAreaButton: el("assignmentFinishAreaButton"),
        assignmentUndoPointButton: el("assignmentUndoPointButton"),
        assignmentClearAreaButton: el("assignmentClearAreaButton"),
        assignmentMapStatus: el("assignmentMapStatus"),
        assignmentMap: el("assignmentMap"),
        assignmentAreaSummary: el("assignmentAreaSummary"),

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
        "wardNavCount",
        "wardsHeading",
        "wardsStatus",
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
        "assignmentSelectAreaButton",
        "assignmentFinishAreaButton",
        "assignmentUndoPointButton",
        "assignmentClearAreaButton",
        "assignmentMapStatus",
        "assignmentMap",
        "assignmentAreaSummary",
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

    async function fetchJSON(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        });

        let payload = null;

        try {
            payload = await response.json();
        } catch {
            payload = null;
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
                numberOrZero(overview.assigned_inspectors);
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
                    No active wards are currently mapped to this division.
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
                            Active Inspector accounts awaiting ward assignment
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
                            : "missing";

                const boundaryText =
                    boundarySource === "official"
                        ? "Official"
                        : boundarySource === "development"
                            ? "Development"
                            : "Not imported";

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
                    </tr>
                `;
            })
            .join("");
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
                    <td colspan="5" class="table-empty">
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
                        ${assigned ? "Edit Ward & Area" : "Assign Ward & Area"}
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

                const hasOperationalArea =
                    Array.isArray(inspector.operational_area?.polygon) &&
                    inspector.operational_area.polygon.length >= 3;

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
                            <span class="operational-area-pill ${hasOperationalArea ? "" : "missing"}">
                                ${hasOperationalArea ? "Map area assigned" : "Area not assigned"}
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

        if (dom.profilePreviewName) {
            dom.profilePreviewName.textContent =
                cleanText(resolvedProfile.full_name);
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
                cleanText(
                    state.currentScope?.division_name
                );
        }

        if (dom.headerAssistantName) {
            dom.headerAssistantName.textContent =
                cleanText(
                    resolvedProfile.full_name,
                    user?.email || "Assistant Commissioner"
                );
        }
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
                ? "Update the Inspector's ward and manually define the operational area they will work inside."
                : "Select a ward within your assigned division and manually define the Inspector's operational area.";

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
                state.assignmentArea = null;
                state.assignmentAreaDraft = [];
                renderAssignmentMap();
                updateAssignmentAreaSummary();
                setAssignmentMapStatus(
                    "Select a ward to load the Division operational planning map.",
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

        dom.assignInspectorModal.hidden = true;
        dom.assignInspectorModal.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove("modal-open");

        state.selectedInspector = null;
        state.assignmentDivisionBoundary = null;
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

        dom.assignmentSelectAreaButton?.classList.toggle(
            "active",
            mode === "area"
        );

        dom.assignmentFinishAreaButton && (
            dom.assignmentFinishAreaButton.disabled =
                mode !== "area" ||
                state.assignmentAreaDraft.length < 3
        );

        if (dom.assignmentUndoPointButton) {
            dom.assignmentUndoPointButton.disabled =
                state.assignmentAreaDraft.length === 0;
        }

        if (dom.assignmentMap?.getContainer()) {
            dom.assignmentMap.getContainer().style.cursor =
                mode === "area" ? "crosshair" : "grab";
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
        const polygon = state.assignmentDivisionBoundary;

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
                    message: "Every selected point must stay inside the Divisional Office working area."
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
                        message: "A boundary edge leaves the Divisional Office working area. Keep the complete polygon inside the highlighted boundary."
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

    function renderAssignmentMap() {
        if (!state.assignmentMap || typeof window.L === "undefined") {
            return;
        }

        clearAssignmentMapLayers();

        if (
            Array.isArray(state.assignmentDivisionBoundary) &&
            state.assignmentDivisionBoundary.length >= 3
        ) {
            const wardPolygon = L.polygon(
                state.assignmentDivisionBoundary,
                {
                    color: "#a7b7a0",
                    weight: 2,
                    fillColor: "#dfe8d9",
                    fillOpacity: 0.18,
                    dashArray: "6 5"
                }
            ).addTo(state.assignmentMap);

            wardPolygon.bindTooltip(
                "Division operational working area",
                { sticky: true }
            );

            state.assignmentMapLayers.push(wardPolygon);

            const center =
                Array.isArray(state.currentScope?.planning_boundary?.center)
                    ? state.currentScope.planning_boundary.center
                    : null;

            if (center && center.length >= 2) {
                const officeMarker = L.marker(center).addTo(state.assignmentMap);
                officeMarker.bindTooltip(
                    `${escapeHTML(state.currentScope?.division_name || "Division")} • Gandhi Maidan administrative office`,
                    { sticky: true }
                );
                state.assignmentMapLayers.push(officeMarker);
            }
        }

        if (state.assignmentAreaDraft.length >= 2) {
            const draftLine = L.polyline(
                state.assignmentAreaDraft,
                {
                    color: "#668457",
                    weight: 3,
                    dashArray: "7 6",
                    opacity: 0.9
                }
            ).addTo(state.assignmentMap);

            state.assignmentMapLayers.push(draftLine);
        }

        if (state.assignmentAreaDraft.length >= 3) {
            const draftPolygon = L.polygon(
                state.assignmentAreaDraft,
                {
                    color: "#668457",
                    weight: 2,
                    dashArray: "6 5",
                    fillColor: "#b7cf9f",
                    fillOpacity: 0.10
                }
            ).addTo(state.assignmentMap);

            state.assignmentMapLayers.push(draftPolygon);
        }

        state.assignmentAreaDraft.forEach((point, index) => {
            const marker = L.circleMarker(
                point,
                {
                    radius: 5,
                    color: "#4f7d45",
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    weight: 2
                }
            ).addTo(state.assignmentMap);

            marker.bindTooltip(`Area point ${index + 1}`);
            state.assignmentMapLayers.push(marker);
        });

        if (
            Array.isArray(state.assignmentArea) &&
            state.assignmentArea.length >= 3
        ) {
            const polygon = L.polygon(
                state.assignmentArea,
                {
                    color: "#315b27",
                    weight: 2,
                    fillColor: "#9dc87f",
                    fillOpacity: 0.24
                }
            ).addTo(state.assignmentMap);

            polygon.bindTooltip(
                "Assigned Inspector operational area",
                { sticky: true }
            );

            state.assignmentMapLayers.push(polygon);
        }
    }

    function updateAssignmentAreaSummary() {
        if (!dom.assignmentAreaSummary) {
            return;
        }

        if (Array.isArray(state.assignmentArea) && state.assignmentArea.length >= 3) {
            dom.assignmentAreaSummary.textContent =
                `Operational area selected: ${state.assignmentArea.length} boundary points. The server will verify that it remains inside the Division operational area, and inside an official ward boundary when one is available.`;
            dom.assignmentAreaSummary.dataset.selected = "true";
        } else {
            dom.assignmentAreaSummary.textContent =
                "No Inspector area selected yet.";
            dom.assignmentAreaSummary.dataset.selected = "false";
        }
    }

    function fitAssignmentMapToDivision() {
        if (
            !state.assignmentMap ||
            !Array.isArray(state.assignmentDivisionBoundary) ||
            state.assignmentDivisionBoundary.length < 3
        ) {
            return;
        }

        const bounds = L.latLngBounds(
            state.assignmentDivisionBoundary
        );

        state.assignmentMap.fitBounds(
            bounds.pad(0.08),
            { maxZoom: 15 }
        );

        state.assignmentMap.setMaxBounds(
            bounds.pad(0.16)
        );

        state.assignmentMap.options.maxBoundsViscosity = 0.92;
    }

    function loadAssignmentWardMap(ward) {
        state.assignmentDivisionBoundary =
            Array.isArray(state.currentScope?.planning_boundary?.polygon)
                ? state.currentScope.planning_boundary.polygon.map(point => [
                    Number(point[0]),
                    Number(point[1])
                ])
                : null;

        const divisionBoundarySource =
            state.currentScope?.planning_boundary?.source ||
            null;

        state.assignmentArea = null;
        state.assignmentAreaDraft = [];

        const inspector = state.selectedInspector;
        const existingArea = inspector?.operational_area;

        if (
            existingArea &&
            Number(inspector?.scope?.ward_id) === Number(ward?.id) &&
            Array.isArray(existingArea.polygon) &&
            existingArea.polygon.length >= 3
        ) {
            state.assignmentArea = existingArea.polygon.map(point => [
                Number(point[0]),
                Number(point[1])
            ]);
        }

        renderAssignmentMap();
        updateAssignmentAreaSummary();

        if (!state.assignmentMap) {
            return;
        }

        state.assignmentMap.invalidateSize();

        if (state.assignmentDivisionBoundary) {
            fitAssignmentMapToDivision();

            const areaSourceText =
                divisionBoundarySource === "official"
                    ? "verified administrative boundary"
                    : "SWACHHITRA development working envelope";

            setAssignmentMapStatus(
                state.assignmentArea
                    ? `Existing Inspector operational area loaded. The selected polygon is constrained by the ${areaSourceText}. Select Area to replace it or Clear Area to start again.`
                    : `The map shows the broader ${cleanText(state.currentScope?.division_name)} working area near ${cleanText(state.currentScope?.office_location, "the division office")}. Select Area and draw the Inspector's smaller operational area inside it.`,
                divisionBoundarySource === "official" ? "success" : "warning"
            );
        } else {
            state.assignmentMap.setMaxBounds(null);
            state.assignmentMap.setView([20.5937, 78.9629], 5);

            setAssignmentMapStatus(
                "No division planning envelope is available for this Assistant Commissioner yet.",
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

        state.assignmentMap.on(
            "click",
            event => {
                if (state.assignmentMode !== "area") {
                    return;
                }

                const point = [
                    Number(event.latlng.lat),
                    Number(event.latlng.lng)
                ];

                if (!pointInsideAssistantBoundary(point)) {
                    showToast(
                        "That point is outside the Divisional Office working area."
                    );
                    setAssignmentMapStatus(
                        "Choose a point inside the highlighted Divisional Office working area.",
                        "warning"
                    );
                    return;
                }

                if (state.assignmentAreaDraft.length >= 2) {
                    const lastPoint =
                        state.assignmentAreaDraft[
                            state.assignmentAreaDraft.length - 1
                        ];

                    for (let i = 0; i < state.assignmentAreaDraft.length - 2; i++) {
                        const a = state.assignmentAreaDraft[i];
                        const b =
                            state.assignmentAreaDraft[i + 1];

                        if (
                            segmentsStrictlyIntersectAssistant(
                                a,
                                b,
                                lastPoint,
                                point
                            )
                        ) {
                            showToast(
                                "That point would make the selected boundary cross itself."
                            );
                            setAssignmentMapStatus(
                                "Choose the next point in a direction that does not cross an earlier boundary line.",
                                "warning"
                            );
                            return;
                        }
                    }
                }

                state.assignmentAreaDraft.push(point);
                renderAssignmentMap();

                if (state.assignmentAreaDraft.length >= 3) {
                    dom.assignmentFinishAreaButton.disabled = false;
                    setAssignmentMapStatus(
                        "Boundary point added. Click Finish Area when the polygon encloses the Inspector's working area.",
                        "success"
                    );
                } else {
                    setAssignmentMapStatus(
                        `Boundary point ${state.assignmentAreaDraft.length} added. Add at least ${3 - state.assignmentAreaDraft.length} more point(s).`,
                        "neutral"
                    );
                }
            }
        );
    }

    function startAssignmentAreaSelection() {
        if (!state.assignmentDivisionBoundary) {
            setAssignmentMapStatus(
                "No Division operational planning area is available for this Assistant Commissioner.",
                "warning"
            );
            return;
        }

        state.assignmentAreaDraft = [];
        state.assignmentArea = null;

        renderAssignmentMap();
        updateAssignmentAreaSummary();
        setAssignmentMode("area");

        setAssignmentMapStatus(
            "Click boundary points around the Inspector's operational area. Every point and every boundary edge must stay inside the highlighted Divisional Office working area.",
            "success"
        );
    }

    function finishAssignmentAreaSelection() {
        if (state.assignmentAreaDraft.length < 3) {
            setAssignmentMapStatus(
                "At least three distinct points are required to create the operational area.",
                "warning"
            );
            return;
        }

        const validation =
            validateAssignmentAreaDraft(
                state.assignmentAreaDraft
            );

        if (!validation.valid) {
            setAssignmentMapStatus(
                validation.message,
                "error"
            );
            return;
        }

        state.assignmentArea = state.assignmentAreaDraft.map(point => [...point]);
        state.assignmentAreaDraft = [];

        renderAssignmentMap();
        updateAssignmentAreaSummary();
        setAssignmentMode("idle");

        setAssignmentMapStatus(
            "Operational area selected. Review the highlighted area, then click Save Ward & Area to assign it to this Inspector.",
            "success"
        );
    }

    function undoAssignmentAreaPoint() {
        if (state.assignmentAreaDraft.length === 0) {
            setAssignmentMapStatus(
                "There are no draft points to remove.",
                "neutral"
            );
            return;
        }

        state.assignmentAreaDraft.pop();

        renderAssignmentMap();

        if (state.assignmentAreaDraft.length >= 3) {
            dom.assignmentFinishAreaButton.disabled = false;
        } else {
            dom.assignmentFinishAreaButton.disabled = true;
        }

        setAssignmentMapStatus(
            state.assignmentAreaDraft.length
                ? `Removed the last point. ${state.assignmentAreaDraft.length} point(s) remain in the draft.`
                : "All draft points were removed.",
            "neutral"
        );
    }

    function clearAssignmentAreaSelection() {
        state.assignmentArea = null;
        state.assignmentAreaDraft = [];

        renderAssignmentMap();
        updateAssignmentAreaSummary();

        if (state.assignmentDivisionBoundary) {
            setAssignmentMapStatus(
                "Inspector area cleared. Select Area to draw a new operational boundary inside the Division working area.",
                "warning"
            );
        } else {
            setAssignmentMapStatus(
                "Select a ward to load the Division operational map.",
                "neutral"
            );
        }

        setAssignmentMode("idle");
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
                    null
            };
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
                loadInspectors()
            ]);

            void results;

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

        if (
            !Array.isArray(state.assignmentArea) ||
            state.assignmentArea.length < 3
        ) {
            showAssignmentMessage(
                "Select and finish the Inspector's operational area on the map before saving the assignment.",
                "error"
            );
            setAssignmentMapStatus(
                "Operational area is required for this Inspector assignment.",
                "warning"
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
                            reason,
                            operational_area: {
                                polygon: state.assignmentArea
                            }
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

                if (!ward) {
                    state.assignmentDivisionBoundary = null;
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

        dom.assignmentSelectAreaButton?.addEventListener(
            "click",
            startAssignmentAreaSelection
        );

        dom.assignmentFinishAreaButton?.addEventListener(
            "click",
            finishAssignmentAreaSelection
        );

        dom.assignmentUndoPointButton?.addEventListener(
            "click",
            undoAssignmentAreaPoint
        );

        dom.assignmentClearAreaButton?.addEventListener(
            "click",
            clearAssignmentAreaSelection
        );

        document.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Escape"
                ) {
                    if (
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
            }
        );
    }

    setActiveTab("overview");
    bindEvents();
    loadAll();
});

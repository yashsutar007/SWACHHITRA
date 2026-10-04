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
                    <td colspan="5" class="table-empty">
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

                const boundaryClass =
                    ward.has_official_boundary
                        ? "official"
                        : "missing";

                const boundaryText =
                    ward.has_official_boundary
                        ? "Official"
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
                        ${assigned ? "Reassign" : "Assign Ward"}
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
                ? "Move the Inspector to another ward within your assigned division."
                : "Select a ward within your assigned division.";

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

        window.setTimeout(() => {
            dom.assignmentWardSelect?.focus();
        }, 0);
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

        state.selectedInspector = null;

        if (dom.assignInspectorForm) {
            dom.assignInspectorForm.reset();
        }

        showAssignmentMessage("");
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
                division_name: payload.division.name
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

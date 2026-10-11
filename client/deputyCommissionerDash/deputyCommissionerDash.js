"use strict";

(() => {
    const $ = (id) => document.getElementById(id);
    const appShell = document.querySelector(".app-shell");
    const sidebar = $("dcSidebar");
    const sidebarToggleButton = $("sidebarToggleButton");
    const sidebarBackdrop = $("sidebarBackdrop");
    const sidebarMediaQuery = window.matchMedia("(max-width: 900px)");
    const navLinks = Array.from(document.querySelectorAll(".main-nav a.nav-item"));
    const pageTitle = document.getElementById("pageTitle");
    const pageDescription = document.getElementById("pageDescription");
    const refreshButton = $("refreshButton");
    const logoutButton = $("logoutButton");
    const statusPill = $("systemStatus");
    const statusText = $("systemStatusText");
    const dataAlert = $("dataAlert");
    let requestInProgress = false;

    const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
    const decimalFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    function asNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function formatNumber(value) {
        return numberFormat.format(asNumber(value));
    }

    function formatTonnes(value) {
        return `${decimalFormat.format(asNumber(value))} t`;
    }

    function showFailure(message) {
        dataAlert.hidden = false;
        dataAlert.textContent = message;
        statusPill.classList.add("error");
        statusText.textContent = "Data unavailable";
        $("footerDataSource").textContent = "Database response unavailable";
    }

    function clearFailure() {
        dataAlert.hidden = true;
        dataAlert.textContent = "";
        statusPill.classList.remove("error");
        statusText.textContent = "Database connected";
        $("footerDataSource").textContent = "Source: current application database";
    }

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = String(value);
    }

    function renderStatusList(containerId, entries, total, type) {
        const container = $(containerId);
        if (!container) return;
        const safeEntries = Array.isArray(entries) ? entries : [];
        if (!safeEntries.length) {
            container.innerHTML = '<div class="empty-line">No status records are available.</div>';
            return;
        }

        const denominator = Math.max(0, asNumber(total));
        container.replaceChildren();
        safeEntries.forEach((entry) => {
            const count = Math.max(0, asNumber(entry.count));
            const percent = denominator > 0 ? Math.min(100, (count / denominator) * 100) : 0;
            const row = document.createElement("div");
            row.className = "status-row";

            const head = document.createElement("div");
            head.className = "status-row-head";
            const name = document.createElement("span");
            name.className = "status-name";
            name.textContent = entry.label;
            const number = document.createElement("span");
            number.className = "status-number";
            const countEl = document.createElement("strong");
            countEl.textContent = formatNumber(count);
            const percentEl = document.createElement("span");
            percentEl.textContent = `${percent.toFixed(1)}%`;
            number.append(countEl, percentEl);
            head.append(name, number);

            const track = document.createElement("div");
            track.className = "bar-track";
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", `${entry.label} share`);
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            track.setAttribute("aria-valuenow", percent.toFixed(1));
            const fill = document.createElement("span");
            fill.className = `bar-fill${entry.tone ? ` ${entry.tone}` : ""}`;
            fill.style.width = `${percent}%`;
            track.appendChild(fill);
            row.append(head, track);
            container.appendChild(row);
        });
    }

    function renderTrend(series) {
        const container = $("collectionTrend");
        if (!container) return;
        const source = new Map((Array.isArray(series) ? series : []).map((item) => [String(item.day), item]));
        const days = [];
        const now = new Date();
        for (let offset = 6; offset >= 0; offset -= 1) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const key = `${year}-${month}-${day}`;
            const record = source.get(key) || { day: key, collectedTons: 0, records: 0 };
            days.push({
                key,
                label: date.toLocaleDateString("en-IN", { weekday: "short" }),
                collectedTons: asNumber(record.collectedTons),
                records: asNumber(record.records)
            });
        }
        const maxTons = Math.max(0, ...days.map((item) => item.collectedTons));
        const totalTons = days.reduce((sum, item) => sum + item.collectedTons, 0);
        setText("trendSummary", `${formatTonnes(totalTons)} in 7 days`);
        container.replaceChildren();

        days.forEach((item) => {
            const day = document.createElement("div");
            day.className = "trend-day";
            day.title = `${item.key}: ${formatTonnes(item.collectedTons)}, ${formatNumber(item.records)} record(s)`;
            const value = document.createElement("div");
            value.className = "trend-value";
            value.textContent = decimalFormat.format(item.collectedTons);
            const track = document.createElement("div");
            track.className = "trend-track";
            track.setAttribute("aria-hidden", "true");
            const bar = document.createElement("div");
            bar.className = "trend-bar";
            bar.style.height = maxTons > 0 && item.collectedTons > 0 ? `${Math.max(4, (item.collectedTons / maxTons) * 100)}%` : "0%";
            track.appendChild(bar);
            const label = document.createElement("div");
            label.className = "trend-day-label";
            label.textContent = item.label;
            day.append(value, track, label);
            container.appendChild(day);
        });
    }

    function renderOverview(data) {
        const divisions = data.divisions || {};
        const wards = data.wards || {};
        const inspectors = data.inspectors || {};
        const vehicles = data.vehicles || {};
        const routes = data.routes || {};
        const complaints = data.complaints || {};
        const collections = data.collectionsToday || {};

        setText("activeDivisions", formatNumber(divisions.active));
        setText("divisionSubtext", `of ${formatNumber(divisions.total)} divisions`);
        setText("activeWards", formatNumber(wards.active));
        setText("wardSubtext", `of ${formatNumber(wards.total)} wards`);
        setText("assignedInspectors", formatNumber(inspectors.assigned));
        setText("inspectorSubtext", `of ${formatNumber(inspectors.total)} active inspectors`);
        setText("operationalVehicles", formatNumber(vehicles.operational));
        setText("vehicleSubtext", `of ${formatNumber(vehicles.total)} vehicles`);
        setText("activeRoutes", formatNumber(routes.active));
        setText("routeSubtext", `${formatNumber(routes.delayed)} delayed routes`);
        setText("openComplaints", formatNumber(complaints.open + complaints.inProgress));
        setText("complaintSubtext", `${formatNumber(complaints.criticalOpen)} critical open`);
        setText("todayCollections", formatNumber(collections.records));
        setText("collectionSubtext", `${formatNumber(collections.collected)} completed`);
        setText("todayWaste", decimalFormat.format(asNumber(collections.wasteTons)));
        setText("totalRoutesTag", `${formatNumber(routes.total)} total`);
        setText("totalComplaintsTag", `${formatNumber(complaints.total)} total`);
        setText("criticalComplaintNote", `${formatNumber(complaints.criticalOpen)} critical complaint(s) are currently open or in progress. Prioritize review according to local operating procedures.`);

        renderStatusList("routeStatusList", [
            { label: "Scheduled", count: routes.scheduled },
            { label: "Starting / active", count: routes.active },
            { label: "Delayed", count: routes.delayed, tone: "amber" },
            { label: "Completed", count: routes.completed },
            { label: "Cancelled", count: routes.cancelled, tone: "red" }
        ], routes.total, "route");

        renderStatusList("complaintStatusList", [
            { label: "Open", count: complaints.open, tone: "amber" },
            { label: "In progress", count: complaints.inProgress },
            { label: "Resolved", count: complaints.resolved },
            { label: "Cancelled", count: complaints.cancelled, tone: "red" }
        ], complaints.total, "complaint");

        renderTrend(data.collectionTrend || []);
        const timestamp = data.generatedAt ? new Date(data.generatedAt) : new Date();
        setText("lastUpdated", Number.isNaN(timestamp.getTime()) ? "Just now" : timestamp.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
    }

    async function loadOverview() {
        if (requestInProgress) return;
        requestInProgress = true;
        refreshButton.disabled = true;
        refreshButton.querySelector("span").textContent = "…";
        statusText.textContent = "Refreshing data";

        try {
            const response = await fetch("/api/deputy/overview", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            let payload;
            try { payload = await response.json(); }
            catch { throw new Error("The server returned an unreadable response. Refresh the page or sign in again."); }

            if (response.status === 401 || response.status === 403) {
                window.location.replace("/login");
                return;
            }
            if (!response.ok || payload?.success !== true || !payload?.data) {
                throw new Error(payload?.message || "City overview data is currently unavailable.");
            }

            clearFailure();
            renderOverview(payload.data);
        } catch (error) {
            console.error("Deputy Commissioner overview load failed:", error);
            showFailure(error?.message || "Unable to load city overview.");
        } finally {
            requestInProgress = false;
            refreshButton.disabled = false;
            refreshButton.querySelector("span").textContent = "↻";
        }
    }

    const divisionGrid = $("divisionGrid");
    const divisionAlert = $("divisionAlert");
    const refreshDivisionsButton = $("refreshDivisionsButton");
    const wardDetailPanel = $("wardDetailPanel");
    const wardTableBody = $("wardTableBody");
    const wardDetailSummary = $("wardDetailSummary");
    let divisionRequestInProgress = false;
    let selectedDivisionId = null;

    function showDivisionFailure(message) {
        if (divisionAlert) {
            divisionAlert.hidden = false;
            divisionAlert.textContent = message;
        }
    }

    function clearDivisionFailure() {
        if (divisionAlert) {
            divisionAlert.hidden = true;
            divisionAlert.textContent = "";
        }
    }

    function createElement(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function addDivisionMetric(container, value, label) {
        const metric = createElement("div", "division-mini-metric");
        metric.append(
            createElement("strong", "division-mini-value", value),
            createElement("span", "division-mini-label", label)
        );
        container.appendChild(metric);
    }

    function renderDivisionCards(divisions) {
        if (!divisionGrid) return;
        divisionGrid.replaceChildren();
        if (!Array.isArray(divisions) || divisions.length === 0) {
            divisionGrid.appendChild(createElement("div", "empty-line", "No Division records are available."));
            return;
        }

        divisions.forEach((division) => {
            const card = createElement("article", `division-card${division.status === "active" ? "" : " inactive"}`);
            const top = createElement("div", "division-card-top");
            const titleWrap = createElement("div", "division-title-wrap");
            titleWrap.append(
                createElement("span", "division-code", division.divisionCode || `DIV-${division.id}`),
                createElement("h3", "division-title", division.divisionName || "Unnamed Division"),
                createElement("p", "division-office", division.officeLocation || "Office location not recorded")
            );
            top.appendChild(titleWrap);
            top.appendChild(createElement("span", `division-state${division.status === "active" ? "" : " inactive"}`, division.status || "unknown"));
            card.appendChild(top);

            const metricGrid = createElement("div", "division-metric-grid");
            addDivisionMetric(metricGrid, `${formatNumber(division.activeWards)} / ${formatNumber(division.wardCount)}`, "Active wards / total");
            addDivisionMetric(metricGrid, formatNumber(division.assignedInspectors), "Active assigned Inspectors");
            addDivisionMetric(metricGrid, `${formatNumber(division.activeRoutes)} / ${formatNumber(division.totalRoutes)}`, "Active routes / total");
            addDivisionMetric(metricGrid, formatNumber(division.delayedRoutes), "Delayed routes");
            addDivisionMetric(metricGrid, formatNumber(division.openComplaints), "Open / in-progress complaints");
            addDivisionMetric(metricGrid, formatTonnes(division.collectedTons7d), "Recorded waste · 7 days");
            card.appendChild(metricGrid);

            const foot = createElement("div", "division-card-foot");
            const summary = createElement("div", "division-foot-summary");
            summary.append(
                createElement("strong", "", formatNumber(division.collections7d)),
                document.createTextNode(" collection record(s) in the last 7 days")
            );
            const button = createElement("button", "division-action", "View wards →");
            button.type = "button";
            button.addEventListener("click", () => loadDivisionWards(division.id, division.divisionName));
            foot.append(summary, button);
            card.appendChild(foot);
            divisionGrid.appendChild(card);
        });
    }

    async function loadDivisions() {
        if (divisionRequestInProgress) return;
        divisionRequestInProgress = true;
        if (refreshDivisionsButton) refreshDivisionsButton.disabled = true;
        clearDivisionFailure();
        if (divisionGrid && !divisionGrid.children.length) {
            divisionGrid.appendChild(createElement("div", "loading-line", "Loading divisional summaries…"));
        }
        try {
            const response = await fetch("/api/deputy/divisions", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            let payload;
            try { payload = await response.json(); }
            catch { throw new Error("The server returned an unreadable Division response."); }
            if (response.status === 401 || response.status === 403) {
                window.location.replace("/login");
                return;
            }
            if (!response.ok || payload?.success !== true || !Array.isArray(payload?.data?.divisions)) {
                throw new Error(payload?.message || "Division data is currently unavailable.");
            }
            renderDivisionCards(payload.data.divisions);
            populateComplaintDivisionFilter(payload.data.divisions);
            clearDivisionFailure();
        } catch (error) {
            console.error("Deputy Commissioner Division summary load failed:", error);
            showDivisionFailure(error?.message || "Unable to load Division summaries.");
            if (divisionGrid) {
                divisionGrid.replaceChildren(createElement("div", "empty-line", "Division summaries could not be loaded. Use Refresh divisions to retry."));
            }
        } finally {
            divisionRequestInProgress = false;
            if (refreshDivisionsButton) refreshDivisionsButton.disabled = false;
        }
    }

    function appendSummaryChip(label, value) {
        const chip = createElement("div", "ward-summary-chip");
        chip.append(createElement("strong", "", value), createElement("span", "", label));
        wardDetailSummary.appendChild(chip);
    }

    function renderWardSummary(summary) {
        if (!wardDetailSummary) return;
        wardDetailSummary.replaceChildren();
        appendSummaryChip("Total wards", formatNumber(summary.wardCount));
        appendSummaryChip("Active wards", formatNumber(summary.activeWards));
        appendSummaryChip("Active assigned Inspectors", formatNumber(summary.assignedInspectors));
        appendSummaryChip("Active routes", formatNumber(summary.activeRoutes));
        appendSummaryChip("Open complaints", formatNumber(summary.openComplaints));
    }

    function renderWardRows(wards) {
        if (!wardTableBody) return;
        wardTableBody.replaceChildren();
        if (!Array.isArray(wards) || wards.length === 0) {
            const row = document.createElement("tr");
            const cell = createElement("td", "table-empty", "No Ward records are currently associated with this Division.");
            cell.colSpan = 7;
            row.appendChild(cell);
            wardTableBody.appendChild(row);
            return;
        }

        wards.forEach((ward) => {
            const row = document.createElement("tr");
            const wardCell = createElement("td", "ward-name-cell");
            wardCell.append(
                createElement("strong", "", ward.wardName || `Ward ${ward.wardNumber}`),
                createElement("small", "", `${ward.wardCode || "No code"} · ${ward.zoneName || "Zone not recorded"}`)
            );
            const statusCell = document.createElement("td");
            statusCell.appendChild(createElement("span", `table-status ${ward.status === "active" ? "active" : "inactive"}`, ward.status || "unknown"));
            const inspectorCell = createElement("td", "inspector-name-list");
            inspectorCell.appendChild(createElement("span", "", ward.inspectorNames || "No active Inspector assigned"));
            inspectorCell.appendChild(createElement("span", "muted-inline", `${formatNumber(ward.assignedInspectorCount)} assigned`));
            const routeCell = document.createElement("td");
            routeCell.appendChild(createElement("span", "", `${formatNumber(ward.activeRoutes)} active / ${formatNumber(ward.totalRoutes)} total`));
            if (asNumber(ward.delayedRoutes) > 0) routeCell.appendChild(createElement("span", "muted-inline", `${formatNumber(ward.delayedRoutes)} delayed`));
            const complaintCell = createElement("td", "", formatNumber(ward.openComplaints));
            const collectionCell = createElement("td", "", formatNumber(ward.collections7d));
            const tonsCell = createElement("td", "", formatTonnes(ward.collectedTons7d));
            row.append(wardCell, statusCell, inspectorCell, routeCell, complaintCell, collectionCell, tonsCell);
            wardTableBody.appendChild(row);
        });
    }

    async function loadDivisionWards(divisionId, divisionName) {
        const id = Number(divisionId);
        if (!Number.isSafeInteger(id) || id <= 0) {
            showDivisionFailure("The selected Division identifier is invalid.");
            return;
        }
        selectedDivisionId = id;
        if (wardDetailPanel) wardDetailPanel.hidden = false;
        setText("wardDetailTitle", divisionName || `Division ${id}`);
        setText("wardDetailSubtitle", "Loading Ward-level records…");
        if (wardTableBody) {
            wardTableBody.replaceChildren();
            const row = document.createElement("tr");
            const cell = createElement("td", "table-empty", "Loading Ward data…");
            cell.colSpan = 7;
            row.appendChild(cell);
            wardTableBody.appendChild(row);
        }
        if (wardDetailSummary) wardDetailSummary.replaceChildren();
        if (wardDetailPanel) wardDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });

        try {
            const response = await fetch(`/api/deputy/divisions/${id}/wards`, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            let payload;
            try { payload = await response.json(); }
            catch { throw new Error("The server returned an unreadable Ward response."); }
            if (response.status === 401 || response.status === 403) {
                window.location.replace("/login");
                return;
            }
            if (!response.ok || payload?.success !== true || !payload?.data) {
                throw new Error(payload?.message || "Ward details are currently unavailable.");
            }
            const data = payload.data;
            setText("wardDetailTitle", data.division?.divisionName || divisionName || `Division ${id}`);
            setText("wardDetailSubtitle", `${data.division?.divisionCode || `DIV-${id}`} · Saved administrative Ward assignments; read-only city-wide view.`);
            renderWardSummary(data.summary || {});
            renderWardRows(data.wards || []);
            clearDivisionFailure();
        } catch (error) {
            console.error("Deputy Commissioner Ward detail load failed:", error);
            setText("wardDetailSubtitle", "Ward details could not be loaded.");
            if (wardTableBody) {
                wardTableBody.replaceChildren();
                const row = document.createElement("tr");
                const cell = createElement("td", "table-empty", "Ward details are unavailable. Refresh the Division summaries and retry.");
                cell.colSpan = 7;
                row.appendChild(cell);
                wardTableBody.appendChild(row);
            }
            showDivisionFailure(error?.message || "Unable to load Ward details.");
        }
    }

    const complaintTableBody = $("complaintTableBody");
    const complaintAlert = $("complaintAlert");
    const complaintResultsLine = $("complaintResultsLine");
    const refreshComplaintsButton = $("refreshComplaintsButton");
    const complaintStatusFilter = $("complaintStatusFilter");
    const complaintPriorityFilter = $("complaintPriorityFilter");
    const complaintSearchInput = $("complaintSearchInput");
    const complaintDivisionFilter = $("complaintDivisionFilter");
    const complaintWardFilter = $("complaintWardFilter");
    const complaintDateFrom = $("complaintDateFrom");
    const complaintDateTo = $("complaintDateTo");
    const applyComplaintFiltersButton = $("applyComplaintFiltersButton");
    const escalationDialog = $("escalationDialog");
    const escalationForm = $("escalationForm");
    const escalationFormAlert = $("escalationFormAlert");
    const submitEscalationButton = $("submitEscalationButton");
    let complaintsRequestInProgress = false;
    let complaintRowsById = new Map();
    let complaintWardOptionsRequest = 0;

    function populateComplaintDivisionFilter(divisions) {
        if (!complaintDivisionFilter || !Array.isArray(divisions)) return;
        const priorValue = complaintDivisionFilter.value || "all";
        complaintDivisionFilter.replaceChildren();
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All divisions";
        complaintDivisionFilter.appendChild(allOption);
        divisions.forEach((division) => {
            const option = document.createElement("option");
            option.value = String(division.id);
            option.textContent = `${division.divisionCode ? `${division.divisionCode} · ` : ""}${division.divisionName || `Division ${division.id}`}`;
            complaintDivisionFilter.appendChild(option);
        });
        complaintDivisionFilter.value = [...complaintDivisionFilter.options].some((option) => option.value === priorValue)
            ? priorValue
            : "all";
        if (complaintDivisionFilter.value === "all") {
            setComplaintWardPlaceholder("Select a Division first");
        } else {
            loadComplaintWardOptions(complaintDivisionFilter.value);
        }
    }

    function setComplaintWardPlaceholder(label) {
        if (!complaintWardFilter) return;
        complaintWardFilter.replaceChildren();
        const option = document.createElement("option");
        option.value = "all";
        option.textContent = label;
        complaintWardFilter.appendChild(option);
        complaintWardFilter.value = "all";
        complaintWardFilter.disabled = true;
    }

    async function loadComplaintWardOptions(divisionId) {
        const requestId = ++complaintWardOptionsRequest;
        if (!complaintWardFilter) return;
        const parsedId = Number(divisionId);
        if (!divisionId || divisionId === "all" || !Number.isSafeInteger(parsedId) || parsedId <= 0) {
            setComplaintWardPlaceholder("Select a Division first");
            return;
        }

        const priorWard = complaintWardFilter.value || "all";
        complaintWardFilter.disabled = true;
        complaintWardFilter.replaceChildren();
        const loadingOption = document.createElement("option");
        loadingOption.value = "all";
        loadingOption.textContent = "Loading wards…";
        complaintWardFilter.appendChild(loadingOption);

        try {
            const response = await fetch(`/api/deputy/divisions/${parsedId}/wards`, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401 || response.status === 403) {
                window.location.replace("/login");
                return;
            }
            if (!response.ok || payload?.success !== true || !Array.isArray(payload?.data?.wards)) {
                throw new Error(payload?.message || "Ward filter options are currently unavailable.");
            }
            if (requestId !== complaintWardOptionsRequest) return;

            complaintWardFilter.replaceChildren();
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All wards in this Division";
            complaintWardFilter.appendChild(allOption);
            payload.data.wards.forEach((ward) => {
                const option = document.createElement("option");
                option.value = String(ward.id);
                option.textContent = `${ward.wardCode ? `${ward.wardCode} · ` : ""}${ward.wardName || `Ward ${ward.wardNumber || ward.id}`}`;
                complaintWardFilter.appendChild(option);
            });
            complaintWardFilter.disabled = false;
            complaintWardFilter.value = [...complaintWardFilter.options].some((option) => option.value === priorWard)
                ? priorWard
                : "all";
        } catch (error) {
            if (requestId !== complaintWardOptionsRequest) return;
            setComplaintWardPlaceholder("Wards unavailable");
            showComplaintMessage(error?.message || "Unable to load Ward filter options.");
        }
    }

    function showComplaintMessage(message, isError = true) {
        if (!complaintAlert) return;
        complaintAlert.hidden = false;
        complaintAlert.classList.toggle("error", isError);
        complaintAlert.textContent = message;
    }

    function clearComplaintMessage() {
        if (!complaintAlert) return;
        complaintAlert.hidden = true;
        complaintAlert.classList.remove("error");
        complaintAlert.textContent = "";
    }

    function formatComplaintAge(hoursValue) {
        const hours = Math.max(0, Math.floor(asNumber(hoursValue)));
        const days = Math.floor(hours / 24);
        const remaining = hours % 24;
        if (days > 0) return `${days}d ${remaining}h`;
        return `${hours}h`;
    }

    function formatComplaintDate(value) {
        if (!value) return "Not recorded";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date unavailable";
        return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    }

    function createComplaintCell(className = "", text = "") {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        if (text !== undefined && text !== null) cell.textContent = String(text);
        return cell;
    }

    function createBadge(className, label) {
        const badge = document.createElement("span");
        badge.className = className;
        badge.textContent = String(label || "unknown").replaceAll("_", " ");
        return badge;
    }

    function appendComplaintText(container, tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(text || "");
        container.appendChild(node);
        return node;
    }

    function renderComplaintRows(complaints) {
        if (!complaintTableBody) return;
        complaintTableBody.replaceChildren();
        complaintRowsById = new Map();
        if (!Array.isArray(complaints) || complaints.length === 0) {
            const row = document.createElement("tr");
            const cell = createComplaintCell("table-empty", "No complaints match these filters.");
            cell.colSpan = 9;
            row.appendChild(cell);
            complaintTableBody.appendChild(row);
            return;
        }

        complaints.forEach((complaint) => {
            complaintRowsById.set(Number(complaint.id), complaint);
            const row = document.createElement("tr");
            const priorityCell = createComplaintCell();
            priorityCell.appendChild(createBadge(`priority-badge ${["low", "medium", "high", "critical"].includes(complaint.priority) ? complaint.priority : "medium"}`, complaint.priority));
            row.appendChild(priorityCell);

            const mainCell = createComplaintCell("complaint-main-cell");
            appendComplaintText(mainCell, "strong", "", complaint.complaintCode || `Complaint ${complaint.id}`);
            appendComplaintText(mainCell, "span", "", complaint.complaintType || "Complaint");
            appendComplaintText(mainCell, "small", "", complaint.description || "No description supplied.");
            row.appendChild(mainCell);

            const locationCell = createComplaintCell("complaint-location-cell");
            appendComplaintText(locationCell, "strong", "", complaint.wardCode || (complaint.wardId ? `Ward ${complaint.wardId}` : "Ward not mapped"));
            appendComplaintText(locationCell, "small", "", complaint.wardName || "No saved Ward assignment");
            if (complaint.locationText) appendComplaintText(locationCell, "small", "", complaint.locationText);
            row.appendChild(locationCell);

            const divisionCell = createComplaintCell();
            divisionCell.textContent = complaint.divisionName ? `${complaint.divisionCode ? `${complaint.divisionCode} · ` : ""}${complaint.divisionName}` : "Division not mapped";
            row.appendChild(divisionCell);

            const statusCell = createComplaintCell();
            statusCell.appendChild(createBadge(`complaint-status-badge ${["open", "in_progress", "resolved", "cancelled"].includes(complaint.status) ? complaint.status : "open"}`, complaint.status));
            row.appendChild(statusCell);

            row.appendChild(createComplaintCell("", formatComplaintDate(complaint.reportedAt)));
            const ageCell = createComplaintCell("", formatComplaintAge(complaint.ageHours));
            if (complaint.isOverdue) appendComplaintText(ageCell, "small", "complaint-overdue-flag", "48h+ active");
            row.appendChild(ageCell);

            const assignmentCell = createComplaintCell("complaint-assignment-cell");
            appendComplaintText(assignmentCell, "div", "", complaint.activeInspectorNames || "No active Inspector mapped");
            const assignmentDetails = [complaint.assignedVehicleNumber ? `Vehicle ${complaint.assignedVehicleNumber}` : "", complaint.assignedDriverName ? `Driver ${complaint.assignedDriverName}` : ""].filter(Boolean).join(" · ");
            if (assignmentDetails) appendComplaintText(assignmentCell, "small", "", assignmentDetails);
            row.appendChild(assignmentCell);

            const actionCell = createComplaintCell();
            const canEscalate = ["open", "in_progress"].includes(complaint.status) && complaint.wardId != null && complaint.divisionId != null;
            const action = document.createElement("button");
            action.type = "button";
            action.className = "escalate-row-button";
            action.textContent = "Escalate";
            action.disabled = !canEscalate;
            action.title = canEscalate ? "Notify the active Inspector and Assistant Commissioner assigned to this Ward/Division" : "Only active complaints with a saved Ward/Division mapping can be escalated";
            action.addEventListener("click", () => openEscalationDialog(complaint));
            actionCell.appendChild(action);
            row.appendChild(actionCell);
            complaintTableBody.appendChild(row);
        });
    }

    function renderComplaintSummary(summary = {}) {
        setText("complaintTotalCount", formatNumber(summary.total));
        setText("complaintOpenCount", formatNumber(summary.active));
        setText("complaintCriticalCount", formatNumber(summary.criticalActive));
        setText("complaintOverdueCount", formatNumber(summary.overdue48h));
    }

    async function loadComplaints() {
        if (complaintsRequestInProgress) return;
        complaintsRequestInProgress = true;
        if (refreshComplaintsButton) refreshComplaintsButton.disabled = true;
        if (complaintResultsLine) complaintResultsLine.textContent = "Loading complaint records…";
        clearComplaintMessage();
        const params = new URLSearchParams();
        params.set("status", complaintStatusFilter?.value || "all");
        params.set("priority", complaintPriorityFilter?.value || "all");
        params.set("q", String(complaintSearchInput?.value || "").trim());
        if (complaintDivisionFilter?.value && complaintDivisionFilter.value !== "all") {
            params.set("divisionId", complaintDivisionFilter.value);
        }
        if (complaintWardFilter?.value && complaintWardFilter.value !== "all" && !complaintWardFilter.disabled) {
            params.set("wardId", complaintWardFilter.value);
        }
        if (complaintDateFrom?.value) params.set("dateFrom", complaintDateFrom.value);
        if (complaintDateTo?.value) params.set("dateTo", complaintDateTo.value);
        try {
            const response = await fetch(`/api/deputy/complaints?${params.toString()}`, {
                method: "GET", credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" }
            });
            let payload;
            try { payload = await response.json(); }
            catch { throw new Error("The server returned an unreadable complaint response."); }
            if (response.status === 401) { window.location.replace("/login"); return; }
            if (!response.ok || payload?.success !== true || !payload?.data) {
                throw new Error(payload?.message || "Complaint oversight data is currently unavailable.");
            }
            const data = payload.data;
            renderComplaintSummary(data.summary || {});
            renderComplaintRows(data.complaints || []);
            if (complaintResultsLine) {
                const count = asNumber(data.complaints?.length);
                const total = asNumber(data.totalMatched);
                complaintResultsLine.textContent = data.truncated
                    ? `Showing ${formatNumber(count)} of ${formatNumber(total)} matching complaints (maximum 250 displayed).`
                    : `Showing ${formatNumber(count)} of ${formatNumber(total)} matching complaints.`;
            }
        } catch (error) {
            console.error("Deputy Commissioner complaint oversight load failed:", error);
            if (complaintResultsLine) complaintResultsLine.textContent = "Complaint records could not be loaded.";
            showComplaintMessage(error?.message || "Unable to load complaint records.");
            renderComplaintRows([]);
            const emptyCell = complaintTableBody?.querySelector(".table-empty");
            if (emptyCell) emptyCell.textContent = "Complaint records are unavailable. Use Refresh complaints to retry.";
        } finally {
            complaintsRequestInProgress = false;
            if (refreshComplaintsButton) refreshComplaintsButton.disabled = false;
        }
    }

    function openEscalationDialog(complaint) {
        if (!escalationDialog || !complaint) return;
        $("escalationComplaintId").value = String(complaint.id);
        $("escalationComplaintSummary").textContent = `${complaint.complaintCode} · ${complaint.complaintType} · ${complaint.wardCode || "Ward not mapped"}`;
        $("escalationNote").value = "";
        if (escalationFormAlert) { escalationFormAlert.hidden = true; escalationFormAlert.textContent = ""; }
        submitEscalationButton.disabled = false;
        submitEscalationButton.textContent = "Send escalation";
        if (typeof escalationDialog.showModal === "function") escalationDialog.showModal();
        else escalationDialog.setAttribute("open", "open");
        window.setTimeout(() => $("escalationNote")?.focus(), 0);
    }

    async function getDeputyCsrfToken() {
        const response = await fetch("/api/deputy/security/csrf-token", {
            method: "GET", credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" }
        });
        const payload = await response.json().catch(() => null);
        if (response.status === 401) { window.location.replace("/login"); throw new Error("Your session has expired. Sign in again."); }
        if (!response.ok || payload?.success !== true || typeof payload.csrfToken !== "string" || payload.csrfToken.length < 32) {
            throw new Error(payload?.message || "Unable to obtain the security token. Refresh the dashboard and retry.");
        }
        return payload.csrfToken;
    }

    async function submitComplaintEscalation(event) {
        event.preventDefault();
        if (!escalationForm || !submitEscalationButton) return;
        if (!escalationForm.reportValidity()) return;
        const complaintId = String($("escalationComplaintId").value || "");
        const note = String($("escalationNote").value || "").trim();
        submitEscalationButton.disabled = true;
        submitEscalationButton.textContent = "Sending…";
        if (escalationFormAlert) { escalationFormAlert.hidden = true; escalationFormAlert.textContent = ""; }
        try {
            const csrfToken = await getDeputyCsrfToken();
            const response = await fetch(`/api/deputy/complaints/${encodeURIComponent(complaintId)}/escalate`, {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                body: JSON.stringify({ note })
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401) { window.location.replace("/login"); return; }
            if (!response.ok || payload?.success !== true) throw new Error(payload?.message || "The escalation could not be saved.");
            if (typeof escalationDialog.close === "function") escalationDialog.close();
            else escalationDialog.removeAttribute("open");
            showComplaintMessage(payload.message || "Escalation sent.", false);
            await loadComplaints();
        } catch (error) {
            console.error("Deputy Commissioner complaint escalation failed:", error);
            if (escalationFormAlert) { escalationFormAlert.hidden = false; escalationFormAlert.textContent = error?.message || "Escalation failed."; }
        } finally {
            submitEscalationButton.disabled = false;
            submitEscalationButton.textContent = "Send escalation";
        }
    }


    const refreshFleetButton = $("refreshFleetButton");
    const applyFleetFiltersButton = $("applyFleetFiltersButton");
    const fleetSearchInput = $("fleetSearchInput");
    const fleetVehicleStatusFilter = $("fleetVehicleStatusFilter");
    const fleetRouteStatusFilter = $("fleetRouteStatusFilter");
    const fleetVehicleTableBody = $("fleetVehicleTableBody");
    const fleetRouteTableBody = $("fleetRouteTableBody");
    let fleetRequestInProgress = false;

    function showFleetMessage(message, isError = true) {
        const alert = $("fleetAlert");
        if (!alert) return;
        alert.hidden = false;
        alert.classList.toggle("error", isError);
        alert.textContent = message;
    }

    function clearFleetMessage() {
        const alert = $("fleetAlert");
        if (!alert) return;
        alert.hidden = true;
        alert.classList.remove("error");
        alert.textContent = "";
    }

    function formatFleetDate(value) {
        if (!value) return "Not scheduled";
        const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
            ? value.replace(" ", "T")
            : value;
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return "Date unavailable";
        return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    }

    function fleetBadge(status) {
        const allowed = new Set(["available", "en_route", "collecting", "delayed", "maintenance", "inactive", "assigned", "active", "starting", "scheduled", "completed", "cancelled"]);
        const safeStatus = allowed.has(String(status)) ? String(status) : "unknown";
        return createElement("span", `fleet-status-badge ${safeStatus}`, safeStatus.replaceAll("_", " "));
    }

    function appendFleetCell(row, className, value) {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        if (value !== undefined && value !== null && value !== "") cell.textContent = String(value);
        else cell.textContent = "Not recorded";
        row.appendChild(cell);
        return cell;
    }

    function appendFleetStack(row, primary, secondary, tertiary = "") {
        const cell = document.createElement("td");
        cell.className = "fleet-main-cell";
        cell.appendChild(createElement("strong", "", primary || "Not recorded"));
        if (secondary) cell.appendChild(createElement("small", "", secondary));
        if (tertiary) cell.appendChild(createElement("small", "", tertiary));
        row.appendChild(cell);
        return cell;
    }

    function appendFleetStatusCell(row, status) {
        const cell = document.createElement("td");
        cell.appendChild(fleetBadge(status));
        row.appendChild(cell);
        return cell;
    }

    function renderFleetSummary(summary = {}) {
        const vehicles = summary.vehicles || {};
        const drivers = summary.drivers || {};
        const assignments = summary.assignments || {};
        setText("fleetVehicleTotal", formatNumber(vehicles.total));
        setText("fleetVehicleOperational", formatNumber(vehicles.operational));
        setText("fleetVehicleMaintenance", formatNumber(vehicles.maintenance));
        setText("fleetCurrentAssignments", formatNumber(assignments.current));
        setText("fleetDriverAvailable", formatNumber(drivers.available));
    }

    function renderFleetVehicleRows(vehicles) {
        if (!fleetVehicleTableBody) return;
        fleetVehicleTableBody.replaceChildren();
        if (!Array.isArray(vehicles) || vehicles.length === 0) {
            const row = document.createElement("tr");
            const cell = createElement("td", "table-empty", "No vehicles match these filters.");
            cell.colSpan = 9;
            row.appendChild(cell);
            fleetVehicleTableBody.appendChild(row);
            return;
        }
        vehicles.forEach((vehicle) => {
            const row = document.createElement("tr");
            appendFleetStack(row, vehicle.vehicleNumber || `Vehicle ${vehicle.id}`, vehicle.registrationNumber || "Registration not recorded");
            appendFleetStack(row, vehicle.vehicleType, vehicle.make || "Make not recorded");
            appendFleetStatusCell(row, vehicle.vehicleStatus);
            if (vehicle.routeCode || vehicle.routeName) {
                appendFleetStack(row, vehicle.routeCode || "Assigned route", vehicle.routeName, vehicle.delayMinutes > 0 ? `${formatNumber(vehicle.delayMinutes)} recorded delay minute(s)` : "");
            } else {
                const cell = appendFleetCell(row, "fleet-no-assignment", "No current route assignment");
            }
            const location = vehicle.wardCode || vehicle.wardName
                ? `${vehicle.wardCode || "Ward"} · ${vehicle.wardName || "Name not recorded"}`
                : "Ward not assigned through a current route";
            appendFleetStack(row, location, vehicle.zoneName ? `${vehicle.zoneCode ? `${vehicle.zoneCode} · ` : ""}${vehicle.zoneName}` : "Zone not recorded");
            appendFleetStack(row, vehicle.driverName || "No current driver assignment", vehicle.driverEmployeeId || "Employee ID not recorded");
            appendFleetCell(row, "", `${formatTonnes(vehicle.currentLoadTons)} / ${formatTonnes(vehicle.capacityTons)}`);
            appendFleetCell(row, "", vehicle.etaMinutes === null || vehicle.etaMinutes === undefined ? "Not recorded" : `${formatNumber(vehicle.etaMinutes)} min (saved)`);
            if (vehicle.assignmentStatus) appendFleetStatusCell(row, vehicle.assignmentStatus);
            else {
                const cell = appendFleetCell(row, "fleet-no-assignment", "Unassigned");
                cell.className = "fleet-no-assignment";
            }
            fleetVehicleTableBody.appendChild(row);
        });
    }

    function renderFleetRouteRows(routes) {
        if (!fleetRouteTableBody) return;
        fleetRouteTableBody.replaceChildren();
        if (!Array.isArray(routes) || routes.length === 0) {
            const row = document.createElement("tr");
            const cell = createElement("td", "table-empty", "No routes match these filters.");
            cell.colSpan = 8;
            row.appendChild(cell);
            fleetRouteTableBody.appendChild(row);
            return;
        }
        routes.forEach((route) => {
            const row = document.createElement("tr");
            appendFleetStack(row, route.routeCode || `Route ${route.id}`, route.routeName,
                route.estimatedDistanceKm === null || route.estimatedDistanceKm === undefined ? "" : `${decimalFormat.format(asNumber(route.estimatedDistanceKm))} km estimated`);
            appendFleetStatusCell(row, route.routeStatus);
            appendFleetStack(row, route.wardCode || "Ward not recorded", route.wardName,
                route.zoneName ? `${route.zoneCode ? `${route.zoneCode} · ` : ""}${route.zoneName}` : "Zone not recorded");
            appendFleetStack(row, formatFleetDate(route.scheduledStartTime), route.scheduledEndTime ? `End: ${formatFleetDate(route.scheduledEndTime)}` : "End time not recorded");
            appendFleetCell(row, "fleet-progress-text", `${formatNumber(route.completedStops)} / ${formatNumber(route.totalStops)}`);
            const delayValue = asNumber(route.delayMinutes);
            appendFleetCell(row, delayValue > 0 ? "fleet-delay-cell" : "", delayValue > 0 ? `${formatNumber(delayValue)} min` : "0 min");
            appendFleetStack(row, route.vehicleNumber || "No current vehicle assignment", route.assignmentCode || "No current assignment record");
            appendFleetStack(row, route.driverName || "No current driver assignment", route.driverEmployeeId || "");
            fleetRouteTableBody.appendChild(row);
        });
    }

    async function loadFleetOperations() {
        if (fleetRequestInProgress) return;
        fleetRequestInProgress = true;
        if (refreshFleetButton) refreshFleetButton.disabled = true;
        if (applyFleetFiltersButton) applyFleetFiltersButton.disabled = true;
        clearFleetMessage();
        if ($("fleetVehicleResultsLine")) $("fleetVehicleResultsLine").textContent = "Loading vehicle records…";
        if ($("fleetRouteResultsLine")) $("fleetRouteResultsLine").textContent = "Loading route records…";
        const params = new URLSearchParams();
        params.set("vehicleStatus", fleetVehicleStatusFilter?.value || "all");
        params.set("routeStatus", fleetRouteStatusFilter?.value || "all");
        params.set("q", String(fleetSearchInput?.value || "").trim());
        try {
            const response = await fetch(`/api/deputy/fleet?${params.toString()}`, {
                method: "GET", credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" }
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401 || response.status === 403) { window.location.replace("/login"); return; }
            if (!response.ok || payload?.success !== true || !payload?.data) {
                throw new Error(payload?.message || "Fleet and operations data is currently unavailable.");
            }
            const data = payload.data;
            renderFleetSummary(data.summary || {});
            renderFleetVehicleRows(data.vehicles || []);
            renderFleetRouteRows(data.routes || []);
            const vehicleCount = asNumber(data.vehicles?.length);
            const routeCount = asNumber(data.routes?.length);
            const vehicleTotal = asNumber(data.vehicleTotalMatched);
            const routeTotal = asNumber(data.routeTotalMatched);
            setText("fleetVehicleTag", `${formatNumber(vehicleTotal)} vehicles`);
            setText("fleetRouteTag", `${formatNumber(routeTotal)} routes`);
            setText("fleetVehicleResultsLine", data.vehiclesTruncated
                ? `Showing ${formatNumber(vehicleCount)} of ${formatNumber(vehicleTotal)} matching vehicles (maximum 250).`
                : `Showing ${formatNumber(vehicleCount)} of ${formatNumber(vehicleTotal)} matching vehicles.`);
            setText("fleetRouteResultsLine", data.routesTruncated
                ? `Showing ${formatNumber(routeCount)} of ${formatNumber(routeTotal)} matching routes (maximum 250).`
                : `Showing ${formatNumber(routeCount)} of ${formatNumber(routeTotal)} matching routes.`);
            clearFleetMessage();
        } catch (error) {
            console.error("Deputy Commissioner fleet operations load failed:", error);
            showFleetMessage(error?.message || "Unable to load fleet and operations data.");
            renderFleetVehicleRows([]);
            renderFleetRouteRows([]);
            setText("fleetVehicleResultsLine", "Vehicle records are unavailable.");
            setText("fleetRouteResultsLine", "Route records are unavailable.");
        } finally {
            fleetRequestInProgress = false;
            if (refreshFleetButton) refreshFleetButton.disabled = false;
            if (applyFleetFiltersButton) applyFleetFiltersButton.disabled = false;
        }
    }


    // Part 5: date-scoped Reports & Analytics.
    const reportDateFrom = $("reportDateFrom");
    const reportDateTo = $("reportDateTo");
    const refreshReportsButton = $("refreshReportsButton");
    const applyReportFiltersButton = $("applyReportFiltersButton");
    const exportReportsButton = $("exportReportsButton");
    const reportsAlert = $("reportsAlert");
    let reportsRequestInProgress = false;
    let reportsData = null;

    function localDateInputValue(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function initializeReportDates() {
        if (!reportDateFrom || !reportDateTo) return;
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        reportDateFrom.value = localDateInputValue(start);
        reportDateTo.value = localDateInputValue(end);
        reportDateFrom.max = reportDateTo.value;
        reportDateTo.max = reportDateTo.value;
    }

    function showReportsMessage(message, isError = true) {
        if (!reportsAlert) return;
        reportsAlert.hidden = false;
        reportsAlert.classList.toggle("success", !isError);
        reportsAlert.textContent = message;
    }

    function clearReportsMessage() {
        if (!reportsAlert) return;
        reportsAlert.hidden = true;
        reportsAlert.classList.remove("success");
        reportsAlert.textContent = "";
    }

    function reportStatusLabel(status) {
        const labels = {
            in_progress: "In progress", open: "Open", resolved: "Resolved", cancelled: "Cancelled",
            collected: "Collected", skipped: "Skipped", scheduled: "Scheduled", starting: "Starting",
            active: "Active", delayed: "Delayed"
        };
        return labels[status] || String(status || "Unknown").replaceAll("_", " ");
    }

    function reportStatusTone(status) {
        if (["open", "in_progress", "delayed", "skipped"].includes(status)) return "warning";
        if (["critical"].includes(status)) return "danger";
        if (["cancelled"].includes(status)) return "neutral";
        return "";
    }

    function renderReportStatusList(containerId, items, order, totalId, totalLabel) {
        const container = $(containerId);
        if (!container) return;
        const byStatus = new Map((Array.isArray(items) ? items : []).map((item) => [String(item.status), item]));
        const normalized = order.map((status) => ({ status, count: asNumber(byStatus.get(status)?.count) }));
        const total = normalized.reduce((sum, item) => sum + item.count, 0);
        setText(totalId, `${formatNumber(total)} ${totalLabel}`);
        container.replaceChildren();
        normalized.forEach((item) => {
            const row = document.createElement("div");
            row.className = "report-status-row";
            const head = document.createElement("div");
            head.className = "report-status-head";
            const name = document.createElement("span");
            name.className = "report-status-name";
            name.textContent = reportStatusLabel(item.status);
            const value = document.createElement("strong");
            value.className = "report-status-value";
            value.textContent = formatNumber(item.count);
            head.append(name, value);
            const track = document.createElement("div");
            track.className = "report-status-track";
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", `${reportStatusLabel(item.status)} share`);
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            const percent = total > 0 ? Math.min(100, item.count / total * 100) : 0;
            track.setAttribute("aria-valuenow", percent.toFixed(1));
            const fill = document.createElement("span");
            fill.className = `report-status-fill${reportStatusTone(item.status) ? ` ${reportStatusTone(item.status)}` : ""}`;
            fill.style.width = `${percent}%`;
            track.appendChild(fill);
            row.append(head, track);
            container.appendChild(row);
        });
    }

    function buildReportDays(dateFrom, dateTo, series) {
        const rows = new Map((Array.isArray(series) ? series : []).map((item) => [String(item.day), item]));
        const result = [];
        const cursor = new Date(`${dateFrom}T00:00:00`);
        const end = new Date(`${dateTo}T00:00:00`);
        while (cursor <= end && result.length <= 366) {
            const key = localDateInputValue(cursor);
            result.push(rows.get(key) || { day: key, records: 0, collectedRecords: 0, collectedTons: 0 });
            cursor.setDate(cursor.getDate() + 1);
        }
        return result;
    }

    function renderReportTrend(series, period) {
        const container = $("reportCollectionTrend");
        if (!container) return;
        const days = buildReportDays(period.dateFrom, period.dateTo, series);
        const maximum = Math.max(0, ...days.map((item) => asNumber(item.collectedTons)));
        container.replaceChildren();
        setText("reportTrendTag", `${formatNumber(days.length)} days`);
        if (!days.length) {
            const empty = document.createElement("div");
            empty.className = "table-empty";
            empty.textContent = "No days are available for this reporting period.";
            container.appendChild(empty);
            return;
        }
        days.forEach((item) => {
            const tonnes = asNumber(item.collectedTons);
            const column = document.createElement("div");
            column.className = "report-trend-item";
            column.setAttribute("aria-label", `${item.day}: ${decimalFormat.format(tonnes)} tonnes`);
            column.title = `${item.day}: ${decimalFormat.format(tonnes)} tonnes`;
            const value = document.createElement("span");
            value.className = "report-trend-value";
            value.textContent = decimalFormat.format(tonnes);
            const track = document.createElement("div");
            track.className = "report-trend-track";
            const fill = document.createElement("span");
            fill.className = "report-trend-fill";
            fill.style.height = `${maximum > 0 ? Math.max(0, Math.min(100, tonnes / maximum * 100)) : 0}%`;
            track.appendChild(fill);
            const date = document.createElement("span");
            date.className = "report-trend-date";
            date.textContent = item.day.slice(5);
            column.append(value, track, date);
            container.appendChild(column);
        });
    }

    function renderReportDivisionRows(divisions) {
        const body = $("reportDivisionTableBody");
        if (!body) return;
        body.replaceChildren();
        const rows = Array.isArray(divisions) ? divisions : [];
        setText("reportDivisionTag", `${formatNumber(rows.length)} divisions`);
        if (!rows.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 9;
            cell.className = "table-empty";
            cell.textContent = "No Division comparison records are available.";
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }
        rows.forEach((division) => {
            const row = document.createElement("tr");
            const label = division.divisionCode
                ? `${division.divisionCode} · ${division.divisionName}`
                : division.divisionName;
            [label, formatNumber(division.collectionRecords), `${decimalFormat.format(asNumber(division.wasteTons))} t`,
                formatNumber(division.complaintsReported), formatNumber(division.activeComplaints),
                formatNumber(division.criticalActiveComplaints), formatNumber(division.routesInPeriod),
                formatNumber(division.completedRoutes), formatNumber(division.delayedRoutes)].forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
    }

    function renderReports(data) {
        const collections = data.summary?.collections || {};
        const complaints = data.summary?.complaints || {};
        const routes = data.summary?.routes || {};
        setText("reportCollectionRecords", formatNumber(collections.records));
        setText("reportCollectedRecords", formatNumber(collections.collected));
        setText("reportWasteTons", `${decimalFormat.format(asNumber(collections.wasteTons))} t`);
        setText("reportComplaints", formatNumber(complaints.reported));
        setText("reportActiveComplaints", formatNumber(asNumber(complaints.open) + asNumber(complaints.inProgress)));
        setText("reportCriticalComplaints", `${formatNumber(complaints.criticalActive)} critical active`);
        setText("reportRoutes", formatNumber(routes.total));
        setText("reportCompletedRoutes", `${formatNumber(routes.completed)} completed`);
        setText("reportCollectionSubtext", `${formatNumber(collections.inProgress)} in progress · ${formatNumber(collections.skipped)} skipped`);
        setText("reportsPeriodCaption", `${data.period.dateFrom} to ${data.period.dateTo} · ${formatNumber(data.period.days)} calendar days`);
        if (reportDateFrom) reportDateFrom.max = data.period.dateTo;
        if (reportDateTo) reportDateTo.max = localDateInputValue(new Date());
        renderReportTrend(data.collectionTrend, data.period);
        renderReportStatusList("reportCollectionStatuses", data.collectionStatuses, ["collected", "in_progress", "skipped"], "reportCollectionStatusTotal", "records");
        renderReportStatusList("reportComplaintStatuses", data.complaintStatuses, ["open", "in_progress", "resolved", "cancelled"], "reportComplaintStatusTotal", "complaints");
        renderReportStatusList("reportRouteStatuses", data.routeStatuses, ["scheduled", "starting", "active", "delayed", "completed", "cancelled"], "reportRouteStatusTotal", "routes");
        renderReportDivisionRows(data.divisions);
        reportsData = data;
        if (exportReportsButton) exportReportsButton.disabled = false;
    }

    async function loadReports() {
        if (reportsRequestInProgress) return;
        if (!reportDateFrom?.value || !reportDateTo?.value) {
            showReportsMessage("Choose both a start date and an end date.");
            return;
        }
        if (reportDateFrom.value > reportDateTo.value) {
            showReportsMessage("The start date cannot be later than the end date.");
            return;
        }
        const start = new Date(`${reportDateFrom.value}T00:00:00`);
        const end = new Date(`${reportDateTo.value}T00:00:00`);
        const days = Math.floor((end - start) / 86400000) + 1;
        if (!Number.isFinite(days) || days < 1 || days > 366) {
            showReportsMessage("Choose a valid reporting period of 366 calendar days or fewer.");
            return;
        }
        reportsRequestInProgress = true;
        if (refreshReportsButton) refreshReportsButton.disabled = true;
        if (applyReportFiltersButton) applyReportFiltersButton.disabled = true;
        if (exportReportsButton) exportReportsButton.disabled = true;
        setText("reportsPeriodCaption", "Loading selected reporting period…");
        clearReportsMessage();
        const params = new URLSearchParams({ dateFrom: reportDateFrom.value, dateTo: reportDateTo.value });
        try {
            const response = await fetch(`/api/deputy/reports?${params.toString()}`, {
                method: "GET", credentials: "same-origin", headers: { "Accept": "application/json" }, cache: "no-store"
            });
            let payload;
            try { payload = await response.json(); }
            catch { throw new Error("The server returned an unreadable report response."); }
            if (!response.ok || payload?.success !== true || !payload.data) {
                throw new Error(payload?.message || "Reports and analytics data is currently unavailable.");
            }
            renderReports(payload.data);
        } catch (error) {
            console.error("Deputy Commissioner reports load failed:", error);
            reportsData = null;
            if (exportReportsButton) exportReportsButton.disabled = true;
            setText("reportsPeriodCaption", "Report data could not be loaded.");
            showReportsMessage(error?.message || "Unable to load report data.");
        } finally {
            reportsRequestInProgress = false;
            if (refreshReportsButton) refreshReportsButton.disabled = false;
            if (applyReportFiltersButton) applyReportFiltersButton.disabled = false;
        }
    }

    function csvSafeValue(value) {
        let text = value === null || value === undefined ? "" : String(value);
        if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    }

    function exportReportsCsv() {
        if (!reportsData) {
            showReportsMessage("Load a report successfully before exporting it.");
            return;
        }
        const data = reportsData;
        const rows = [
            ["SWACHHITRA Reports & Analytics"],
            ["Reporting period", data.period.dateFrom, data.period.dateTo, `${data.period.days} calendar days`],
            ["Generated at", data.generatedAt],
            [],
            ["Summary", "Metric", "Value"],
            ["Collections", "All records", data.summary.collections.records],
            ["Collections", "Collected records", data.summary.collections.collected],
            ["Collections", "In-progress records", data.summary.collections.inProgress],
            ["Collections", "Skipped records", data.summary.collections.skipped],
            ["Collections", "Collected tonnes", data.summary.collections.wasteTons],
            ["Complaints", "Reported", data.summary.complaints.reported],
            ["Complaints", "Open", data.summary.complaints.open],
            ["Complaints", "In progress", data.summary.complaints.inProgress],
            ["Complaints", "Resolved (current status)", data.summary.complaints.resolved],
            ["Complaints", "Cancelled", data.summary.complaints.cancelled],
            ["Complaints", "Critical active", data.summary.complaints.criticalActive],
            ["Routes", "In period", data.summary.routes.total],
            ["Routes", "Scheduled", data.summary.routes.scheduled],
            ["Routes", "Starting", data.summary.routes.starting],
            ["Routes", "Active", data.summary.routes.active],
            ["Routes", "Delayed", data.summary.routes.delayed],
            ["Routes", "Completed", data.summary.routes.completed],
            ["Routes", "Cancelled", data.summary.routes.cancelled],
            [],
            ["Daily collection trend", "Date", "Records", "Collected records", "Collected tonnes"]
        ];
        (data.collectionTrend || []).forEach((item) => rows.push(["Daily collection trend", item.day, item.records, item.collectedRecords, item.collectedTons]));
        rows.push([], ["Collection statuses", "Status", "Records", "Collected tonnes"]);
        (data.collectionStatuses || []).forEach((item) => rows.push(["Collection statuses", item.status, item.count, item.collectedTons]));
        rows.push([], ["Complaint statuses", "Current status", "Reported complaints", "Critical active"]);
        (data.complaintStatuses || []).forEach((item) => rows.push(["Complaint statuses", item.status, item.count, item.criticalActive]));
        rows.push([], ["Route statuses", "Current status", "Routes in period"]);
        (data.routeStatuses || []).forEach((item) => rows.push(["Route statuses", item.status, item.count]));
        rows.push([], ["Division comparison", "Division code", "Division name", "Collection records", "Collected records", "Collected tonnes", "Complaints reported", "Active complaints", "Resolved complaints", "Critical active complaints", "Routes in period", "Completed routes", "Delayed routes"]);
        (data.divisions || []).forEach((item) => rows.push([
            "Division comparison", item.divisionCode, item.divisionName, item.collectionRecords, item.collectedRecords,
            item.wasteTons, item.complaintsReported, item.activeComplaints, item.resolvedComplaints,
            item.criticalActiveComplaints, item.routesInPeriod, item.completedRoutes, item.delayedRoutes
        ]));
        const csv = `\uFEFF${rows.map((row) => row.map(csvSafeValue).join(",")).join("\r\n")}`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `swachhitra-report-${data.period.dateFrom}-to-${data.period.dateTo}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showReportsMessage("CSV export prepared from the currently loaded report.", false);
    }



    // Part 6: account access review and reasoned staff status controls.
    let securityRequestInProgress = false;
    let selectedStaffAccount = null;
    let securityLastData = null;

    function securityRoleLabel(role) {
        if (role === "assistant_commissioner") return "Assistant Commissioner";
        if (role === "sanitary_inspector") return "Sanitary Inspector";
        return String(role || "Unknown role").replace(/_/g, " ");
    }

    function formatSecurityDate(value) {
        if (!value) return "Not recorded";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    }

    function showSecurityMessage(message, isError = true) {
        const alert = $("securityAlert");
        if (!alert) return;
        alert.hidden = false;
        alert.classList.toggle("success", !isError);
        alert.textContent = String(message || "");
    }

    function hideSecurityMessage() {
        const alert = $("securityAlert");
        if (alert) { alert.hidden = true; alert.textContent = ""; alert.classList.remove("success"); }
    }

    function showStaffDialogMessage(message) {
        const alert = $("staffAccountDialogAlert");
        if (!alert) return;
        alert.hidden = false;
        alert.textContent = String(message || "");
    }

    function renderSecurityAccounts(accounts) {
        const body = $("securityAccountTableBody");
        if (!body) return;
        body.replaceChildren();
        const rows = Array.isArray(accounts) ? accounts : [];
        if (!rows.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6;
            td.className = "table-empty";
            td.textContent = "No staff accounts match these filters.";
            tr.appendChild(td);
            body.appendChild(tr);
            return;
        }

        rows.forEach((account) => {
            const tr = document.createElement("tr");
            const accountCell = document.createElement("td");
            const name = document.createElement("strong");
            name.className = "security-account-name";
            name.textContent = account.fullName || `Staff account #${account.userId}`;
            const email = document.createElement("span");
            email.className = "security-account-meta";
            email.textContent = `${account.email || "No email recorded"} · ID ${account.userId}`;
            accountCell.append(name, email);

            const roleCell = document.createElement("td");
            roleCell.textContent = securityRoleLabel(account.role);

            const scopeCell = document.createElement("td");
            const division = account.divisionName || (account.divisionId ? `Division ${account.divisionId}` : "Division not assigned");
            const ward = account.role === "sanitary_inspector" ? (account.wardCode || "Ward not assigned") : "Division-wide scope";
            scopeCell.textContent = `${division} · ${ward}`;

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `security-status-badge ${account.status === "active" ? "active" : account.status === "inactive" ? "inactive" : ""}`.trim();
            badge.textContent = account.status || "Unknown";
            statusCell.appendChild(badge);

            const updatedCell = document.createElement("td");
            updatedCell.textContent = formatSecurityDate(account.updatedAt || account.createdAt);

            const actionCell = document.createElement("td");
            if (account.status === "active" || account.status === "inactive") {
                const targetStatus = account.status === "active" ? "inactive" : "active";
                const button = document.createElement("button");
                button.type = "button";
                button.className = `security-action-button ${targetStatus === "inactive" ? "deactivate" : "activate"}`;
                button.textContent = targetStatus === "inactive" ? "Deactivate" : "Reactivate";
                button.setAttribute("aria-label", `${button.textContent} ${securityRoleLabel(account.role)} account #${account.userId}`);
                button.addEventListener("click", () => openStaffAccountDialog(account, targetStatus));
                actionCell.appendChild(button);
            } else {
                actionCell.textContent = "Manual review required";
            }

            tr.append(accountCell, roleCell, scopeCell, statusCell, updatedCell, actionCell);
            body.appendChild(tr);
        });
    }

    function renderSecurityAudit(events) {
        const body = $("securityAuditTableBody");
        if (!body) return;
        body.replaceChildren();
        const rows = Array.isArray(events) ? events : [];
        setText("securityAuditTag", `${formatNumber(rows.length)} events`);
        if (!rows.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6;
            td.className = "table-empty";
            td.textContent = "No account-status audit events have been recorded yet.";
            tr.appendChild(td);
            body.appendChild(tr);
            return;
        }
        rows.forEach((event) => {
            const tr = document.createElement("tr");
            const timeCell = document.createElement("td");
            timeCell.textContent = formatSecurityDate(event.occurredAt || event.requestedAt);
            const outcomeCell = document.createElement("td");
            const outcome = document.createElement("span");
            outcome.className = `security-outcome-badge ${String(event.outcome || "pending_review")}`;
            outcome.textContent = String(event.outcome || "pending review").replace(/_/g, " ");
            outcomeCell.appendChild(outcome);
            const actorCell = document.createElement("td");
            actorCell.textContent = `DC #${event.actorUserId || "?"} → ${securityRoleLabel(event.targetRole)} #${event.targetUserId || "?"}`;
            const changeCell = document.createElement("td");
            changeCell.textContent = `${event.previousStatus || "unknown"} → ${event.newStatus || "unknown"}`;
            const reasonCell = document.createElement("td");
            reasonCell.textContent = event.reason || "No reason recorded";
            const sessionCell = document.createElement("td");
            sessionCell.textContent = event.sessionsInvalidated == null ? "—" : formatNumber(event.sessionsInvalidated);
            tr.append(timeCell, outcomeCell, actorCell, changeCell, reasonCell, sessionCell);
            body.appendChild(tr);
        });
    }

    function renderSecuritySummary(summary) {
        setText("securityManagedAccounts", formatNumber(summary.totalManagedAccounts));
        setText("securityActiveAccounts", formatNumber(summary.activeManagedAccounts));
        setText("securityInactiveAccounts", formatNumber(summary.inactiveManagedAccounts));
        setText("securityActiveAssistants", formatNumber(summary.activeAssistantCommissioners));
        setText("securityActiveInspectors", formatNumber(summary.activeInspectors));
        setText("securityScopeIssues", formatNumber(summary.incompleteScopeAccounts));
    }

    async function loadSecurityCenter() {
        if (securityRequestInProgress) return;
        securityRequestInProgress = true;
        const refreshButton = $("refreshSecurityButton");
        const applyButton = $("applySecurityFiltersButton");
        if (refreshButton) refreshButton.disabled = true;
        if (applyButton) applyButton.disabled = true;
        hideSecurityMessage();
        try {
            const params = new URLSearchParams();
            const q = String($("securitySearchInput")?.value || "").trim();
            const role = String($("securityRoleFilter")?.value || "all");
            const status = String($("securityStatusFilter")?.value || "all");
            if (q) params.set("q", q);
            if (role !== "all") params.set("role", role);
            if (status !== "all") params.set("status", status);
            const response = await fetch(`/api/deputy/security${params.toString() ? `?${params.toString()}` : ""}`, {
                method: "GET", credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" }
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401) { window.location.replace("/login"); return; }
            if (!response.ok || payload?.success !== true || !payload.data) throw new Error(payload?.message || "Security and account data could not be loaded.");
            const data = payload.data;
            securityLastData = data;
            renderSecuritySummary(data.summary || {});
            renderSecurityAccounts(data.accounts || []);
            renderSecurityAudit(data.auditEvents || []);
            setText("securityAccountTag", `${formatNumber((data.accounts || []).length)} shown`);
            setText("securityAccountResultsLine", data.truncated
                ? `Showing ${formatNumber((data.accounts || []).length)} of ${formatNumber(data.total)} matching staff accounts. Narrow the filters to find a specific record.`
                : `Showing ${formatNumber((data.accounts || []).length)} of ${formatNumber(data.total)} matching staff accounts.`);
        } catch (error) {
            console.error("Deputy Commissioner security centre load failed:", error);
            showSecurityMessage(error?.message || "Security and account data could not be loaded.");
            const body = $("securityAccountTableBody");
            if (body) {
                body.replaceChildren();
                const tr = document.createElement("tr"); const td = document.createElement("td");
                td.colSpan = 6; td.className = "table-empty"; td.textContent = "Security data is unavailable. Use Refresh security to retry.";
                tr.appendChild(td); body.appendChild(tr);
            }
            setText("securityAccountResultsLine", "Staff access records are unavailable.");
        } finally {
            securityRequestInProgress = false;
            if (refreshButton) refreshButton.disabled = false;
            if (applyButton) applyButton.disabled = false;
        }
    }

    function openStaffAccountDialog(account, targetStatus) {
        const dialog = $("staffAccountDialog");
        const form = $("staffAccountForm");
        const submit = $("submitStaffAccountButton");
        if (!dialog || !form || !account || !["active", "inactive"].includes(targetStatus)) return;
        selectedStaffAccount = account;
        $("staffAccountTargetId").value = String(account.userId);
        $("staffAccountTargetStatus").value = targetStatus;
        $("staffAccountReason").value = "";
        $("staffAccountDialogSummary").textContent = `${targetStatus === "inactive" ? "Deactivate" : "Reactivate"} ${account.fullName || `staff account #${account.userId}`} (${securityRoleLabel(account.role)}, ${account.email || "no email recorded"}). This action will invalidate saved sessions.`;
        const alert = $("staffAccountDialogAlert");
        if (alert) { alert.hidden = true; alert.textContent = ""; }
        submit.disabled = false;
        submit.textContent = targetStatus === "inactive" ? "Confirm deactivation" : "Confirm reactivation";
        submit.classList.toggle("activate", targetStatus === "active");
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "open");
        window.setTimeout(() => $("staffAccountReason")?.focus(), 0);
    }

    function closeStaffAccountDialog() {
        const dialog = $("staffAccountDialog");
        if (typeof dialog?.close === "function") dialog.close();
        else dialog?.removeAttribute("open");
        selectedStaffAccount = null;
    }

    async function submitStaffAccountChange(event) {
        event.preventDefault();
        const form = $("staffAccountForm");
        const submit = $("submitStaffAccountButton");
        if (!form || !submit || !form.reportValidity()) return;
        const userId = String($("staffAccountTargetId").value || "");
        const status = String($("staffAccountTargetStatus").value || "");
        const reason = String($("staffAccountReason").value || "").trim();
        if (!userId || !["active", "inactive"].includes(status)) return;
        submit.disabled = true;
        submit.textContent = "Saving…";
        const dialogAlert = $("staffAccountDialogAlert");
        if (dialogAlert) { dialogAlert.hidden = true; dialogAlert.textContent = ""; }
        try {
            const csrfToken = await getDeputyCsrfToken();
            const response = await fetch(`/api/deputy/security/accounts/${encodeURIComponent(userId)}/status`, {
                method: "POST", credentials: "same-origin", cache: "no-store",
                headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                body: JSON.stringify({ status, reason })
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401) { window.location.replace("/login"); return; }
            if (!response.ok || payload?.success !== true) throw new Error(payload?.message || "The account status could not be changed.");
            closeStaffAccountDialog();
            await loadSecurityCenter();
            if (payload.auditRecorded === false) {
                showSecurityMessage(payload.auditWarning || "Account status changed, but the audit completion record could not be written. Preserve the server logs.");
            } else {
                showSecurityMessage(payload.message || "Staff account status updated and saved sessions invalidated.", false);
            }
        } catch (error) {
            console.error("Deputy Commissioner staff account update failed:", error);
            showStaffDialogMessage(error?.message || "The account status could not be changed.");
        } finally {
            submit.disabled = false;
            const targetStatus = String($("staffAccountTargetStatus")?.value || "");
            submit.textContent = targetStatus === "inactive" ? "Confirm deactivation" : "Confirm reactivation";
        }
    }


    const NAVIGATION_META = {
        "overview": {
            title: "City Overview",
            description: "City-wide waste collection and service operations at a glance."
        },
        "operational-pulse": {
            title: "Operational Pulse",
            description: "Review recorded route progress and complaint status across the city."
        },
        "daily-collections": {
            title: "Daily Collections",
            description: "Inspect the last seven days of recorded waste collection activity."
        },
        "division-supervision": {
            title: "Division & Ward Supervision",
            description: "Compare divisional performance and inspect assigned Ward activity."
        },
        "complaint-oversight": {
            title: "Complaint Oversight",
            description: "Review city-wide complaints, filter ageing cases, and escalate when needed."
        },
        "fleet-operations": {
            title: "Fleet Operations",
            description: "Review saved vehicle status, current route assignments, and route progress."
        },
        "reports-analytics": {
            title: "Reports & Analytics",
            description: "Compare recorded collection, complaint, and route activity over a selected period."
        },
        "security-administration": {
            title: "Security & Admin",
            description: "Review managed staff access and apply controlled account-status actions."
        }
    };

    function activateNavigation(link) {
        if (!link) return false;

        const targetId = String(link.getAttribute("href") || "").replace(/^#/, "");
        const targetPanel = targetId ? $(targetId) : null;
        if (!targetPanel || !targetPanel.classList.contains("dashboard-tab-panel")) {
            return false;
        }

        document.querySelectorAll(".dashboard-tab-panel").forEach((panel) => {
            const active = panel === targetPanel;
            panel.hidden = !active;
            panel.classList.toggle("is-active", active);
        });

        navLinks.forEach((item) => {
            const active = item === link;
            item.classList.toggle("active", active);
            if (active) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
        });

        const meta = NAVIGATION_META[targetId] || {
            title: link.textContent.trim(),
            description: "SWACHHITRA city-wide supervisory tools."
        };
        if (pageTitle) pageTitle.textContent = meta.title;
        if (pageDescription) pageDescription.textContent = meta.description;
        document.title = `${meta.title} | SWACHHITRA`;
        return true;
    }

    function activateNavigationFromHash() {
        const requestedHash = window.location.hash || "#overview";
        const link = navLinks.find((item) => item.getAttribute("href") === requestedHash)
            || navLinks[0];
        if (link) activateNavigation(link);
    }

    async function logout() {
        logoutButton.disabled = true;
        logoutButton.textContent = "Signing out…";
        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) throw new Error("Logout request was not accepted.");
        } catch (error) {
            console.error("Deputy Commissioner logout failed:", error);
            logoutButton.disabled = false;
            logoutButton.innerHTML = "<span>⇥</span> Sign out";
            dataAlert.hidden = false;
            dataAlert.textContent = "Unable to sign out right now. Please retry.";
            return;
        }
        window.location.replace("/login");
    }

    function setSidebarOpen(open) {
        if (!appShell || !sidebar || !sidebarToggleButton) return;

        const isMobile = sidebarMediaQuery.matches;
        if (isMobile) {
            appShell.classList.remove("sidebar-collapsed");
            sidebar.classList.toggle("open", open);
            appShell.classList.toggle("mobile-sidebar-open", open);
            if (sidebarBackdrop) sidebarBackdrop.classList.toggle("visible", open);
            document.body.style.overflow = open ? "hidden" : "";
        } else {
            appShell.classList.remove("mobile-sidebar-open");
            sidebar.classList.remove("open");
            if (sidebarBackdrop) sidebarBackdrop.classList.remove("visible");
            document.body.style.overflow = "";
            appShell.classList.toggle("sidebar-collapsed", !open);
        }

        sidebarToggleButton.setAttribute("aria-expanded", String(open));
        const label = isMobile
            ? (open ? "Close navigation" : "Open navigation")
            : (open ? "Collapse sidebar" : "Expand sidebar");
        sidebarToggleButton.setAttribute("aria-label", label);
        sidebarToggleButton.title = label;
    }

    sidebarToggleButton?.addEventListener("click", () => {
        const open = sidebarMediaQuery.matches
            ? !sidebar?.classList.contains("open")
            : appShell?.classList.contains("sidebar-collapsed");
        setSidebarOpen(Boolean(open));
    });
    sidebarBackdrop?.addEventListener("click", () => setSidebarOpen(false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && sidebarMediaQuery.matches && sidebar?.classList.contains("open")) {
            setSidebarOpen(false);
        }
    });
    const handleSidebarBreakpointChange = () => setSidebarOpen(!sidebarMediaQuery.matches);
    if (typeof sidebarMediaQuery.addEventListener === "function") {
        sidebarMediaQuery.addEventListener("change", handleSidebarBreakpointChange);
    } else if (typeof sidebarMediaQuery.addListener === "function") {
        sidebarMediaQuery.addListener(handleSidebarBreakpointChange);
    }
    setSidebarOpen(!sidebarMediaQuery.matches);
    activateNavigationFromHash();

    refreshButton?.addEventListener("click", loadOverview);
    refreshDivisionsButton?.addEventListener("click", async () => {
        await loadDivisions();
        if (selectedDivisionId) {
            const title = $("wardDetailTitle")?.textContent || `Division ${selectedDivisionId}`;
            await loadDivisionWards(selectedDivisionId, title);
        }
    });
    $("closeWardDetailButton")?.addEventListener("click", () => {
        if (wardDetailPanel) wardDetailPanel.hidden = true;
        selectedDivisionId = null;
    });
    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            activateNavigation(link);
            if (sidebarMediaQuery.matches) setSidebarOpen(false);
        });
    });
    window.addEventListener("hashchange", () => {
        activateNavigationFromHash();
        if (sidebarMediaQuery.matches && sidebar?.classList.contains("open")) {
            setSidebarOpen(false);
        }
    });
    logoutButton?.addEventListener("click", logout);
    refreshComplaintsButton?.addEventListener("click", loadComplaints);
    refreshFleetButton?.addEventListener("click", loadFleetOperations);
    applyFleetFiltersButton?.addEventListener("click", loadFleetOperations);
    refreshReportsButton?.addEventListener("click", loadReports);
    applyReportFiltersButton?.addEventListener("click", loadReports);
    reportDateFrom?.addEventListener("change", () => { if (reportDateFrom.value) reportDateTo.min = reportDateFrom.value; });
    reportDateTo?.addEventListener("change", () => { if (reportDateTo.value) reportDateFrom.max = reportDateTo.value; });
    exportReportsButton?.addEventListener("click", exportReportsCsv);
    $("refreshSecurityButton")?.addEventListener("click", loadSecurityCenter);
    $("applySecurityFiltersButton")?.addEventListener("click", loadSecurityCenter);
    $("securitySearchInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadSecurityCenter(); });
    $("staffAccountForm")?.addEventListener("submit", submitStaffAccountChange);
    $("cancelStaffAccountButton")?.addEventListener("click", closeStaffAccountDialog);
    $("cancelStaffAccountX")?.addEventListener("click", closeStaffAccountDialog);
    fleetSearchInput?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadFleetOperations(); });
    applyComplaintFiltersButton?.addEventListener("click", loadComplaints);
    complaintDivisionFilter?.addEventListener("change", async () => {
        if (complaintWardFilter) complaintWardFilter.value = "all";
        if (!complaintDivisionFilter.value || complaintDivisionFilter.value === "all") {
            setComplaintWardPlaceholder("Select a Division first");
        } else {
            await loadComplaintWardOptions(complaintDivisionFilter.value);
        }
        await loadComplaints();
    });
    complaintSearchInput?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadComplaints(); });
    escalationForm?.addEventListener("submit", submitComplaintEscalation);
    $("cancelEscalationButton")?.addEventListener("click", () => {
        if (typeof escalationDialog?.close === "function") escalationDialog.close();
        else escalationDialog?.removeAttribute("open");
    });
    loadOverview();
    loadDivisions();
    loadComplaints();
    loadFleetOperations();
    initializeReportDates();
    loadReports();
    loadSecurityCenter();
    window.setInterval(loadOverview, 60000);
})();

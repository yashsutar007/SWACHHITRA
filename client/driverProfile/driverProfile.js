(() => {
    "use strict";

    const notice = document.getElementById("driverProfileNotice");
    const details = document.getElementById("driverProfileDetails");

    function showNotice(message, kind = "") {
        notice.textContent = String(message || "");
        notice.className = `profile-message show ${kind}`.trim();
    }

    function addField(label, value) {
        const wrapper = document.createElement("div");
        wrapper.className = "driver-profile-field";
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value === null || value === undefined || String(value).trim() === ""
            ? "Not available"
            : String(value);
        wrapper.append(term, description);
        details.appendChild(wrapper);
    }

    async function readJSON(response) {
        try { return await response.json(); }
        catch { throw new Error("The server returned an invalid response."); }
    }

    async function loadDriverProfile() {
        try {
            const meResponse = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
            if (meResponse.status === 401) { window.location.replace("/login"); return; }
            const meResult = await readJSON(meResponse);
            if (!meResponse.ok || meResult.success !== true || meResult.user?.role !== "driver") {
                window.location.replace("/login");
                return;
            }

            const driverResponse = await fetch("/api/driver/me", { credentials: "same-origin", cache: "no-store" });
            const driverResult = await readJSON(driverResponse);
            if (!driverResponse.ok || driverResult.success !== true || !driverResult.driver) {
                showNotice(driverResult.message || "Your login is not ready. Contact your assigned Inspector.", "error");
                return;
            }

            const driver = driverResult.driver;
            document.getElementById("driverProfileTitle").textContent = `${driver.fullName || "Driver"} — Profile`;
            details.replaceChildren();
            addField("Full name", driver.fullName);
            addField("Employee ID", driver.employeeId);
            addField("Login email", driver.email);
            addField("Mobile number", driver.mobileNumber);
            addField("Licence number", driver.licenseNumber);
            addField("Licence type", driver.licenseType);
            addField("Assigned Ward", driver.ward ? `${driver.ward.code} — ${driver.ward.name}` : "Not assigned");
            addField("Zone", driver.zone ? `${driver.zone.code} — ${driver.zone.name}` : "Not assigned");
            addField("Registry status", driver.status);
            showNotice("These official details are read-only. Contact your assigned Inspector to request a correction.", "info");
        } catch (error) {
            console.error("Driver profile load failed:", error);
            showNotice(error.message || "Unable to load your Driver profile.", "error");
        }
    }

    document.addEventListener("DOMContentLoaded", loadDriverProfile);
})();

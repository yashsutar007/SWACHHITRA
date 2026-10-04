document.addEventListener("DOMContentLoaded", async () => {
    "use strict";

    const form = document.getElementById("profileForm");
    const fieldsContainer = document.getElementById("profileFields");
    const selectedRole = document.getElementById("selectedRole");
    const roleInitial = document.getElementById("roleInitial");
    const profileTitle = document.getElementById("profileTitle");
    const profileSubtitle = document.getElementById("profileSubtitle");
    const message = document.getElementById("profileMessage");
    const submitButton = document.getElementById("submitButton");
    const submitText = document.getElementById("submitText");
    const backButton = document.getElementById("backButton");

    const roles = {
        citizen: "Citizen",
        driver: "Driver",
        sanitary_inspector: "Sanitary Inspector",
        assistant_commissioner: "Assistant Commissioner",
        deputy_commissioner: "Deputy Commissioner (Health)"
    };

    /*
     * IMPORTANT:
     * These rules mirror the new profileController contract.
     * Sanitary Inspector scope is NOT self-service.
     */
    const rules = {
        citizen: {
            requiresEmployeeId: false,
            requiresZone: true,
            requiresWard: true,
            requiresDivision: false,
            requiresInspectorScope: false,
            driverFields: false
        },

        driver: {
            requiresEmployeeId: true,
            requiresZone: true,
            requiresWard: true,
            requiresDivision: false,
            requiresInspectorScope: false,
            driverFields: true
        },

        sanitary_inspector: {
            requiresEmployeeId: true,
            requiresZone: false,
            requiresWard: false,
            requiresDivision: false,
            requiresInspectorScope: true,
            driverFields: false
        },

        assistant_commissioner: {
            requiresEmployeeId: true,
            requiresZone: false,
            requiresWard: false,
            requiresDivision: true,
            requiresInspectorScope: false,
            driverFields: false
        },

        deputy_commissioner: {
            requiresEmployeeId: true,
            requiresZone: false,
            requiresWard: false,
            requiresDivision: false,
            requiresInspectorScope: false,
            driverFields: false
        }
    };

    const departmentOptions = {
        sanitary_inspector: [
            "Solid Waste Management",
            "Sanitation Department",
            "Municipal Corporation"
        ],

        assistant_commissioner: [
            "Solid Waste Management",
            "Sanitation Department",
            "Municipal Administration"
        ],

        driver: [
            "Solid Waste Management",
            "Municipal Transport",
            "Sanitation Department"
        ]
    };

    const designationOptions = {
        sanitary_inspector: [
            "Sanitary Inspector",
            "Senior Sanitary Inspector",
            "Health Inspector"
        ],

        assistant_commissioner: [
            "Assistant Commissioner",
            "Assistant Commissioner (Health)"
        ],

        deputy_commissioner: [
            "Deputy Commissioner",
            "Deputy Commissioner (Health)"
        ],

        driver: [
            "Driver",
            "Heavy Vehicle Driver"
        ]
    };

    const shiftOptions = [
        "Morning",
        "Afternoon",
        "Full Day"
    ];

    const languageOptions = [
        "English",
        "Hindi",
        "Marathi"
    ];

    const notificationOptions = [
        "SMS",
        "Email",
        "Both",
        "All Notifications"
    ];

    const licenseTypeOptions = [
        "LMV",
        "HMV",
        "Transport Vehicle"
    ];

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showMessage(text, type = "") {
        if (!message) {
            return;
        }

        const cleanText = String(text || "").trim();
        message.textContent = cleanText;

        if (!cleanText) {
            message.className = "profile-message";
            return;
        }

        message.className = `profile-message show ${type}`.trim();
    }

    function fieldHTML({
        label,
        name,
        type = "text",
        value = "",
        required = false,
        placeholder = "",
        fullWidth = false,
        readonly = false,
        disabled = false,
        pattern = ""
    }) {
        const star = required
            ? '<span class="required">*</span>'
            : "";

        return `
            <div class="field${fullWidth ? " full-width" : ""}">
                <label for="${escapeHTML(name)}">
                    ${escapeHTML(label)}
                    ${star}
                </label>

                <input
                    id="${escapeHTML(name)}"
                    name="${escapeHTML(name)}"
                    type="${escapeHTML(type)}"
                    value="${escapeHTML(value)}"
                    placeholder="${escapeHTML(placeholder)}"
                    ${required ? "required" : ""}
                    ${readonly ? "readonly" : ""}
                    ${disabled ? "disabled" : ""}
                    ${pattern ? `pattern="${escapeHTML(pattern)}"` : ""}
                >
            </div>
        `;
    }

    function selectHTML({
        label,
        name,
        required = false,
        options = [],
        selectedValue = "",
        placeholder = "Select",
        disabled = false
    }) {
        const star = required
            ? '<span class="required">*</span>'
            : "";

        const optionHTML = options.map(option => {
            const value = typeof option === "object"
                ? option.value
                : option;

            const text = typeof option === "object"
                ? option.label
                : option;

            const selected = String(value) === String(selectedValue)
                ? "selected"
                : "";

            return `
                <option value="${escapeHTML(value)}" ${selected}>
                    ${escapeHTML(text)}
                </option>
            `;
        }).join("");

        return `
            <div class="field">
                <label for="${escapeHTML(name)}">
                    ${escapeHTML(label)}
                    ${star}
                </label>

                <select
                    id="${escapeHTML(name)}"
                    name="${escapeHTML(name)}"
                    ${required ? "required" : ""}
                    ${disabled ? "disabled" : ""}
                >
                    <option value="">${escapeHTML(placeholder)}</option>
                    ${optionHTML}
                </select>
            </div>
        `;
    }

    function sectionHTML(title, description, fieldMarkup) {
        return `
            <section class="form-section">
                <div class="section-heading">
                    <h3>${escapeHTML(title)}</h3>
                    <p>${escapeHTML(description)}</p>
                </div>

                <div class="profile-fields">
                    ${fieldMarkup}
                </div>
            </section>
        `;
    }

    function scopeInfoHTML({
        title,
        description,
        divisionName,
        wardName,
        pending = false
    }) {
        const divisionText = divisionName || "Not assigned";
        const wardText = wardName || (pending ? "Pending assignment" : "Not applicable");

        return `
            <div class="field">
                <label>Assigned Division</label>
                <input type="text" value="${escapeHTML(divisionText)}" readonly>
            </div>

            <div class="field">
                <label>Assigned Ward</label>
                <input type="text" value="${escapeHTML(wardText)}" readonly>
            </div>

            ${pending ? `
                <div class="field full-width">
                    <p style="margin:0;color:var(--text-muted,#6e796d);line-height:1.55;">
                        ${escapeHTML(description)}
                    </p>
                </div>
            ` : ""}
        `;
    }

    function setSelectOptions(select, options, placeholder, selectedValue = "") {
        if (!select) {
            return;
        }

        select.innerHTML = "";

        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = placeholder;
        select.appendChild(placeholderOption);

        options.forEach(optionData => {
            const option = document.createElement("option");
            option.value = String(optionData.value);
            option.textContent = optionData.label;

            if (String(optionData.value) === String(selectedValue)) {
                option.selected = true;
            }

            select.appendChild(option);
        });
    }

    function valueOrEmpty(value) {
        return value === null || value === undefined
            ? ""
            : String(value);
    }

    async function readJSON(response, fallbackMessage) {
        try {
            return await response.json();
        } catch (_) {
            throw new Error(fallbackMessage);
        }
    }

    if (!form || !fieldsContainer) {
        return;
    }

    try {
        /* -------------------------------------------------------------
         * 1. Verify authentication.
         * ------------------------------------------------------------- */
        const meResponse = await fetch("/api/auth/me", {
            credentials: "same-origin"
        });

        if (!meResponse.ok) {
            window.location.replace("/login");
            return;
        }

        const meResult = await readJSON(
            meResponse,
            "The server returned an invalid authentication response."
        );

        const currentUser = meResult.user || {};
        const role = currentUser.role;
        const roleName = roles[role];
        const roleRules = rules[role];

        if (!roleName || !roleRules) {
            showMessage("This profile type is not configured.", "error");
            return;
        }

        selectedRole.textContent = roleName;
        roleInitial.textContent = roleName.charAt(0);
        profileTitle.textContent = "Complete / Update Your Profile";

        /* -------------------------------------------------------------
         * 2. Load existing profile.
         * ------------------------------------------------------------- */
        const profileResponse = await fetch("/api/profile", {
            credentials: "same-origin"
        });

        if (!profileResponse.ok) {
            const result = await readJSON(
                profileResponse,
                "Unable to load your profile."
            );

            throw new Error(
                result.message || "Unable to load your profile."
            );
        }

        const profileResult = await readJSON(
            profileResponse,
            "The server returned an invalid profile response."
        );

        const profile = profileResult.profile || {};
        const accountEmail = profileResult.user?.email || currentUser.email || "";

        /* -------------------------------------------------------------
         * 3. Load only the reference data required by the role.
         * ------------------------------------------------------------- */
        let divisions = [];
        let zones = [];
        let wards = [];

        const needsReferenceData =
            roleRules.requiresDivision ||
            roleRules.requiresZone ||
            roleRules.requiresWard;

        if (needsReferenceData) {
            const referenceResponse = await fetch(
                "/api/profile/reference-data",
                {
                    credentials: "same-origin"
                }
            );

            if (!referenceResponse.ok) {
                const result = await readJSON(
                    referenceResponse,
                    "Unable to load profile reference data."
                );

                throw new Error(
                    result.message ||
                    "Unable to load profile reference data."
                );
            }

            const referenceResult = await readJSON(
                referenceResponse,
                "The server returned invalid profile reference data."
            );

            divisions = Array.isArray(referenceResult.divisions)
                ? referenceResult.divisions
                : [];

            zones = Array.isArray(referenceResult.zones)
                ? referenceResult.zones
                : [];

            wards = Array.isArray(referenceResult.wards)
                ? referenceResult.wards
                : [];
        }

        const sections = [];

        /* -------------------------------------------------------------
         * 4. Account information.
         * ------------------------------------------------------------- */
        sections.push(
            sectionHTML(
                "Account Information",
                "Your login email is linked to this account and cannot be changed here.",
                fieldHTML({
                    label: "Official Email",
                    name: "official_email",
                    type: "email",
                    value: accountEmail,
                    required: true,
                    readonly: true
                })
            )
        );

        /* -------------------------------------------------------------
         * 5. Personal / official information.
         * ------------------------------------------------------------- */
        const personalFields = [
            fieldHTML({
                label: "Full Name",
                name: "full_name",
                value: valueOrEmpty(profile.full_name),
                required: true,
                placeholder: "Enter your full name"
            }),

            fieldHTML({
                label: "Mobile Number",
                name: "mobile_number",
                type: "tel",
                value: valueOrEmpty(profile.mobile_number),
                required: true,
                placeholder: "Enter 10-digit mobile number",
                pattern: "[0-9]{10}"
            })
        ];

        if (roleRules.requiresEmployeeId) {
            personalFields.push(
                fieldHTML({
                    label: "Employee ID",
                    name: "employee_id",
                    value: valueOrEmpty(profile.employee_id),
                    required: true,
                    placeholder: "Enter employee ID"
                })
            );
        }

        if (role !== "citizen") {
            personalFields.push(
                selectHTML({
                    label: "Department",
                    name: "department",
                    required: false,
                    options: departmentOptions[role] || [],
                    selectedValue: valueOrEmpty(profile.department),
                    placeholder: "Select Department"
                }),

                selectHTML({
                    label: "Designation",
                    name: "designation",
                    required: false,
                    options: designationOptions[role] || [],
                    selectedValue: valueOrEmpty(profile.designation),
                    placeholder: "Select Designation"
                })
            );
        }

        sections.push(
            sectionHTML(
                role === "citizen"
                    ? "Personal Information"
                    : "Official Information",
                role === "citizen"
                    ? "Enter your personal contact information."
                    : "Enter the official details associated with your municipal role.",
                personalFields.join("")
            )
        );

        /* -------------------------------------------------------------
         * 6. Operational scope.
         * ------------------------------------------------------------- */
        if (role === "assistant_commissioner") {
            const existingDivisionId = valueOrEmpty(profile.division_id);

            if (existingDivisionId) {
                const existingDivision = divisions.find(
                    division => String(division.id) === String(existingDivisionId)
                );

                sections.push(
                    sectionHTML(
                        "Assigned Division",
                        "Your division has already been assigned. It cannot be changed from this profile page.",
                        fieldHTML({
                            label: "Assigned Division",
                            name: "assigned_division_display",
                            value: existingDivision
                                ? `${existingDivision.code} - ${existingDivision.name}`
                                : (profile.division?.name || "Assigned Division"),
                            readonly: true,
                            fullWidth: true
                        })
                    )
                );
            } else {
                sections.push(
                    sectionHTML(
                        "Operational Assignment",
                        "Select the single municipal division supervised by this Assistant Commissioner.",
                        selectHTML({
                            label: "Assigned Division",
                            name: "division_id",
                            required: true,
                            options: divisions.map(division => ({
                                value: division.id,
                                label: `${division.code} - ${division.name}`
                            })),
                            selectedValue: "",
                            placeholder: "Select Assigned Division"
                        })
                    )
                );
            }
        }

        if (role === "sanitary_inspector") {
            const divisionName =
                profile.division?.name ||
                profile.division_name ||
                "";

            const wardName =
                profile.assigned_ward ||
                profile.ward?.name ||
                "";

            const scopeAssigned =
                Boolean(profile.division_id && profile.ward_id);

            sections.push(
                sectionHTML(
                    "Operational Assignment",
                    scopeAssigned
                        ? "Your jurisdiction is controlled by the Assistant Commissioner. You cannot change it here."
                        : "Your jurisdiction has not yet been assigned. Complete your personal information; the Assistant Commissioner will assign your Division and Ward.",
                    scopeInfoHTML({
                        title: "Inspector Scope",
                        description: "Complete your personal profile first. Dashboard access will become available after your jurisdiction is assigned.",
                        divisionName,
                        wardName,
                        pending: !scopeAssigned
                    })
                )
            );
        }

        if (role === "citizen" || role === "driver") {
            const assignmentFields = [];

            if (roleRules.requiresZone) {
                assignmentFields.push(
                    selectHTML({
                        label: "Assigned Zone",
                        name: "zone_id",
                        required: true,
                        options: zones.map(zone => ({
                            value: zone.id,
                            label: `${zone.code} - ${zone.name}`
                        })),
                        selectedValue: valueOrEmpty(profile.zone_id),
                        placeholder: "Select Assigned Zone"
                    })
                );
            }

            if (roleRules.requiresWard) {
                assignmentFields.push(
                    selectHTML({
                        label: "Assigned Ward",
                        name: "ward_id",
                        required: true,
                        options: [],
                        selectedValue: valueOrEmpty(profile.ward_id),
                        placeholder: "Select Assigned Ward"
                    })
                );
            }

            sections.push(
                sectionHTML(
                    role === "citizen"
                        ? "Location Information"
                        : "Operational Assignment",
                    role === "citizen"
                        ? "Select the municipal service area connected to your account."
                        : "Select the zone and ward used by the Driver profile.",
                    assignmentFields.join("")
                )
            );
        }

        /* -------------------------------------------------------------
         * 7. Working information.
         * ------------------------------------------------------------- */
        if (role !== "citizen") {
            sections.push(
                sectionHTML(
                    "Work Information",
                    "Maintain the contact and workplace information used by the system.",
                    [
                        fieldHTML({
                            label: "Office Location",
                            name: "office_location",
                            value: valueOrEmpty(profile.office_location),
                            placeholder: "Enter office location",
                            fullWidth: true
                        }),

                        selectHTML({
                            label: "Working Shift",
                            name: "working_shift",
                            required: false,
                            options: shiftOptions,
                            selectedValue: valueOrEmpty(profile.working_shift),
                            placeholder: "Select Working Shift"
                        }),

                        fieldHTML({
                            label: "Official Contact Number",
                            name: "official_contact_number",
                            type: "tel",
                            value: valueOrEmpty(profile.official_contact_number),
                            placeholder: "Optional 10-digit contact number",
                            pattern: "[0-9]{10}"
                        })
                    ].join("")
                )
            );
        }

        /* -------------------------------------------------------------
         * 8. Driver-specific information.
         * ------------------------------------------------------------- */
        if (roleRules.driverFields) {
            sections.push(
                sectionHTML(
                    "Driver Information",
                    "Enter the driving information used for route assignment.",
                    [
                        fieldHTML({
                            label: "Driving License Number",
                            name: "license_number",
                            value: valueOrEmpty(profile.license_number),
                            required: true,
                            placeholder: "Enter license number"
                        }),

                        selectHTML({
                            label: "License Type",
                            name: "license_type",
                            required: true,
                            options: licenseTypeOptions,
                            selectedValue: valueOrEmpty(profile.license_type),
                            placeholder: "Select License Type"
                        }),

                        fieldHTML({
                            label: "Assigned Vehicle Number",
                            name: "vehicle_number",
                            value: valueOrEmpty(profile.vehicle_number),
                            placeholder: "Example: TRK-024"
                        })
                    ].join("")
                )
            );
        }

        /* -------------------------------------------------------------
         * 9. Address and preferences.
         * ------------------------------------------------------------- */
        const additionalFields = [
            fieldHTML({
                label: "Address",
                name: "address",
                value: valueOrEmpty(profile.address),
                required: role === "citizen",
                placeholder: "Enter your address",
                fullWidth: true
            }),

            fieldHTML({
                label: "City",
                name: "city",
                value: valueOrEmpty(profile.city),
                required: role === "citizen",
                placeholder: "Enter city"
            }),

            selectHTML({
                label: "Preferred Language",
                name: "preferred_language",
                required: false,
                options: languageOptions,
                selectedValue: valueOrEmpty(profile.preferred_language),
                placeholder: "Select Language"
            }),

            selectHTML({
                label: "Notification Preference",
                name: "notification_preference",
                required: false,
                options: notificationOptions,
                selectedValue: valueOrEmpty(profile.notification_preference),
                placeholder: "Select Preference"
            })
        ];

        sections.push(
            sectionHTML(
                "Additional Information",
                "Keep your contact and notification preferences current.",
                additionalFields.join("")
            )
        );

        fieldsContainer.innerHTML = sections.join("");

        /* -------------------------------------------------------------
         * 10. Legacy Zone -> Ward dependency for Driver/Citizen only.
         * ------------------------------------------------------------- */
        const zoneSelect = document.getElementById("zone_id");
        const wardSelect = document.getElementById("ward_id");

        function populateWards(selectedWardId = "") {
            if (!wardSelect) {
                return;
            }

            const selectedZoneId = Number(zoneSelect?.value || 0);

            const filteredWards = wards
                .filter(ward => Number(ward.zone_id) === selectedZoneId)
                .map(ward => ({
                    value: ward.id,
                    label: `Ward ${ward.number} - ${ward.name}`
                }));

            setSelectOptions(
                wardSelect,
                filteredWards,
                "Select Assigned Ward",
                selectedWardId
            );
        }

        if (zoneSelect && wardSelect) {
            zoneSelect.addEventListener("change", () => {
                populateWards("");
            });

            populateWards(valueOrEmpty(profile.ward_id));
        }

        /* -------------------------------------------------------------
         * 11. Role-specific guidance.
         * ------------------------------------------------------------- */
        if (role === "deputy_commissioner") {
            showMessage(
                "Deputy Commissioner accounts use city-wide scope; division, zone and ward assignment are not required.",
                "info"
            );
        } else if (
            role === "sanitary_inspector" &&
            !(profile.division_id && profile.ward_id)
        ) {
            showMessage(
                "Personal profile information can be saved now. Your operational dashboard will become available after the Assistant Commissioner assigns your Division and Ward.",
                "info"
            );
        } else if (
            role === "assistant_commissioner" &&
            profile.division_id
        ) {
            showMessage(
                "Your assigned division is controlled by the supervisory scope system and cannot be changed here.",
                "info"
            );
        }

        /* -------------------------------------------------------------
         * 12. Back button.
         * ------------------------------------------------------------- */
        backButton?.addEventListener("click", () => {
            window.location.replace("/login");
        });

        /* -------------------------------------------------------------
         * 13. Save profile.
         * ------------------------------------------------------------- */
        form.addEventListener("submit", async event => {
            event.preventDefault();
            showMessage("");

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            submitButton.disabled = true;
            submitText.textContent = "Saving...";

            const data = Object.fromEntries(
                new FormData(form).entries()
            );

            /*
             * Email is display-only. The backend uses users.email from
             * the authenticated session.
             */
            delete data.official_email;

            /*
             * Scope fields displayed to the Inspector are deliberately not
             * part of FormData, because they are plain read-only fields.
             * For an already provisioned Assistant Commissioner the assigned
             * division is also display-only, so the existing backend scope is
             * preserved automatically.
             */

            try {
                const response = await fetch("/api/profile", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify(data)
                });

                const result = await readJSON(
                    response,
                    "The server returned an invalid response."
                );

                if (!response.ok || !result.success) {
                    throw new Error(
                        result.message || "Unable to save profile."
                    );
                }

                showMessage(
                    result.message || "Profile saved successfully.",
                    "success"
                );

                submitText.textContent = "Saved";

                /*
                 * An Inspector may enter the operational dashboard only when
                 * the Assistant Commissioner has already assigned a complete
                 * division + ward scope. A personal profile save without that
                 * assignment therefore stays on this page.
                 */
                if (Boolean(result.profileComplete)) {
                    const dashboardPathByRole = {
                        assistant_commissioner: "/assistantDash/",
                        sanitary_inspector: "/inspectorDash/"
                    };

                    const dashboardPath =
                        dashboardPathByRole[role];

                    if (dashboardPath) {
                        window.setTimeout(() => {
                            window.location.replace(
                                dashboardPath
                            );
                        }, 700);

                        return;
                    }
                }

                submitButton.disabled = false;
                submitText.textContent = "Save Profile";

            } catch (error) {
                console.error("Profile save error:", error);

                showMessage(
                    error?.message || "Unable to save profile.",
                    "error"
                );

                submitButton.disabled = false;
                submitText.textContent = "Save Profile";
            }
        });

    } catch (error) {
        console.error("Profile page error:", error);

        showMessage(
            error?.message ||
            "Unable to initialize the profile page.",
            "error"
        );

        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

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

    const rules = {
        citizen: {
            requiresEmployeeId: false,
            requiresZone: true,
            requiresWard: true,
            driverFields: false
        },

        driver: {
            requiresEmployeeId: true,
            requiresZone: true,
            requiresWard: true,
            driverFields: true
        },

        sanitary_inspector: {
            requiresEmployeeId: true,
            requiresZone: true,
            requiresWard: true,
            driverFields: false
        },

        assistant_commissioner: {
            requiresEmployeeId: true,
            requiresZone: true,
            requiresWard: false,
            driverFields: false
        },

        deputy_commissioner: {
            requiresEmployeeId: true,
            requiresZone: false,
            requiresWard: false,
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

        message.className =
            `profile-message show ${type}`.trim();
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
        placeholder = "Select"
    }) {
        const star = required
            ? '<span class="required">*</span>'
            : "";

        const optionHTML = options.map(option => {
            const value =
                typeof option === "object"
                    ? option.value
                    : option;

            const text =
                typeof option === "object"
                    ? option.label
                    : option;

            const selected =
                String(value) === String(selectedValue)
                    ? "selected"
                    : "";

            return `
                <option
                    value="${escapeHTML(value)}"
                    ${selected}
                >
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
                >
                    <option value="">
                        ${escapeHTML(placeholder)}
                    </option>

                    ${optionHTML}
                </select>
            </div>
        `;
    }


    function sectionHTML(
        title,
        description,
        fieldMarkup
    ) {
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


    function setSelectOptions(
        select,
        options,
        placeholder,
        selectedValue = ""
    ) {
        if (!select) {
            return;
        }

        select.innerHTML = "";

        const placeholderOption =
            document.createElement("option");

        placeholderOption.value = "";
        placeholderOption.textContent =
            placeholder;

        select.appendChild(
            placeholderOption
        );

        options.forEach(optionData => {
            const option =
                document.createElement("option");

            option.value =
                String(optionData.value);

            option.textContent =
                optionData.label;

            if (
                String(optionData.value) ===
                String(selectedValue)
            ) {
                option.selected = true;
            }

            select.appendChild(option);
        });
    }


    function valueOrEmpty(value) {
        return value === null ||
            value === undefined
            ? ""
            : String(value);
    }


    if (!form || !fieldsContainer) {
        return;
    }


    try {
        /*
         * -------------------------------------------------------------
         * 1. Verify authentication.
         * -------------------------------------------------------------
         */
        const meResponse = await fetch(
            "/api/auth/me",
            {
                credentials: "same-origin"
            }
        );

        if (!meResponse.ok) {
            window.location.href = "/login";
            return;
        }

        let meResult;

        try {
            meResult = await meResponse.json();
        } catch (_) {
            showMessage(
                "The server returned an invalid authentication response.",
                "error"
            );
            return;
        }

        const currentUser =
            meResult.user || {};

        const role =
            currentUser.role;

        const roleName =
            roles[role];

        const roleRules =
            rules[role];


        if (!roleName || !roleRules) {
            showMessage(
                "This profile type is not configured.",
                "error"
            );
            return;
        }


        selectedRole.textContent =
            roleName;

        roleInitial.textContent =
            roleName.charAt(0);

        profileTitle.textContent =
            "Complete / Update Your Profile";

        profileSubtitle.textContent =
            "Enter your details once. They will be saved to your account and loaded again on future logins.";


        /*
         * -------------------------------------------------------------
         * 2. Load existing profile.
         *
         * A missing profile is valid. The form simply remains empty.
         * -------------------------------------------------------------
         */
        const profileResponse =
            await fetch(
                "/api/profile",
                {
                    credentials: "same-origin"
                }
            );

        if (!profileResponse.ok) {
            showMessage(
                "Unable to load your profile.",
                "error"
            );
            return;
        }

        let profileResult;

        try {
            profileResult =
                await profileResponse.json();
        } catch (_) {
            showMessage(
                "The server returned an invalid profile response.",
                "error"
            );
            return;
        }

        const profile =
            profileResult.profile || {};

        const accountEmail =
            profileResult.user?.email ||
            currentUser.email ||
            "";


        /*
         * -------------------------------------------------------------
         * 3. Load zones and wards only when the role needs them.
         * -------------------------------------------------------------
         */
        let zones = [];
        let wards = [];

        if (
            roleRules.requiresZone ||
            roleRules.requiresWard
        ) {
            const referenceResponse =
                await fetch(
                    "/api/profile/reference-data",
                    {
                        credentials: "same-origin"
                    }
                );

            if (!referenceResponse.ok) {
                showMessage(
                    "Unable to load zone and ward data.",
                    "error"
                );
                return;
            }

            let referenceResult;

            try {
                referenceResult =
                    await referenceResponse.json();
            } catch (_) {
                showMessage(
                    "The server returned invalid zone and ward data.",
                    "error"
                );
                return;
            }

            zones =
                referenceResult.zones || [];

            wards =
                referenceResult.wards || [];
        }


        /*
         * -------------------------------------------------------------
         * 4. Account information.
         * -------------------------------------------------------------
         */
        const sections = [];

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


        /*
         * -------------------------------------------------------------
         * 5. Personal / official information.
         * -------------------------------------------------------------
         */
        const personalFields = [
            fieldHTML({
                label: "Full Name",
                name: "full_name",
                value: valueOrEmpty(
                    profile.full_name
                ),
                required: true,
                placeholder: "Enter your full name"
            }),

            fieldHTML({
                label: "Mobile Number",
                name: "mobile_number",
                type: "tel",
                value: valueOrEmpty(
                    profile.mobile_number
                ),
                required: true,
                placeholder: "Enter 10-digit mobile number",
                pattern: "[0-9]{10}"
            })
        ];


        if (
            roleRules.requiresEmployeeId
        ) {
            personalFields.push(
                fieldHTML({
                    label: "Employee ID",
                    name: "employee_id",
                    value: valueOrEmpty(
                        profile.employee_id
                    ),
                    required: true,
                    placeholder: "Enter employee ID"
                })
            );
        }


        if (
            role !== "citizen"
        ) {
            personalFields.push(
                selectHTML({
                    label: "Department",
                    name: "department",
                    required: false,
                    options:
                        departmentOptions[role] ||
                        [],
                    selectedValue:
                        valueOrEmpty(
                            profile.department
                        ),
                    placeholder:
                        "Select Department"
                }),

                selectHTML({
                    label: "Designation",
                    name: "designation",
                    required: false,
                    options:
                        designationOptions[role] ||
                        [],
                    selectedValue:
                        valueOrEmpty(
                            profile.designation
                        ),
                    placeholder:
                        "Select Designation"
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


        /*
         * -------------------------------------------------------------
         * 6. Zone / ward assignment.
         * -------------------------------------------------------------
         */
        if (
            roleRules.requiresZone ||
            roleRules.requiresWard
        ) {
            const assignmentFields = [];


            if (roleRules.requiresZone) {
                assignmentFields.push(
                    selectHTML({
                        label: "Assigned Zone",
                        name: "zone_id",
                        required: true,
                        options: zones.map(zone => ({
                            value: zone.id,
                            label:
                                `${zone.code} - ${zone.name}`
                        })),
                        selectedValue:
                            valueOrEmpty(
                                profile.zone_id
                            ),
                        placeholder:
                            "Select Assigned Zone"
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
                        selectedValue:
                            valueOrEmpty(
                                profile.ward_id
                            ),
                        placeholder:
                            "Select Assigned Ward"
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
                        : "Select the zone and ward that define your operational scope.",

                    assignmentFields.join("")
                )
            );
        }


        /*
         * -------------------------------------------------------------
         * 7. Working information.
         * -------------------------------------------------------------
         */
        if (role !== "citizen") {
            sections.push(
                sectionHTML(
                    "Work Information",
                    "Maintain the contact and workplace information used by the system.",

                    [
                        fieldHTML({
                            label: "Office Location",
                            name: "office_location",
                            value: valueOrEmpty(
                                profile.office_location
                            ),
                            placeholder:
                                "Enter office location",
                            fullWidth: true
                        }),

                        selectHTML({
                            label: "Working Shift",
                            name: "working_shift",
                            required: false,
                            options:
                                shiftOptions,
                            selectedValue:
                                valueOrEmpty(
                                    profile.working_shift
                                ),
                            placeholder:
                                "Select Working Shift"
                        }),

                        fieldHTML({
                            label: "Official Contact Number",
                            name:
                                "official_contact_number",
                            type: "tel",
                            value: valueOrEmpty(
                                profile.official_contact_number
                            ),
                            placeholder:
                                "Optional 10-digit contact number",
                            pattern:
                                "[0-9]{10}"
                        })
                    ].join("")
                )
            );
        }


        /*
         * -------------------------------------------------------------
         * 8. Driver-specific information.
         * -------------------------------------------------------------
         */
        if (
            roleRules.driverFields
        ) {
            sections.push(
                sectionHTML(
                    "Driver Information",
                    "Enter the driving information used for route assignment.",

                    [
                        fieldHTML({
                            label:
                                "Driving License Number",
                            name:
                                "license_number",
                            value:
                                valueOrEmpty(
                                    profile.license_number
                                ),
                            required: true,
                            placeholder:
                                "Enter license number"
                        }),

                        selectHTML({
                            label:
                                "License Type",
                            name:
                                "license_type",
                            required: true,
                            options:
                                licenseTypeOptions,
                            selectedValue:
                                valueOrEmpty(
                                    profile.license_type
                                ),
                            placeholder:
                                "Select License Type"
                        }),

                        fieldHTML({
                            label:
                                "Assigned Vehicle Number",
                            name:
                                "vehicle_number",
                            value:
                                valueOrEmpty(
                                    profile.vehicle_number
                                ),
                            placeholder:
                                "Example: TRK-024"
                        })
                    ].join("")
                )
            );
        }


        /*
         * -------------------------------------------------------------
         * 9. Address and preferences.
         * -------------------------------------------------------------
         */
        const additionalFields = [];


        if (role === "citizen") {
            additionalFields.push(
                fieldHTML({
                    label: "Address",
                    name: "address",
                    value:
                        valueOrEmpty(
                            profile.address
                        ),
                    required: true,
                    placeholder:
                        "Enter your address",
                    fullWidth: true
                })
            );
        } else {
            additionalFields.push(
                fieldHTML({
                    label: "Address",
                    name: "address",
                    value:
                        valueOrEmpty(
                            profile.address
                        ),
                    placeholder:
                        "Enter your address",
                    fullWidth: true
                })
            );
        }


        additionalFields.push(
            fieldHTML({
                label: "City",
                name: "city",
                value:
                    valueOrEmpty(
                        profile.city
                    ),
                required:
                    role === "citizen",
                placeholder:
                    "Enter city"
            }),

            selectHTML({
                label: "Preferred Language",
                name:
                    "preferred_language",
                required: false,
                options:
                    languageOptions,
                selectedValue:
                    valueOrEmpty(
                        profile.preferred_language
                    ),
                placeholder:
                    "Select Language"
            }),

            selectHTML({
                label:
                    "Notification Preference",
                name:
                    "notification_preference",
                required: false,
                options:
                    notificationOptions,
                selectedValue:
                    valueOrEmpty(
                        profile.notification_preference
                    ),
                placeholder:
                    "Select Preference"
            })
        );


        sections.push(
            sectionHTML(
                "Additional Information",
                "Keep your contact and notification preferences current.",

                additionalFields.join("")
            )
        );


        fieldsContainer.innerHTML =
            sections.join("");


        /*
         * -------------------------------------------------------------
         * 10. Zone → Ward dependency.
         *
         * A ward is only shown when it belongs to the selected zone.
         * -------------------------------------------------------------
         */
        const zoneSelect =
            document.getElementById(
                "zone_id"
            );

        const wardSelect =
            document.getElementById(
                "ward_id"
            );


        function populateWards(
            selectedWardId = ""
        ) {
            if (!wardSelect) {
                return;
            }

            const selectedZoneId =
                Number(
                    zoneSelect?.value || 0
                );

            const filteredWards =
                wards
                    .filter(
                        ward =>
                            Number(
                                ward.zone_id
                            ) ===
                            selectedZoneId
                    )
                    .map(
                        ward => ({
                            value:
                                ward.id,

                            label:
                                `Ward ${ward.number} - ${ward.name}`
                        })
                    );


            setSelectOptions(
                wardSelect,
                filteredWards,
                "Select Assigned Ward",
                selectedWardId
            );
        }


        if (zoneSelect) {
            zoneSelect.addEventListener(
                "change",
                () => populateWards("")
            );
        }


        if (wardSelect) {
            populateWards(
                valueOrEmpty(
                    profile.ward_id
                )
            );
        }


        /*
         * -------------------------------------------------------------
         * 11. Special message for city-wide role.
         * -------------------------------------------------------------
         */
        if (
            role === "deputy_commissioner"
        ) {
            showMessage(
                "Deputy Commissioner accounts use city-wide scope; zone and ward assignment are not required.",
                "info"
            );
        }


        /*
         * -------------------------------------------------------------
         * 12. Back button.
         * -------------------------------------------------------------
         */
        backButton?.addEventListener(
            "click",
            () => {
                window.location.replace(
                    "/login"
                );
            }
        );


        /*
         * -------------------------------------------------------------
         * 13. Save profile.
         * -------------------------------------------------------------
         */
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                showMessage("");

                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }


                submitButton.disabled =
                    true;

                submitText.textContent =
                    "Saving...";


                const data =
                    Object.fromEntries(
                        new FormData(form).entries()
                    );


                /*
                 * The email displayed on the form is informational only.
                 * The server takes the real email from users.
                 */
                delete data.official_email;


                try {
                    const response =
                        await fetch(
                            "/api/profile",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                credentials:
                                    "same-origin",

                                body:
                                    JSON.stringify(
                                        data
                                    )
                            }
                        );


                    let result;

                    try {
                        result = await response.json();
                    } catch (_) {
                        throw new Error(
                            "The server returned an invalid response."
                        );
                    }


                    if (
                        !response.ok ||
                        !result.success
                    ) {
                        throw new Error(
                            result.message ||
                            "Unable to save profile."
                        );
                    }


                    showMessage(
                        "Profile saved successfully.",
                        "success"
                    );

                    submitText.textContent =
                        "Saved";


                    /*
                     * The Inspector Dashboard uses the new lowercase
                     * folder/page name selected for this project.
                     */
                    if (
                        role ===
                        "sanitary_inspector"
                    ) {
                        window.setTimeout(
                            () => {
                                window.location.replace(
                                    "/inspectorDash"
                                );
                            },
                            700
                        );

                        return;
                    }


                    /*
                     * No separate role dashboard is being introduced
                     * at this stage. Other roles remain on the profile
                     * page after saving.
                     */
                    submitButton.disabled =
                        false;

                    submitText.textContent =
                        "Save Profile";

                } catch (error) {
                    console.error(
                        "Profile save error:",
                        error
                    );

                    showMessage(
                        error.message ||
                        "Unable to save profile.",
                        "error"
                    );

                    submitButton.disabled =
                        false;

                    submitText.textContent =
                        "Save Profile";
                }
            }
        );

    } catch (error) {
        console.error(
            "Profile page error:",
            error
        );

        showMessage(
            "Unable to initialize the profile page.",
            "error"
        );

        if (submitButton) {
            submitButton.disabled =
                false;
        }
    }
});

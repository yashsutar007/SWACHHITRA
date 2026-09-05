// ===============================
// GET LOGIN DATA
// ===============================

const selectedRole =
    sessionStorage.getItem(
        "swachhitraRole"
    );


const userEmail =
    sessionStorage.getItem(
        "swachhitraEmail"
    );


// Prevent direct access

if (!selectedRole) {

    window.location.href =
        "/login/login.html";

}


// ===============================
// ELEMENTS
// ===============================

const profileForm =
    document.getElementById(
        "profileForm"
    );


const profileFields =
    document.getElementById(
        "profileFields"
    );


const selectedRoleElement =
    document.getElementById(
        "selectedRole"
    );


const profileTitle =
    document.getElementById(
        "profileTitle"
    );


const profileSubtitle =
    document.getElementById(
        "profileSubtitle"
    );


const roleInitial =
    document.getElementById(
        "roleInitial"
    );


const profileMessage =
    document.getElementById(
        "profileMessage"
    );


const backButton =
    document.getElementById(
        "backButton"
    );


const submitButton =
    document.getElementById(
        "submitButton"
    );


const submitText =
    document.getElementById(
        "submitText"
    );


// ===============================
// ROLE INFORMATION
// ===============================

const roleNames = {

    citizen:
        "Citizen",

    driver:
        "Driver",

    sanitary_inspector:
        "Sanitary Inspector",

    assistant_commissioner:
        "Assistant Commissioner",

    deputy_commissioner:
        "Deputy Commissioner (Health)"

};


const roleName =
    roleNames[selectedRole] ||
    "User";


selectedRoleElement.textContent =
    roleName;


roleInitial.textContent =
    roleName.charAt(0).toUpperCase();


// ===============================
// HELPER FUNCTIONS
// ===============================

function createSection(
    title,
    description,
    fields
) {

    return `

        <section class="form-section">

            <div class="section-heading">

                <h3>
                    ${title}
                </h3>

                <p>
                    ${description}
                </p>

            </div>


            <div class="profile-fields">

                ${fields.join("")}

            </div>

        </section>

    `;

}


function createInput(
    label,
    id,
    type = "text",
    required = true,
    fullWidth = false,
    value = "",
    placeholder = "",
    extraAttributes = ""
) {

    return `

        <div
            class="field
            ${fullWidth ? "full-width" : ""}"
        >

            <label for="${id}">

                ${label}

                ${
                    required
                        ? '<span class="required">*</span>'
                        : ""
                }

            </label>


            <input
                type="${type}"
                id="${id}"
                name="${id}"
                value="${value}"
                placeholder="${placeholder}"
                ${required ? "required" : ""}
                ${extraAttributes}
            >

        </div>

    `;

}


function createSelect(
    label,
    id,
    options,
    required = true,
    fullWidth = false
) {

    let optionHTML =
        `<option value="">
            Select ${label}
        </option>`;


    options.forEach(
        (option) => {

            optionHTML += `

                <option value="${option}">

                    ${option}

                </option>

            `;

        }
    );


    return `

        <div
            class="field
            ${fullWidth ? "full-width" : ""}"
        >

            <label for="${id}">

                ${label}

                ${
                    required
                        ? '<span class="required">*</span>'
                        : ""
                }

            </label>


            <select
                id="${id}"
                name="${id}"
                ${required ? "required" : ""}
            >

                ${optionHTML}

            </select>

        </div>

    `;

}


function createTextarea(
    label,
    id,
    required = false,
    placeholder = ""
) {

    return `

        <div class="field full-width">

            <label for="${id}">

                ${label}

                ${
                    required
                        ? '<span class="required">*</span>'
                        : ""
                }

            </label>


            <textarea
                id="${id}"
                name="${id}"
                placeholder="${placeholder}"
                ${required ? "required" : ""}
            ></textarea>

        </div>

    `;

}


// ===============================
// WARD OPTIONS
// ===============================

const wards = [

    "Ward 1",
    "Ward 2",
    "Ward 3",
    "Ward 4",
    "Ward 5"

];


// ===============================
// CITIZEN PROFILE
// ===============================

function citizenProfile() {

    profileTitle.textContent =
        "Create your profile";


    profileSubtitle.textContent =
        "Add your residential details to receive waste collection updates, schedules and municipal services.";


    profileFields.innerHTML =

        createSection(

            "Personal Information",

            "Tell us the basic information required for your citizen account.",

            [

                createInput(
                    "Full Name",
                    "fullName",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your full name",
                    'autocomplete="name"'
                ),

                createInput(
                    "Mobile Number",
                    "mobile",
                    "tel",
                    true,
                    false,
                    "",
                    "Enter 10-digit mobile number",
                    'inputmode="numeric" pattern="[0-9]{10}" autocomplete="tel"'
                ),

                createInput(
                    "Email Address",
                    "email",
                    "email",
                    true,
                    true,
                    userEmail || "",
                    "",
                    'readonly autocomplete="email"'
                )

            ]

        )

        +

        createSection(

            "Residential Information",

            "This information helps SWACHHITRA connect you with your local waste collection services.",

            [

                createInput(
                    "House / Flat Number",
                    "houseNumber",
                    "text",
                    true,
                    false,
                    "",
                    "Example: A-204"
                ),

                createInput(
                    "Area / Locality",
                    "area",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your area or locality"
                ),

                createTextarea(
                    "Complete Address",
                    "address",
                    true,
                    "Enter your complete residential address"
                ),

                createSelect(
                    "Ward",
                    "ward",
                    wards
                ),

                createInput(
                    "PIN Code",
                    "pincode",
                    "text",
                    true,
                    false,
                    "",
                    "Enter PIN code",
                    'inputmode="numeric" pattern="[0-9]{6}" autocomplete="postal-code"'
                )

            ]

        );

}


// ===============================
// DRIVER PROFILE
// ===============================

function driverProfile() {

    profileTitle.textContent =
        "Create your driver profile";


    profileSubtitle.textContent =
        "Provide your contact and driving details to access route and collection operations.";


    profileFields.innerHTML =

        createSection(

            "Personal Information",

            "Basic information required for your driver account.",

            [

                createInput(
                    "Full Name",
                    "fullName",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your full name"
                ),

                createInput(
                    "Mobile Number",
                    "mobile",
                    "tel",
                    true,
                    false,
                    "",
                    "Enter 10-digit mobile number",
                    'inputmode="numeric" pattern="[0-9]{10}"'
                ),

                createInput(
                    "Email Address",
                    "email",
                    "email",
                    true,
                    true,
                    userEmail || "",
                    "",
                    'readonly autocomplete="email"'
                )

            ]

        )

        +

        createSection(

            "Driving Information",

            "Information required for operational vehicle and route management.",

            [

                createInput(
                    "Driving License Number",
                    "licenseNumber",
                    "text",
                    true,
                    false,
                    "",
                    "Enter license number"
                ),

                createSelect(
                    "License Category",
                    "licenseCategory",

                    [
                        "LMV",
                        "HMV",
                        "Commercial Vehicle"
                    ]

                ),

                createInput(
                    "Assigned Vehicle Number",
                    "vehicleNumber",
                    "text",
                    false,
                    false,
                    "",
                    "Optional"
                )

            ]

        );

}


// ===============================
// SANITARY INSPECTOR PROFILE
// ===============================

function inspectorProfile() {

    profileTitle.textContent =
        "Create inspector profile";


    profileSubtitle.textContent =
        "Provide your contact and operational information for ward-level monitoring and management.";


    profileFields.innerHTML =

        createSection(

            "Personal Information",

            "Basic information for your SWACHHITRA account.",

            [

                createInput(
                    "Full Name",
                    "fullName",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your full name"
                ),

                createInput(
                    "Mobile Number",
                    "mobile",
                    "tel",
                    true,
                    false,
                    "",
                    "Enter 10-digit mobile number",
                    'inputmode="numeric" pattern="[0-9]{10}"'
                ),

                createInput(
                    "Official Email",
                    "email",
                    "email",
                    true,
                    true,
                    userEmail || "",
                    "",
                    'readonly autocomplete="email"'
                )

            ]

        )

        +

        createSection(

            "Operational Information",

            "Used to configure your assigned area and responsibilities.",

            [

                createSelect(
                    "Assigned Ward",
                    "assignedWard",
                    wards
                ),

                createInput(
                    "Department",
                    "department",
                    "text",
                    true,
                    false,
                    "",
                    "Example: Solid Waste Management"
                ),

                createInput(
                    "Office Location",
                    "officeLocation",
                    "text",
                    false,
                    false,
                    "",
                    "Optional"
                )

            ]

        );

}


// ===============================
// ASSISTANT COMMISSIONER PROFILE
// ===============================

function assistantCommissionerProfile() {

    profileTitle.textContent =
        "Create commissioner profile";


    profileSubtitle.textContent =
        "Add your administrative information to configure your operational access.";


    profileFields.innerHTML =

        createSection(

            "Personal Information",

            "Basic information for your official account.",

            [

                createInput(
                    "Full Name",
                    "fullName",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your full name"
                ),

                createInput(
                    "Mobile Number",
                    "mobile",
                    "tel",
                    true,
                    false,
                    "",
                    "Enter 10-digit mobile number",
                    'inputmode="numeric" pattern="[0-9]{10}"'
                ),

                createInput(
                    "Official Email",
                    "email",
                    "email",
                    true,
                    true,
                    userEmail || "",
                    "",
                    'readonly autocomplete="email"'
                )

            ]

        )

        +

        createSection(

            "Administrative Information",

            "Used to configure your assigned administrative area.",

            [

                createInput(
                    "Designation",
                    "designation",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your designation"
                ),

                createSelect(
                    "Assigned Zone",
                    "zone",

                    [
                        "North Zone",
                        "South Zone",
                        "East Zone",
                        "West Zone",
                        "Central Zone"
                    ]

                ),

                createInput(
                    "Office Location",
                    "officeLocation",
                    "text",
                    false,
                    false,
                    "",
                    "Optional"
                )

            ]

        );

}


// ===============================
// DEPUTY COMMISSIONER PROFILE
// ===============================

function deputyCommissionerProfile() {

    profileTitle.textContent =
        "Create deputy commissioner profile";


    profileSubtitle.textContent =
        "Provide the required administrative information to configure your SWACHHITRA access.";


    profileFields.innerHTML =

        createSection(

            "Personal Information",

            "Basic information for your official account.",

            [

                createInput(
                    "Full Name",
                    "fullName",
                    "text",
                    true,
                    false,
                    "",
                    "Enter your full name"
                ),

                createInput(
                    "Mobile Number",
                    "mobile",
                    "tel",
                    true,
                    false,
                    "",
                    "Enter 10-digit mobile number",
                    'inputmode="numeric" pattern="[0-9]{10}"'
                ),

                createInput(
                    "Official Email",
                    "email",
                    "email",
                    true,
                    true,
                    userEmail || "",
                    "",
                    'readonly autocomplete="email"'
                )

            ]

        )

        +

        createSection(

            "Administrative Information",

            "Used to configure administrative and departmental access.",

            [

                createInput(
                    "Department",
                    "department",
                    "text",
                    true,
                    false,
                    "",
                    "Example: Health Department"
                ),

                createInput(
                    "Designation",
                    "designation",
                    "text",
                    true,
                    false,
                    "",
                    "Enter official designation"
                ),

                createInput(
                    "Office Location",
                    "officeLocation",
                    "text",
                    true,
                    false,
                    "",
                    "Enter office location"
                )

            ]

        );

}


// ===============================
// RENDER CORRECT PROFILE
// ===============================

switch (selectedRole) {

    case "citizen":

        citizenProfile();

        break;


    case "driver":

        driverProfile();

        break;


    case "sanitary_inspector":

        inspectorProfile();

        break;


    case "assistant_commissioner":

        assistantCommissionerProfile();

        break;


    case "deputy_commissioner":

        deputyCommissionerProfile();

        break;


    default:

        window.location.href =
            "/login/login.html";

}


// ===============================
// SHOW MESSAGE
// ===============================

function showMessage(
    message,
    type
) {

    profileMessage.textContent =
        message;


    profileMessage.className =
        `profile-message show ${type}`;

}


// ===============================
// FORM SUBMISSION
// ===============================

profileForm.addEventListener(
    "submit",

    async (event) => {

        event.preventDefault();


        profileMessage.className =
            "profile-message";


        if (!profileForm.checkValidity()) {

            showMessage(
                "Please complete all required fields correctly.",
                "error"
            );


            profileForm.reportValidity();

            return;

        }


        const formData =
            new FormData(
                profileForm
            );


        const profileData =
            Object.fromEntries(
                formData.entries()
            );


        const finalProfileData = {

            role:
                selectedRole,

            ...profileData

        };


        // Temporary frontend storage

        sessionStorage.setItem(

            "swachhitraProfile",

            JSON.stringify(
                finalProfileData
            )

        );


        // Loading state

        submitButton.disabled =
            true;


        submitText.textContent =
            "Saving...";


        try {

            const response =
                await fetch(
                    "/api/profile",
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify(
                                finalProfileData
                            )

                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result.message ||
                    "Unable to save profile."
                );

            }


            showMessage(
                "Profile completed successfully.",
                "success"
            );


            console.log(
                "Profile Data:",
                finalProfileData
            );


            /*
            NEXT STEP:

            After creating the dashboards,
            redirect based on role.

            Example:

            if (selectedRole === "citizen") {
                window.location.href =
                    "/citizen/dashboard.html";
            }
            */

        }

        catch (error) {

            showMessage(
                error.message ||
                "Something went wrong. Please try again.",
                "error"
            );

        }

        finally {

            submitButton.disabled =
                false;


            submitText.textContent =
                "Complete Profile";

        }

    }

);


// ===============================
// BACK BUTTON
// ===============================

backButton.addEventListener(
    "click",

    () => {

        window.location.href =
            "/login/login.html";

    }

);

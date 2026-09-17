document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("profileForm");
  const fields = document.getElementById("profileFields");
  const selectedRole = document.getElementById("selectedRole");
  const roleInitial = document.getElementById("roleInitial");
  const message = document.getElementById("profileMessage");
  const submitButton = document.getElementById("submitButton");
  const submitText = document.getElementById("submitText");
  const backButton = document.getElementById("backButton");

  const escape = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const roles = {
    citizen: "Citizen",
    driver: "Driver",
    sanitary_inspector: "Sanitary Inspector",
    assistant_commissioner: "Assistant Commissioner",
    deputy_commissioner: "Deputy Commissioner (Health)"
  };

  const configs = {
    citizen: [
      ["Personal Information", [
        ["Full Name", "fullName", "text", true, "Enter your full name"],
        ["Mobile Number", "mobileNumber", "tel", true, "Enter your 10-digit mobile number", 'pattern="[0-9]{10}"'],
        ["Email Address", "officialEmail", "email", true, "", "readonly"],
        ["Address", "address", "text", true, "Enter your address"]
      ]],
      ["Location Information", [
        ["City", "city", "select", true, ["Mumbai", "Pune", "Nashik", "Nagpur", "Thane", "Other"]],
        ["Ward", "ward", "select", true, ["Ward 1", "Ward 2", "Ward 3", "Ward 4", "Ward 5", "Central Ward", "Other"]]
      ]],
      ["Preferences", [
        ["Preferred Language", "preferredLanguage", "select", true, ["English", "Hindi", "Marathi"]],
        ["Notification Preference", "notificationPreference", "select", true, ["SMS", "Email", "Both"]]
      ]]
    ],
    driver: [
      ["Driver Information", [
        ["Full Name", "fullName", "text", true, "Enter your full name"],
        ["Mobile Number", "mobileNumber", "tel", true, "Enter your 10-digit mobile number", 'pattern="[0-9]{10}"'],
        ["Official Email", "officialEmail", "email", true, "", "readonly"],
        ["Employee ID", "employeeId", "text", true, "Enter employee ID"],
        ["Driving License Number", "licenseNumber", "text", true, "Enter driving license number"],
        ["License Type", "licenseType", "select", true, ["LMV", "HMV", "Transport Vehicle"]]
      ]],
      ["Work Assignment", [
        ["Assigned Ward", "assignedWard", "text", true, "Enter assigned ward"],
        ["Department", "department", "select", true, ["Solid Waste Management", "Municipal Transport", "Sanitation Department"]],
        ["Assigned Vehicle Number", "vehicleNumber", "text", true, "Example: TRK-024"]
      ]]
    ],
    sanitary_inspector: [
      ["Inspector Information", [
        ["Full Name", "fullName", "text", true, "Enter your full name"],
        ["Mobile Number", "mobileNumber", "tel", true, "Enter your 10-digit mobile number", 'pattern="[0-9]{10}"'],
        ["Official Email", "officialEmail", "email", true, "", "readonly"],
        ["Employee ID", "employeeId", "text", true, "Enter employee ID"]
      ]],
      ["Administrative Information", [
        ["Assigned Ward", "assignedWard", "text", true, "Enter assigned ward"],
        ["Department", "department", "select", true, ["Solid Waste Management", "Sanitation Department", "Municipal Corporation"]],
        ["Zone", "zone", "select", true, ["Central Zone", "North Zone", "South Zone", "East Zone", "West Zone"]],
        ["Office Location", "officeLocation", "text", true, "Enter office location"]
      ]],
      ["Operational Information", [
        ["Working Shift", "workingShift", "select", true, ["Morning", "Afternoon", "Full Day"]],
        ["Official Contact Number", "officialContactNumber", "tel", false, "Optional contact number", 'pattern="[0-9]{10}"']
      ]]
    ],
    assistant_commissioner: [
      ["Official Information", [
        ["Full Name", "fullName", "text", true, "Enter your full name"],
        ["Mobile Number", "mobileNumber", "tel", true, "Enter your 10-digit mobile number", 'pattern="[0-9]{10}"'],
        ["Official Email", "officialEmail", "email", true, "", "readonly"],
        ["Employee ID", "employeeId", "text", true, "Enter employee ID"],
        ["Office Location", "officeLocation", "text", true, "Enter office location"]
      ]],
      ["Administrative Assignment", [
        ["Department", "department", "select", true, ["Solid Waste Management", "Sanitation Department", "Municipal Administration"]],
        ["Zone", "zone", "select", true, ["Central Zone", "North Zone", "South Zone", "East Zone", "West Zone"]]
      ]]
    ],
    deputy_commissioner: [
      ["Official Information", [
        ["Full Name", "fullName", "text", true, "Enter your full name"],
        ["Mobile Number", "mobileNumber", "tel", true, "Enter your 10-digit mobile number", 'pattern="[0-9]{10}"'],
        ["Official Email", "officialEmail", "email", true, "", "readonly"],
        ["Employee ID", "employeeId", "text", true, "Enter employee ID"]
      ]],
      ["Administrative Information", [
        ["Department", "department", "text", true, "Enter department"],
        ["Designation", "designation", "text", true, "Enter designation"],
        ["Office Location", "officeLocation", "text", true, "Enter office location"],
        ["Jurisdiction", "jurisdiction", "text", true, "Enter jurisdiction"]
      ]]
    ]
  };

  const fieldHTML = (field, email) => {
    const [label, name, type, required, extra, attrs = ""] = field;
    const star = required ? '<span class="required">*</span>' : "";

    if (type === "select") {
      const options = extra.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join("");
      return `<div class="field"><label for="${name}">${escape(label)} ${star}</label><select id="${name}" name="${name}" ${required ? "required" : ""}><option value="">Select ${escape(label)}</option>${options}</select></div>`;
    }

    const value = name === "officialEmail" ? email : "";
    const full = name === "address" || name === "jurisdiction" || name === "officeLocation";
    return `<div class="field${full ? " full-width" : ""}"><label for="${name}">${escape(label)} ${star}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" placeholder="${escape(extra || "")}" ${required ? "required" : ""} ${attrs}></div>`;
  };

  const showMessage = (text, type = "") => {
    message.textContent = text;
    message.className = `profile-message ${type}`.trim();
  };

  const meResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!meResponse.ok) {
    window.location.href = "/login";
    return;
  }

  const me = await meResponse.json();
  const role = me.user.role;
  const roleName = roles[role];

  if (!roleName || !configs[role]) {
    showMessage("This profile type is not configured yet.", "error");
    return;
  }

  selectedRole.textContent = roleName;
  roleInitial.textContent = roleName.charAt(0);

  let existing = {};
  try {
    const response = await fetch("/api/profile", { credentials: "same-origin" });
    if (response.ok) {
      const result = await response.json();
      existing = result.profile || {};
    }
  } catch (_) {}

  const toFormName = key => ({
    full_name: "fullName",
    mobile_number: "mobileNumber",
    official_email: "officialEmail",
    employee_id: "employeeId",
    assigned_ward: "assignedWard",
    office_location: "officeLocation",
    working_shift: "workingShift",
    official_contact_number: "officialContactNumber",
    preferred_language: "preferredLanguage",
    notification_preference: "notificationPreference",
    license_number: "licenseNumber",
    license_type: "licenseType",
    vehicle_number: "vehicleNumber"
  }[key] || key);

  fields.innerHTML = configs[role].map(([title, sectionFields]) => `
    <section class="form-section">
      <div class="section-heading"><h3>${escape(title)}</h3><p>Enter the required information.</p></div>
      <div class="profile-fields">${sectionFields.map(field => fieldHTML(field, me.user.email)).join("")}</div>
    </section>
  `).join("");

  Object.entries(existing).forEach(([key, value]) => {
    const input = document.getElementById(toFormName(key));
    if (input && value != null) input.value = value;
  });

  if (backButton) backButton.addEventListener("click", () => window.location.href = "/login");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    showMessage("");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submitButton.disabled = true;
    submitText.textContent = "Saving...";

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to save profile.");

      showMessage("Profile saved successfully.", "success");
      setTimeout(() => {
        if (role === "sanitary_inspector") window.location.href = "/InspectorDash";
      }, 400);
    } catch (error) {
      showMessage(error.message, "error");
      submitButton.disabled = false;
      submitText.textContent = "Complete Profile";
    }
  });
});

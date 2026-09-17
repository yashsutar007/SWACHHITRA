const db = require("../config/db");

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

const getProfile = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.email, u.role,
              p.full_name, p.mobile_number, p.official_email, p.employee_id,
              p.assigned_ward, p.department, p.zone, p.office_location,
              p.working_shift, p.official_contact_number, p.address, p.city,
              p.ward, p.preferred_language, p.notification_preference,
              p.license_number, p.license_type, p.vehicle_number,
              p.designation, p.jurisdiction
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [req.session.userId]
    );

    if (!rows[0]) return res.status(404).json({ success: false, message: "Profile not found." });
    res.json({ success: true, profile: rows[0] });
  } catch (error) {
    console.error("Profile read error:", error);
    res.status(500).json({ success: false, message: "Unable to load profile." });
  }
};

const saveProfile = async (req, res) => {
  const body = req.body || {};

  try {
    const [users] = await db.execute(
      "SELECT email, role FROM users WHERE id = ? LIMIT 1",
      [req.session.userId]
    );

    if (!users[0]) return res.status(404).json({ success: false, message: "User not found." });

    const role = users[0].role;
    const data = {
      full_name: clean(body.fullName),
      mobile_number: clean(body.mobileNumber),
      official_email: users[0].email,
      employee_id: clean(body.employeeId),
      assigned_ward: clean(body.assignedWard),
      department: clean(body.department),
      zone: clean(body.zone),
      office_location: clean(body.officeLocation),
      working_shift: clean(body.workingShift),
      official_contact_number: clean(body.officialContactNumber),
      address: clean(body.address),
      city: clean(body.city),
      ward: clean(body.ward),
      preferred_language: clean(body.preferredLanguage),
      notification_preference: clean(body.notificationPreference),
      license_number: clean(body.licenseNumber),
      license_type: clean(body.licenseType),
      vehicle_number: clean(body.vehicleNumber),
      designation: clean(body.designation),
      jurisdiction: clean(body.jurisdiction)
    };

    const required = role === "sanitary_inspector"
      ? ["full_name", "mobile_number", "employee_id", "assigned_ward", "department", "zone", "office_location"]
      : ["full_name", "mobile_number"];

    const missing = required.filter(key => !data[key]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: "Please complete all required profile fields." });
    }

    await db.execute(
      `INSERT INTO user_profiles
       (user_id, full_name, mobile_number, official_email, employee_id,
        assigned_ward, department, zone, office_location, working_shift,
        official_contact_number, address, city, ward, preferred_language,
        notification_preference, license_number, license_type, vehicle_number,
        designation, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        mobile_number = VALUES(mobile_number),
        official_email = VALUES(official_email),
        employee_id = VALUES(employee_id),
        assigned_ward = VALUES(assigned_ward),
        department = VALUES(department),
        zone = VALUES(zone),
        office_location = VALUES(office_location),
        working_shift = VALUES(working_shift),
        official_contact_number = VALUES(official_contact_number),
        address = VALUES(address),
        city = VALUES(city),
        ward = VALUES(ward),
        preferred_language = VALUES(preferred_language),
        notification_preference = VALUES(notification_preference),
        license_number = VALUES(license_number),
        license_type = VALUES(license_type),
        vehicle_number = VALUES(vehicle_number),
        designation = VALUES(designation),
        jurisdiction = VALUES(jurisdiction)`,
      [
        req.session.userId,
        data.full_name, data.mobile_number, data.official_email, data.employee_id,
        data.assigned_ward, data.department, data.zone, data.office_location,
        data.working_shift, data.official_contact_number, data.address, data.city,
        data.ward, data.preferred_language, data.notification_preference,
        data.license_number, data.license_type, data.vehicle_number,
        data.designation, data.jurisdiction
      ]
    );

    res.json({ success: true, message: "Profile saved successfully." });
  } catch (error) {
    console.error("Profile save error:", error);
    res.status(500).json({ success: false, message: "Unable to save profile." });
  }
};

module.exports = { getProfile, saveProfile };

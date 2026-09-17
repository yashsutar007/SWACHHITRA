const bcrypt = require("bcryptjs");
const db = require("../config/db");

const login = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const requestedRole = String(req.body.role || "").trim();

  if (!email || !password || !requestedRole) {
    return res.status(400).json({ success: false, message: "Email, password and role are required." });
  }

  try {
    const [rows] = await db.execute(
      "SELECT id, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];
    if (!user || user.status !== "active") {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword || user.role !== requestedRole) {
      return res.status(401).json({ success: false, message: "Invalid email, password or role." });
    }

    req.session.regenerate(err => {
      if (err) {
        console.error("Session error:", err);
        return res.status(500).json({ success: false, message: "Unable to create login session." });
      }
      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.role = user.role;
      res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Unable to process login." });
  }
};

const me = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Not authenticated." });
  }

  res.json({
    success: true,
    user: {
      id: req.session.userId,
      email: req.session.email,
      role: req.session.role
    }
  });
};

const logout = (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({ success: false, message: "Unable to log out." });
    }
    res.clearCookie("swachhitra.sid");
    res.json({ success: true, message: "Logged out successfully." });
  });
};

module.exports = { login, me, logout };

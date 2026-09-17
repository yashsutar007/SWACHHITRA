function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (req.session.role !== role) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    next();
  };
}

function requirePageRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) return res.redirect("/login");
    if (req.session.role !== role) return res.status(403).send("Access denied.");
    next();
  };
}

module.exports = { requireAuth, requireRole, requirePageRole };

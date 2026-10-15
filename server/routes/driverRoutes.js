"use strict";

const express = require("express");
const { requireRole } = require("../middleware/authMiddleware");
const {
    ensureDriverCsrfToken,
    requireDriverMutationSecurity
} = require("../middleware/driverSecurityMiddleware");
const {
    getMyDriver,
    getMyAssignments,
    startMyAssignment,
    updateMyStop,
    reportMyAssignmentDelay,
    reportMyTruckFull,
    completeMyAssignment,
    updateMyLocation,
    getMyNotifications,
    markMyNotificationsRead
} = require("../controllers/driverController");

const router = express.Router();

// All Driver endpoints resolve identity from the authenticated session.
router.use(requireRole("driver"));

router.get("/security/csrf-token", ensureDriverCsrfToken);
router.get("/me", getMyDriver);
router.get("/assignments", getMyAssignments);
router.get("/notifications", getMyNotifications);
router.post("/notifications/read", requireDriverMutationSecurity, markMyNotificationsRead);
router.post("/location", requireDriverMutationSecurity, updateMyLocation);

router.post(
    "/assignments/:assignmentId/start",
    requireDriverMutationSecurity,
    startMyAssignment
);
router.post(
    "/stops/:stopId/status",
    requireDriverMutationSecurity,
    updateMyStop
);
router.post(
    "/assignments/:assignmentId/delay",
    requireDriverMutationSecurity,
    reportMyAssignmentDelay
);
router.post(
    "/assignments/:assignmentId/truck-full",
    requireDriverMutationSecurity,
    reportMyTruckFull
);
router.post(
    "/assignments/:assignmentId/complete",
    requireDriverMutationSecurity,
    completeMyAssignment
);

module.exports = router;

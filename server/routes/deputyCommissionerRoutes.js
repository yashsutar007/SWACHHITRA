"use strict";

const express = require("express");
const { requireRole } = require("../middleware/authMiddleware");
const {
    getMyNotifications,
    getCityOverview,
    getDivisionSupervision,
    getDivisionWards,
    getComplaintOversight,
    escalateComplaint,
    getFleetOperations,
    getReportsAnalytics,
    getSecurityCenter,
    updateStaffAccountStatus
} = require("../controllers/deputyCommissionerController");

const { ensureDeputyCommissionerCsrfToken, requireDeputyCommissionerMutationSecurity } = require("../middleware/deputyCommissionerSecurityMiddleware");

const router = express.Router();

// All DC endpoints are restricted to the DC role; fleet endpoints are read-only.
router.use(requireRole("deputy_commissioner"));
router.get("/notifications", getMyNotifications);
router.get("/overview", getCityOverview);
router.get("/divisions", getDivisionSupervision);
router.get("/divisions/:divisionId/wards", getDivisionWards);
router.get("/complaints", getComplaintOversight);
router.get("/fleet", getFleetOperations);
router.get("/reports", getReportsAnalytics);
router.get("/security", getSecurityCenter);
router.post("/security/accounts/:userId/status", requireDeputyCommissionerMutationSecurity, updateStaffAccountStatus);
router.get("/security/csrf-token", ensureDeputyCommissionerCsrfToken);
router.post("/complaints/:complaintId/escalate", requireDeputyCommissionerMutationSecurity, escalateComplaint);

module.exports = router;

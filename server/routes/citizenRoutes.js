const express = require("express");
const { requireRole } = require("../middleware/authMiddleware");
const {
    issueCitizenCsrfToken,
    protectCitizenMutation
} = require("../middleware/citizenSecurityMiddleware");
const {
    getCitizenProfile,
    getCitizenWardAreas,
    getCitizenLiveTracking,
    getCitizenNotifications,
    markCitizenNotificationsRead,
    saveCitizenProfile,
    getMyComplaints,
    createCitizenComplaint,
    cancelCitizenComplaint
} = require("../controllers/citizenController");
const {
    getCitizenPushConfig,
    saveCitizenPushSubscription,
    removeCitizenPushSubscription
} = require("../controllers/citizenPushController");

const router = express.Router();

router.use(requireRole("citizen"));

router.get("/security/csrf-token", issueCitizenCsrfToken);
router.get("/profile", getCitizenProfile);
router.get("/ward-areas", getCitizenWardAreas);
router.get("/live-tracking", getCitizenLiveTracking);
router.get("/notifications", getCitizenNotifications);
router.put("/notifications/read", protectCitizenMutation, markCitizenNotificationsRead);
router.get("/push/config", getCitizenPushConfig);
router.post("/push/subscription", protectCitizenMutation, saveCitizenPushSubscription);
router.delete("/push/subscription", protectCitizenMutation, removeCitizenPushSubscription);
router.post("/profile", protectCitizenMutation, saveCitizenProfile);

// Citizen complaint APIs. The controller derives the complaint Ward from
// the saved profile; the client is not allowed to choose a Ward or Division.
router.get("/complaints", getMyComplaints);
router.post("/complaints", protectCitizenMutation, createCitizenComplaint);
router.put("/complaints/:id/cancel", protectCitizenMutation, cancelCitizenComplaint);

module.exports = router;

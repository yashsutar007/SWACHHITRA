const express = require("express");
const { requireRole } = require("../middleware/authMiddleware");
const {
    issueCitizenCsrfToken,
    protectCitizenMutation
} = require("../middleware/citizenSecurityMiddleware");
const {
    getCitizenProfile,
    getCitizenWardAreas,
    saveCitizenProfile,
    getMyComplaints,
    createCitizenComplaint,
    cancelCitizenComplaint
} = require("../controllers/citizenController");

const router = express.Router();

router.use(requireRole("citizen"));

router.get("/security/csrf-token", issueCitizenCsrfToken);
router.get("/profile", getCitizenProfile);
router.get("/ward-areas", getCitizenWardAreas);
router.post("/profile", protectCitizenMutation, saveCitizenProfile);

// Citizen complaint APIs. The controller derives the complaint Ward from
// the saved profile; the client is not allowed to choose a Ward or Division.
router.get("/complaints", getMyComplaints);
router.post("/complaints", protectCitizenMutation, createCitizenComplaint);
router.put("/complaints/:id/cancel", protectCitizenMutation, cancelCitizenComplaint);

module.exports = router;

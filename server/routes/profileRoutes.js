const express = require("express");

const {
    requireAuth
} = require("../middleware/authMiddleware");

const {
    getProfile,
    getReferenceData,
    saveProfile
} = require("../controllers/profileController");


const router = express.Router();


/*
 * All profile endpoints require an authenticated user.
 */
router.use(requireAuth);


/*
 * GET /api/profile
 *
 * Returns the authenticated user's saved profile.
 * If no profile exists yet, the controller returns:
 *
 *   profile: null
 *
 * so the frontend can show the manual profile-completion form.
 */
router.get(
    "/",
    getProfile
);


/*
 * GET /api/profile/reference-data
 *
 * Returns active zones and wards used by the profile form.
 */
router.get(
    "/reference-data",
    getReferenceData
);


/*
 * POST /api/profile
 *
 * Creates or updates the authenticated user's profile.
 *
 * The user ID is taken from the authenticated session.
 */
router.post(
    "/",
    saveProfile
);


module.exports = router;

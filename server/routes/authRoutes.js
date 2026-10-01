const express = require("express");

const {
    login,
    me,
    logout
} = require("../controllers/authController");


const router = express.Router();


/*
 * Authentication routes
 *
 * POST /api/auth/login
 *      Verifies credentials and creates the session.
 *
 * GET /api/auth/me
 *      Returns the currently authenticated user and profile state.
 *
 * POST /api/auth/logout
 *      Destroys the current session.
 */


/*
 * Login
 */
router.post(
    "/login",
    login
);


/*
 * Current session
 *
 * This endpoint intentionally does not use requireAuth because its purpose
 * is to tell the frontend whether the user is currently authenticated.
 * The controller returns HTTP 401 when there is no valid session.
 */
router.get(
    "/me",
    me
);


/*
 * Logout
 */
router.post(
    "/logout",
    logout
);


module.exports = router;
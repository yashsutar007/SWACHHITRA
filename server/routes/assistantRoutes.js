const express = require("express");

const {
    getOverview,
    getWards,
    getInspectors,
    assignInspectorScope
} = require("../controllers/assistantController");

const {
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
 * =========================================================
 * SWACHHITRA
 * ASSISTANT COMMISSIONER ROUTES
 * =========================================================
 *
 * Route prefix, registered by server.js:
 *     /api/assistant
 *
 * Every route in this module requires an authenticated
 * Assistant Commissioner. Scope enforcement itself remains in
 * assistantController.js so authorization cannot be bypassed by
 * calling a controller from another route.
 */

router.use(
    requireRole("assistant_commissioner")
);


// ---------------------------------------------------------
// Assistant Commissioner overview
// GET /api/assistant/overview
// ---------------------------------------------------------
router.get(
    "/overview",
    getOverview
);


// ---------------------------------------------------------
// Wards belonging to the Assistant Commissioner's division
// GET /api/assistant/wards
// ---------------------------------------------------------
router.get(
    "/wards",
    getWards
);


// ---------------------------------------------------------
// Sanitary Inspectors visible to the Assistant Commissioner
// GET /api/assistant/inspectors
// ---------------------------------------------------------
router.get(
    "/inspectors",
    getInspectors
);


// ---------------------------------------------------------
// Assign/reassign a Sanitary Inspector to a ward
// PUT /api/assistant/inspectors/:id/scope
//
// Request body:
// {
//     "ward_id": 123,
//     "reason": "Operational reassignment"
// }
//
// The division is NOT accepted from the browser. The
// controller derives it from the authenticated Assistant
// Commissioner's own scope and verifies that the selected ward
// belongs to that division.
// ---------------------------------------------------------
router.put(
    "/inspectors/:id/scope",
    assignInspectorScope
);


module.exports = router;

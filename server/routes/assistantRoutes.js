const express = require("express");

const {
    getOverview,
    getWards,
    createOperationalWard,
    updateOperationalWardBoundary,
    getInspectors,
    assignInspectorScope,
    getMapData,
    getSupervision,
    reviewRouteChangeRequest,
    saveDivisionOperationalArea,
    getReportsAnalytics
} = require("../controllers/assistantController");

const {
    ensureAssistantCsrfToken,
    requireAssistantMutationSecurity
} = require("../middleware/assistantSecurityMiddleware");

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
// Divisional operational map
// GET /api/assistant/map
// ---------------------------------------------------------
router.get(
    "/map",
    getMapData
);


// ---------------------------------------------------------
// Read-only operational supervision snapshot
// GET /api/assistant/supervision
// ---------------------------------------------------------
router.get(
    "/supervision",
    getSupervision
);


// ---------------------------------------------------------
// Divisional reports and analytics
// GET /api/assistant/reports
// ---------------------------------------------------------
router.get(
    "/reports",
    getReportsAnalytics
);


// ---------------------------------------------------------
// Assistant Commissioner mutation security token
// GET /api/assistant/security/csrf-token
// ---------------------------------------------------------
router.get(
    "/security/csrf-token",
    ensureAssistantCsrfToken
);


// ---------------------------------------------------------
// Review a route change request
// PUT /api/assistant/route-change-requests/:id/review
// ---------------------------------------------------------
router.put(
    "/route-change-requests/:id/review",
    requireAssistantMutationSecurity,
    reviewRouteChangeRequest
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
// Create an application-managed operational ward
// POST /api/assistant/wards
// ---------------------------------------------------------
router.post(
    "/wards",
    requireAssistantMutationSecurity,
    createOperationalWard
);


// ---------------------------------------------------------
// Update an Assistant Commissioner-defined ward boundary
// PUT /api/assistant/wards/:id/boundary
//
// Official KMC ward geometry is read-only. This endpoint is
// only for non-official application-managed operational
// geometry owned by the authenticated Assistant Commissioner.
// ---------------------------------------------------------
router.put(
    "/wards/:id/boundary",
    requireAssistantMutationSecurity,
    updateOperationalWardBoundary
);


// ---------------------------------------------------------
// Save the authenticated AC's operational division area
// PUT /api/assistant/division-area
// ---------------------------------------------------------
router.put(
    "/division-area",
    requireAssistantMutationSecurity,
    saveDivisionOperationalArea
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
// Commissioner's own scope and verifies that the selected Ward
// belongs to that division. The selected Ward becomes the Inspector's
// assigned jurisdiction. Ward boundary editing is handled from the Wards
// tab, using the same ward record so existing routes remain attached.
// ---------------------------------------------------------
router.put(
    "/inspectors/:id/scope",
    requireAssistantMutationSecurity,
    assignInspectorScope
);


module.exports = router;

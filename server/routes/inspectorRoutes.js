const express = require("express");

const {
    getOverview,
    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    updateRouteAssignment,
    removeRouteAssignment,
    getRouteStopsForInspector,
    createRouteStop,
    updateRouteStop,
    deleteRouteStop,

    getVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,

    getDrivers,
    createDriver,
    updateDriver,
    deleteDriver,

    getAssignments,
    getCollections,
    getCollectionIntegrity,
    getComplaints,
    updateComplaint,
    getNotifications,
    markNotificationsRead,
    getZones,
    getWards
} = require("../controllers/inspectorController");

const { requireRole } = require("../middleware/authMiddleware");
const {
    ensureInspectorCsrfToken,
    requireInspectorMutationSecurity
} = require("../middleware/inspectorSecurityMiddleware");

const router = express.Router();

/*
 * =========================================================
 * SWACHHITRA
 * INSPECTOR OPERATIONAL ROUTES
 * =========================================================
 *
 * Read access:
 *   Deputy Commissioner
 *   Assistant Commissioner
 *   Sanitary Inspector
 *
 * Operational mutations:
 *   Sanitary Inspector only
 *
 * This is an authorization boundary, not merely a UI choice.
 * The controller still performs database-backed scope checks.
 */

const OPERATIONAL_VIEW_ROLES = [
    "deputy_commissioner",
    "assistant_commissioner",
    "sanitary_inspector"
];

const INSPECTOR_WRITE_ROLES = [
    "sanitary_inspector"
];

router.use(
    requireRole(...OPERATIONAL_VIEW_ROLES)
);

const requireInspectorWrite = requireRole(
    ...INSPECTOR_WRITE_ROLES
);

// CSRF token endpoint for the authenticated Inspector dashboard.
// It is read-only from the application perspective and never exposes
// database data. The token is bound to the current session.
router.get(
    "/security/csrf-token",
    ensureInspectorCsrfToken
);

const inspectorWriteSecurity = [
    requireInspectorWrite,
    requireInspectorMutationSecurity
];

// ---------------------------------------------------------
// Read-only operational views
// ---------------------------------------------------------
router.get("/overview", getOverview);
router.get("/routes", getRoutes);
router.get("/vehicles", getVehicles);
router.get("/drivers", getDrivers);
router.get("/assignments", getAssignments);
router.get("/collections", getCollections);
router.get("/collections/integrity", getCollectionIntegrity);
router.get("/complaints", getComplaints);
router.get("/notifications", getNotifications);
router.put(
    "/notifications/read",
    requireInspectorMutationSecurity,
    markNotificationsRead
);
router.get("/zones", getZones);
router.get("/wards", getWards);

// ---------------------------------------------------------
// Route mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/routes",
    ...inspectorWriteSecurity,
    createRoute
);

router.put(
    "/routes/:id",
    ...inspectorWriteSecurity,
    updateRoute
);

router.delete(
    "/routes/:id",
    ...inspectorWriteSecurity,
    deleteRoute
);

router.put(
    "/routes/:id/assignment",
    ...inspectorWriteSecurity,
    updateRouteAssignment
);

router.delete(
    "/routes/:id/assignment",
    ...inspectorWriteSecurity,
    removeRouteAssignment
);

// ---------------------------------------------------------
// Route-stop mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.get(
    "/routes/:id/stops",
    getRouteStopsForInspector
);

router.post(
    "/routes/:id/stops",
    ...inspectorWriteSecurity,
    createRouteStop
);

router.put(
    "/routes/:id/stops/:stopId",
    ...inspectorWriteSecurity,
    updateRouteStop
);

router.delete(
    "/routes/:id/stops/:stopId",
    ...inspectorWriteSecurity,
    deleteRouteStop
);

// ---------------------------------------------------------
// Fleet mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/vehicles",
    ...inspectorWriteSecurity,
    createVehicle
);

router.put(
    "/vehicles/:id",
    ...inspectorWriteSecurity,
    updateVehicle
);

router.delete(
    "/vehicles/:id",
    ...inspectorWriteSecurity,
    deleteVehicle
);

// ---------------------------------------------------------
// Driver mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/drivers",
    ...inspectorWriteSecurity,
    createDriver
);

router.put(
    "/drivers/:id",
    ...inspectorWriteSecurity,
    updateDriver
);

router.delete(
    "/drivers/:id",
    ...inspectorWriteSecurity,
    deleteDriver
);

// ---------------------------------------------------------
// Complaint status changes: Sanitary Inspector only
// Assistant Commissioner has view access and will later receive
// a separate route-approval workflow.
// ---------------------------------------------------------
router.put(
    "/complaints/:id",
    ...inspectorWriteSecurity,
    updateComplaint
);

module.exports = router;

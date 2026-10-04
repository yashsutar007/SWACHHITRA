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
    getComplaints,
    updateComplaint,
    getNotifications,
    markNotificationsRead,
    getZones,
    getWards
} = require("../controllers/inspectorController");

const { requireRole } = require("../middleware/authMiddleware");

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

// ---------------------------------------------------------
// Read-only operational views
// ---------------------------------------------------------
router.get("/overview", getOverview);
router.get("/routes", getRoutes);
router.get("/vehicles", getVehicles);
router.get("/drivers", getDrivers);
router.get("/assignments", getAssignments);
router.get("/collections", getCollections);
router.get("/complaints", getComplaints);
router.get("/notifications", getNotifications);
router.put("/notifications/read", markNotificationsRead);
router.get("/zones", getZones);
router.get("/wards", getWards);

// ---------------------------------------------------------
// Route mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/routes",
    requireInspectorWrite,
    createRoute
);

router.put(
    "/routes/:id",
    requireInspectorWrite,
    updateRoute
);

router.delete(
    "/routes/:id",
    requireInspectorWrite,
    deleteRoute
);

router.put(
    "/routes/:id/assignment",
    requireInspectorWrite,
    updateRouteAssignment
);

router.delete(
    "/routes/:id/assignment",
    requireInspectorWrite,
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
    requireInspectorWrite,
    createRouteStop
);

router.put(
    "/routes/:id/stops/:stopId",
    requireInspectorWrite,
    updateRouteStop
);

router.delete(
    "/routes/:id/stops/:stopId",
    requireInspectorWrite,
    deleteRouteStop
);

// ---------------------------------------------------------
// Fleet mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/vehicles",
    requireInspectorWrite,
    createVehicle
);

router.put(
    "/vehicles/:id",
    requireInspectorWrite,
    updateVehicle
);

router.delete(
    "/vehicles/:id",
    requireInspectorWrite,
    deleteVehicle
);

// ---------------------------------------------------------
// Driver mutations: Sanitary Inspector only
// ---------------------------------------------------------
router.post(
    "/drivers",
    requireInspectorWrite,
    createDriver
);

router.put(
    "/drivers/:id",
    requireInspectorWrite,
    updateDriver
);

router.delete(
    "/drivers/:id",
    requireInspectorWrite,
    deleteDriver
);

// ---------------------------------------------------------
// Complaint status changes: Sanitary Inspector only
// Assistant Commissioner has view access and will later receive
// a separate route-approval workflow.
// ---------------------------------------------------------
router.put(
    "/complaints/:id",
    requireInspectorWrite,
    updateComplaint
);

module.exports = router;

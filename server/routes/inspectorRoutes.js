"use strict";

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

const { getCollectionIntegrity } = require("../controllers/inspectorCollectionIntegrityController");
const { createDriverLoginAccount } = require("../controllers/driverAccountController");
const { requireRole } = require("../middleware/authMiddleware");
const {
    ensureInspectorCsrfToken,
    requireInspectorMutationSecurity
} = require("../middleware/inspectorSecurityMiddleware");

const router = express.Router();

const OPERATIONAL_VIEW_ROLES = [
    "deputy_commissioner",
    "assistant_commissioner",
    "sanitary_inspector"
];
const INSPECTOR_WRITE_ROLES = ["sanitary_inspector"];

router.use(requireRole(...OPERATIONAL_VIEW_ROLES));
const requireInspectorWrite = requireRole(...INSPECTOR_WRITE_ROLES);

// An authenticated Sanitary Inspector obtains a session-bound token before mutations.
router.get(
    "/security/csrf-token",
    requireInspectorWrite,
    ensureInspectorCsrfToken
);

// Read-only operational endpoints.
router.get("/overview", getOverview);
router.get("/routes", getRoutes);
router.get("/vehicles", getVehicles);
router.get("/drivers", getDrivers);
router.get("/assignments", getAssignments);
router.get("/collections", getCollections);
router.get("/collections/integrity", getCollectionIntegrity);
router.get("/complaints", getComplaints);
router.get("/notifications", getNotifications);
router.get("/zones", getZones);
router.get("/wards", getWards);
router.get("/routes/:id/stops", getRouteStopsForInspector);

// Complaint lifecycle mutation. Both role authorization and CSRF/origin/rate-limit
// controls run before the controller can update the record.
router.put(
    "/complaints/:id",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    updateComplaint
);
router.put(
    "/notifications/read",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    markNotificationsRead
);

// Route mutations.
router.post("/routes", requireInspectorWrite, requireInspectorMutationSecurity, createRoute);
router.put("/routes/:id", requireInspectorWrite, requireInspectorMutationSecurity, updateRoute);
router.delete("/routes/:id", requireInspectorWrite, requireInspectorMutationSecurity, deleteRoute);
router.put(
    "/routes/:id/assignment",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    updateRouteAssignment
);
router.delete(
    "/routes/:id/assignment",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    removeRouteAssignment
);

// Route-stop mutations.
router.post(
    "/routes/:id/stops",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    createRouteStop
);
router.put(
    "/routes/:id/stops/:stopId",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    updateRouteStop
);
router.delete(
    "/routes/:id/stops/:stopId",
    requireInspectorWrite,
    requireInspectorMutationSecurity,
    deleteRouteStop
);

// Fleet mutations.
router.post("/vehicles", requireInspectorWrite, requireInspectorMutationSecurity, createVehicle);
router.put("/vehicles/:id", requireInspectorWrite, requireInspectorMutationSecurity, updateVehicle);
router.delete("/vehicles/:id", requireInspectorWrite, requireInspectorMutationSecurity, deleteVehicle);

// Driver mutations.
router.post("/drivers/:id/account", requireInspectorWrite, requireInspectorMutationSecurity, createDriverLoginAccount);
router.post("/drivers", requireInspectorWrite, requireInspectorMutationSecurity, createDriver);
router.put("/drivers/:id", requireInspectorWrite, requireInspectorMutationSecurity, updateDriver);
router.delete("/drivers/:id", requireInspectorWrite, requireInspectorMutationSecurity, deleteDriver);

module.exports = router;

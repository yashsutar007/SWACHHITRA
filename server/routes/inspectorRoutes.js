const express = require("express");

const {
    getOverview,
    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
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
 * Inspector operations are available to:
 * - Deputy Commissioner (Health)
 * - Assistant Commissioner
 * - Sanitary / Health Inspector
 *
 * requireRole() also ensures the request is authenticated.
 */
router.use(
    requireRole(
        "deputy_commissioner",
        "assistant_commissioner",
        "sanitary_inspector"
    )
);

// Dashboard / overview
router.get("/overview", getOverview);

// Route management
router.get("/routes", getRoutes);
router.post("/routes", createRoute);
router.put("/routes/:id", updateRoute);
router.delete("/routes/:id", deleteRoute);

// Fleet / driver operations
router.get("/vehicles", getVehicles);
router.post("/vehicles", createVehicle);
router.put("/vehicles/:id", updateVehicle);
router.delete("/vehicles/:id", deleteVehicle);

router.get("/drivers", getDrivers);
router.post("/drivers", createDriver);
router.put("/drivers/:id", updateDriver);
router.delete("/drivers/:id", deleteDriver);

router.get("/assignments", getAssignments);

// Collection progress
router.get("/collections", getCollections);

// Complaint management
router.get("/complaints", getComplaints);
router.put("/complaints/:id", updateComplaint);

// Inspector notifications
router.get("/notifications", getNotifications);
router.put("/notifications/read", markNotificationsRead);

// Reference / jurisdiction data
router.get("/zones", getZones);
router.get("/wards", getWards);

module.exports = router;

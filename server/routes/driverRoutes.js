"use strict";

const express = require("express");
const { requireRole } = require("../middleware/authMiddleware");
const {
    getMyDriver,
    getMyAssignments
} = require("../controllers/driverController");

const router = express.Router();

// Every endpoint in this router is available only to an active Driver login.
router.use(requireRole("driver"));

router.get("/me", getMyDriver);
router.get("/assignments", getMyAssignments);

module.exports = router;

const router = require("express").Router();
const { requireAuth } = require("../middleware/authMiddleware");
const { getProfile, saveProfile } = require("../controllers/profileController");

router.get("/", requireAuth, getProfile);
router.post("/", requireAuth, saveProfile);

module.exports = router;

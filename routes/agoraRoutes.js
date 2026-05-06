const express = require("express");
const router = express.Router();
const agoraController = require("../controllers/agoraController");
const { protect } = require("../middleware/authMiddleware");

// All Agora routes are protected
router.post("/token", protect, agoraController.getAgoraToken);

module.exports = router;

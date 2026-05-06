const express = require("express");
const router = express.Router();
const callController = require("../controllers/callController");
const { protect } = require("../middleware/authMiddleware");

// All call signaling routes are protected
router.post("/initiate", protect, callController.initiateCall);
router.post("/end", protect, callController.endCall);

module.exports = router;

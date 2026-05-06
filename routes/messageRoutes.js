const express = require("express");
const { sendMessage, getMessages } = require("../controllers/messageController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// All message routes require authentication
router.use(protect);

// POST /api/messages                        → send a message
// GET  /api/messages/:conversationId        → get messages (supports ?page=&limit=)

router.post("/", sendMessage);
router.get("/:conversationId", getMessages);

module.exports = router;

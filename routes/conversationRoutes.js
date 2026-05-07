const express = require("express");
const {
  createConversation,
  getUserConversations,
  getConversationById,
  getConversationMedia,
} = require("../controllers/conversationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// All conversation routes require authentication
router.use(protect);

// POST /api/conversations          → create or retrieve a conversation
// GET  /api/conversations          → get all conversations for logged-in user
// GET  /api/conversations/:id      → get single conversation by ID

router.post("/", createConversation);
router.get("/", getUserConversations);
router.get("/:id", getConversationById);
router.get("/:id/media", getConversationMedia);

module.exports = router;

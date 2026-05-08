const express = require("express");
const { sendMessage, getMessages, uploadVoiceMessage } = require("../controllers/messageController");
const { protect } = require("../middleware/authMiddleware");
const multer = require("multer");

const router = express.Router();

// Multer setup for voice messages
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["audio/webm", "audio/mpeg", "audio/wav", "audio/mp3", "audio/ogg"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only audio files (webm, mp3, wav, ogg) are allowed for voice messages."), false);
        }
    },
});

// All message routes require authentication
router.use(protect);

// POST /api/messages                        → send a message
// GET  /api/messages/:conversationId        → get messages (supports ?page=&limit=)

router.post("/", sendMessage);
router.post("/voice", upload.single("audio"), uploadVoiceMessage);
router.get("/:conversationId", getMessages);

module.exports = router;

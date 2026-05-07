const express = require("express");
const multer = require("multer");
const { uploadFile } = require("../controllers/uploadController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Store file in memory — we stream it to Cloudinary immediately
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
    fileFilter: (_req, file, cb) => {
        // Allow images, videos, PDFs, docs, zip
        const allowed = [
            "image/",
            "video/",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "text/plain",
        ];
        const ok = allowed.some((t) => file.mimetype.startsWith(t));
        if (ok) return cb(null, true);
        cb(new Error("File type not allowed."));
    },
});

// POST /api/upload — authenticated
router.post("/", protect, upload.single("file"), uploadFile);

module.exports = router;

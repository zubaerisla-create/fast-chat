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
            "audio/",
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
router.post("/", protect, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading (e.g. file too large)
            return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
        } else if (err) {
            // An unknown error occurred when uploading or filtered out
            return res.status(400).json({ success: false, message: err.message });
        }
        // Everything went fine.
        next();
    });
}, uploadFile);


module.exports = router;

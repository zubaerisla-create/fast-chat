const express = require("express");
const {
  getAllUsers,
  searchUsers,
  getUserById,
  updateProfile,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const multer = require("multer");

// Multer setup for profile picture
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for avatar
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed for profile pictures."), false);
    }
  },
});

const router = express.Router();

// All user routes require authentication
router.use(protect);

// GET /api/users?          → get all users (excluding self)
// GET /api/users/search?query=  → search by username or email
// GET /api/users/:id       → get single user profile

router.get("/search", searchUsers);
router.get("/:id", getUserById);
router.put("/profile", upload.single("avatar"), updateProfile);
router.get("/", getAllUsers);

module.exports = router;

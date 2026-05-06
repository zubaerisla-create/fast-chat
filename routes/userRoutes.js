const express = require("express");
const {
  getAllUsers,
  searchUsers,
  getUserById,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// All user routes require authentication
router.use(protect);

// GET /api/users?          → get all users (excluding self)
// GET /api/users/search?query=  → search by username or email
// GET /api/users/:id       → get single user profile

router.get("/search", searchUsers);
router.get("/:id", getUserById);
router.get("/", getAllUsers);

module.exports = router;

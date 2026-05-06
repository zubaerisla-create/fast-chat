const User = require("../models/User");

/**
 * GET /api/users
 * Get all users except the currently logged-in user.
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select(
      "-password"
    );

    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/search?query=...
 * Search users by username or email (case-insensitive).
 * Excludes the current user from results.
 */
const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Search query is required." });
    }

    const regex = new RegExp(query.trim(), "i"); // Case-insensitive regex

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ username: regex }, { email: regex }],
    }).select("username email avatar isOnline lastSeen");

    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 * Get a single user's public profile by ID.
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username email avatar isOnline lastSeen createdAt"
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllUsers, searchUsers, getUserById };

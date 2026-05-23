const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { isValidExpoPushToken } = require("../services/pushNotificationService");

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


/**
 * PUT /api/users/profile
 * Update user profile (username, avatar).
 * Returns updated user including email.
 */
const updateProfile = async (req, res, next) => {
  try {
    const { username } = req.body;
    const updates = {};

    if (username) updates.username = username;

    // Handle avatar upload if a file is provided
    if (req.file) {
      const { mimetype, buffer } = req.file;
      // const {mimetype, buffer} = req.file;

      // Determine resource_type for Cloudinary
      let resourceType = "image"; // Default to image for profile pic
      if (mimetype.startsWith("video/")) resourceType = "video";

      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "profile-avatars",
            resource_type: resourceType,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
      });

      updates.avatar = uploadResult.secure_url;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("username email avatar lastSeen isOnline");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/push-token
 * Save or update the authenticated user's Expo push token.
 * Body: { expoPushToken: string }
 */
const savePushToken = async (req, res, next) => {
  try {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ success: false, message: "expoPushToken is required." });
    }

    if (!isValidExpoPushToken(expoPushToken)) {
      return res.status(400).json({ success: false, message: "Invalid Expo push token format." });
    }

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { expoPushToken } },
      { new: true }
    );

    res.status(200).json({ success: true, message: "Push token saved successfully." });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/push-token
 * Remove the authenticated user's Expo push token (e.g. on logout).
 */
const removePushToken = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { expoPushToken: null } },
      { new: true }
    );

    res.status(200).json({ success: true, message: "Push token removed successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllUsers, searchUsers, getUserById, updateProfile, savePushToken, removePushToken };

const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Generates a signed JWT token for the given user ID.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

/**
 * POST /api/auth/register
 * Register a new user with username, email, and password.
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    console.log(username, email, password);


    // Basic input validation
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    // Create user (password hashing handled by pre-save hook in model)
    const user = await User.create({ username, email, password });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Authenticate a user and return a JWT token.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    // Explicitly select password since it is excluded by default in the schema
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login };

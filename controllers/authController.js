const https = require("https");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("../utils/mailer");

const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_ANDROID || "496809230686-nnd3i14rdhb1plkddn7dl0emnihauas4.apps.googleusercontent.com",
  process.env.GOOGLE_CLIENT_ID_WEB || "496809230686-djde9n55nvgaads7e0o6qak5vjur8b61.apps.googleusercontent.com",
].filter(Boolean);

const verifyGoogleToken = (idToken) => {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error("Google token verification failed."));
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

/**
 * Generates a signed JWT token for the given user ID.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

/**
 * POST /api/auth/send-otp
 * Generates an OTP, saves it to the database, and sends it to the user's email.
 */
const sendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists." });
    }

    // Generate a 6-digit random OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTP for this email
    await OTP.deleteMany({ email });

  
    await OTP.create({ email, otp });

    // Send the OTP via email
    await sendOTPEmail(email, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully. Please check your email.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register
 * Register a new user with username, email, password, and OTP.
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, otp } = req.body;

    console.log(username, email, password, otp);

    // Basic input validation
    if (!username || !email || !password || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "All fields including OTP are required." });
    }

    // Check OTP validity
    const otpRecord = await OTP.findOne({ email }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: "OTP expired or not found. Please request a new one." });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    // Check if user already exists (just in case)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists." });
    }

    // Create user
    const user = await User.create({ username, email, password });

    // Delete OTP record after successful verification
    await OTP.deleteMany({ email });

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
const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required." });
    }

    const tokenInfo = await verifyGoogleToken(idToken);
    const email = tokenInfo.email && tokenInfo.email.toLowerCase();
    const emailVerified = tokenInfo.email_verified === "true" || tokenInfo.email_verified === true;
    const aud = tokenInfo.aud;

    if (!email || !emailVerified) {
      return res.status(401).json({ success: false, message: "Google account email is not verified." });
    }

    if (GOOGLE_CLIENT_IDS.length > 0 && !GOOGLE_CLIENT_IDS.includes(aud)) {
      return res.status(401).json({ success: false, message: "Google token audience mismatch." });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const rawUsername = (tokenInfo.name || email.split("@")[0]).replace(/\s+/g, "").toLowerCase();
      let username = rawUsername || email.split("@")[0];
      if (username.length < 3) {
        username = `${username}user`;
      }

      let uniqueUsername = username;
      let suffix = 0;
      while (await User.findOne({ username: uniqueUsername })) {
        suffix += 1;
        uniqueUsername = `${username}${suffix}`;
      }

      const randomPassword = Math.random().toString(36).slice(-10);

      user = await User.create({
        username: uniqueUsername,
        email,
        password: randomPassword,
        avatar: tokenInfo.picture || "",
      });
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

module.exports = { sendOTP, register, login, googleLogin };

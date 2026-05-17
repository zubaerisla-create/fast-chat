const express = require("express");
const { sendOTP, register, login } = require("../controllers/authController");

const router = express.Router();

// POST /api/auth/send-otp
router.post("/send-otp", sendOTP);

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/login
router.post("/login", login);

module.exports = router;

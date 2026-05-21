const nodemailer = require("nodemailer");
const dns = require("dns");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD || "lmps ztew idzv pxpu",
  },
  family: 4, // Force IPv4 to prevent IPv6 ENETUNREACH error
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback);
  },
});



const sendOTPEmail = async (toEmail, otp) => {
  if (!process.env.EMAIL_USER) {
    throw new Error("EMAIL_USER is not set in environment variables");
  }

  const mailOptions = {
    from: `"Fast Chat" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Fast Chat - Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Fast Chat!</h2>
        <p>Please use the verification code below to complete your registration:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("OTP Email sent successfully via Nodemailer: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
};


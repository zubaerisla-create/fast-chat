const sendOTPEmail = async (toEmail, otp) => {
  // DEBUG: log key presence (remove after fixing)
  const key = process.env.BREVO_SMTP_KEY || "";
  console.log("[DEBUG] BREVO_SMTP_KEY set:", !!key, "| Length:", key.length, "| Starts with:", key.substring(0, 8));
  console.log("[DEBUG] BREVO_SMTP_USER:", process.env.BREVO_SMTP_USER || "NOT SET");

  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) {
    throw new Error("BREVO_SMTP_USER or BREVO_SMTP_KEY is not set in environment variables");
  }

  const payload = {
    sender: { email: process.env.BREVO_SMTP_USER, name: "Fast Chat" },
    to: [{ email: toEmail }],
    subject: "Fast Chat - Verification Code",
    htmlContent: `
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
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_SMTP_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    const info = await response.json();
    console.log("OTP Email sent successfully via Brevo API. Message ID:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
};

const sendOTPEmail = async (toEmail, otp) => {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_USER || "noreply@fastchat.com";

  const payload = {
    sender: {
      name: "Fast Chat",
      email: senderEmail,
    },
    to: [
      {
        email: toEmail,
      },
    ],
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
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Brevo API Error:", errorData);
      throw new Error(`Failed to send email: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("OTP Email sent successfully via Brevo. Message ID:", data.messageId);
    return data;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
};

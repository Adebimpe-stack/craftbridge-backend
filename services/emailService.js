const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.ZEPTO_HOST,
  port: process.env.ZEPTO_PORT,
  secure: false,

  auth: {
    user: process.env.ZEPTO_EMAIL,
    pass: process.env.ZEPTO_PASSWORD,
  },
});

const sendVerificationEmail = async (email, token) => {
  const verifyLink = `https://craftbridgejobs.com/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`,
    to: email,
    subject: "Verify Your CraftBridge Jobs Account",

    html: `
      <div style="font-family:sans-serif;">
        <h2>Verify Your Email</h2>

        <p>
          Click the button below to verify your account.
        </p>

        <a
          href="${verifyLink}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#166534;
            color:white;
            text-decoration:none;
            border-radius:8px;
            margin-top:10px;
          "
        >
          Verify Email
        </a>
      </div>
    `,
  });
};

const sendResetPasswordEmail = async (email, token) => {
  const resetLink = `https://craftbridgejobs.com/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`,
    to: email,
    subject: "Reset Your Password",

    html: `
      <div style="font-family:sans-serif;">
        <h2>Password Reset</h2>

        <p>
          Click below to reset your password.
        </p>

        <a
          href="${resetLink}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#166534;
            color:white;
            text-decoration:none;
            border-radius:8px;
            margin-top:10px;
          "
        >
          Reset Password
        </a>
      </div>
    `,
  });
};

const sendInvitationEmail = async ({
  to,
  companyName,
  inviterName,
  role,
  token,
  expiryDate,
}) => {
  try {
    const acceptLink = `https://craftbridgejobs.com/invite/${token}`;

    const info = await transporter.sendMail({
      from: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`,
      to,
      subject: `You're invited to join ${companyName} on CraftBridge Jobs`,

      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto;">
          <h2 style="color:#166534;">You have been invited to join ${companyName} as a ${role} on CraftBridge Jobs.</h2>

          <p>
            <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> as a <strong>${role}</strong>.
          </p>

          <p style="color:#64748b;">
            This invitation will expire on ${expiryDate}.
          </p>

          <a
            href="${acceptLink}"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#166534;
              color:white;
              text-decoration:none;
              border-radius:8px;
              margin:20px 0;
              font-weight:600;
            "
          >
            Accept Invitation
          </a>

          <p style="color:#64748b; font-size:14px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>

          <p style="color:#64748b; font-size:12px; margin-top:30px;">
            Questions? Contact us at <a href="mailto:hire@craftbridgejobs.com" style="color:#166534;">hire@craftbridgejobs.com</a>
          </p>
        </div>
      `,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("INVITATION EMAIL ERROR:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendInvitationEmail,
};

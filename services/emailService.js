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

const sendVerificationEmail = async (
  email,
  token
) => {

  const verifyLink =
    `https://craftbridgejobs.com/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`,
    to: email,
    subject: "Verify Your Email",

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

const sendResetPasswordEmail = async (
  email,
  token
) => {

  const resetLink =
    `https://craftbridgejobs.com/reset-password?token=${token}`;

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

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
};

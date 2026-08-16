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

const sendWelcomeEmail = async ({ to, name, role }) => {
  try {
    const roleSpecificContent = {
      jobseeker: {
        title: "Welcome to CraftBridge Jobs!",
        message: "You're now part of Nigeria's leading platform for skilled professionals and service businesses.",
        cta: "Build Your Profile",
        link: "https://craftbridgejobs.com/profile",
        tips: [
          "Complete your professional profile to get noticed",
          "Upload your portfolio to showcase your work",
          "Set your availability and service preferences",
          "Browse job opportunities and service requests"
        ]
      },
      employer: {
        title: "Welcome to CraftBridge for Business!",
        message: "Start connecting with skilled professionals and grow your business.",
        cta: "Post Your First Job",
        link: "https://craftbridgejobs.com/post-job",
        tips: [
          "Complete your company profile",
          "Post job openings to find talent",
          "Browse skilled professionals",
          "Manage team members and invitations"
        ]
      },
      customer: {
        title: "Welcome to CraftBridge!",
        message: "Find trusted service providers for your needs.",
        cta: "Find Professionals",
        link: "https://craftbridgejobs.com/professionals",
        tips: [
          "Browse verified professionals",
          "Request services directly",
          "Save your favorite providers",
          "Track your service requests"
        ]
      }
    };

    const content = roleSpecificContent[role] || roleSpecificContent.jobseeker;

    const info = await transporter.sendMail({
      from: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`,
      to,
      subject: `Welcome to CraftBridge Jobs, ${name}!`,

      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto; background:#f8fafc; padding:40px 20px;">
          <div style="background:white; border-radius:16px; padding:40px; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
            <h1 style="color:#166534; margin-bottom:15px; font-size:32px;">${content.title}</h1>
            
            <p style="color:#475569; font-size:16px; line-height:1.7; margin-bottom:20px;">
              Hi ${name},
            </p>
            
            <p style="color:#475569; font-size:16px; line-height:1.7; margin-bottom:25px;">
              ${content.message}
            </p>

            <a
              href="${content.link}"
              style="
                display:inline-block;
                padding:14px 28px;
                background:#166534;
                color:white;
                text-decoration:none;
                border-radius:10px;
                margin:20px 0;
                font-weight:600;
                font-size:16px;
              "
            >
              ${content.cta}
            </a>

            <div style="margin-top:35px; padding:25px; background:#f1f5f9; border-radius:12px;">
              <h3 style="color:#166534; margin-bottom:15px; font-size:18px;">Getting Started Tips:</h3>
              <ul style="color:#475569; line-height:1.8; padding-left:20px;">
                ${content.tips.map(tip => `<li style="margin-bottom:8px;">${tip}</li>`).join('')}
              </ul>
            </div>

            <p style="margin-top:30px; color:#64748b; font-size:14px; line-height:1.6;">
              Need help? Contact our support team at <a href="mailto:support@craftbridgejobs.com" style="color:#166534;">support@craftbridgejobs.com</a>
            </p>

            <hr style="margin:30px 0; border:none; border-top:1px solid #e2e8f0;" />

            <p style="color:#94a3b8; font-size:12px;">
              © 2026 CraftBridge Jobs. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("WELCOME EMAIL ERROR:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
};

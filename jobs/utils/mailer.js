const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async ({ to, subject, text }) => {
  try {
    await transporter.sendMail({
      from: `"CraftBridge" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text
    });

    console.log("Email sent to:", to);
  } catch (err) {
    console.log("Email error:", err.message);
  }
};

module.exports = sendEmail;

const express =
  require("express");

const bcrypt =
  require("bcryptjs");

const jwt =
  require("jsonwebtoken");

const crypto =
  require("crypto");

const router =
  express.Router();

const User =
  require("../models/User");

const sendEmail =
  require("../utils/sendEmail");

// ==============================
// REGISTER
// ==============================

router.post(
  "/register",

  async (req, res) => {

    try {

      const {
        name,
        email,
        password,
        role,
      } = req.body;

      // CHECK EXISTING USER
      const existingUser =
        await User.findOne({
          email,
        });

      if (existingUser) {

        return res
          .status(400)
          .json({

            message:
              "User already exists",

          });

      }

      // HASH PASSWORD
      const salt =
        await bcrypt.genSalt(10);

      const hashedPassword =
        await bcrypt.hash(
          password,
          salt
        );

      // CREATE USER
      const user =
        await User.create({

          name,

          email,

          password:
            hashedPassword,

          role,

          isVerified:
            false,

        });

      // CREATE VERIFICATION TOKEN
      const verificationToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      user.emailVerificationToken =
        verificationToken;

      await user.save();

      // VERIFY URL
      const verifyUrl =
        `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

      // SEND EMAIL
      await sendEmail({

        to: email,

        subject:
          "Verify Your CraftBridge Jobs Account",

        html: `

          <div
            style="
              background:#f8fafc;
              padding:40px 20px;
              font-family:Arial,sans-serif;
            "
          >

            <div
              style="
                max-width:520px;
                margin:auto;
                background:white;
                border-radius:16px;
                padding:40px;
                box-shadow:
                  0 10px 30px rgba(0,0,0,0.05);
                text-align:left;
              "
            >

              <h1
                style="
                  color:#166534;
                  margin-bottom:10px;
                  font-size:32px;
                "
              >
                Welcome to CraftBridge Jobs
              </h1>

              <p
                style="
                  color:#475569;
                  font-size:16px;
                  line-height:1.7;
                "
              >
                Thank you for creating
                your account.
              </p>

              <p
                style="
                  color:#475569;
                  font-size:16px;
                  line-height:1.7;
                "
              >
                Please verify your
                email address to
                activate your account
                and continue using
                the platform.
              </p>

              <a
                href="${verifyUrl}"

                style="
                  display:inline-block;
                  margin-top:25px;
                  background:#166534;
                  color:white;
                  text-decoration:none;
                  padding:14px 24px;
                  border-radius:10px;
                  font-weight:600;
                  font-size:15px;
                "
              >
                Verify Email
              </a>

              <p
                style="
                  margin-top:35px;
                  color:#94a3b8;
                  font-size:13px;
                  line-height:1.6;
                "
              >
                If you didn’t create a
                CraftBridge account,
                you can safely ignore
                this email.
              </p>

              <hr
                style="
                  margin:30px 0;
                  border:none;
                  border-top:1px solid #e2e8f0;
                "
              />

              <p
                style="
                  color:#94a3b8;
                  font-size:12px;
                "
              >
                © 2026 CraftBridge Jobs
              </p>

            </div>

          </div>

        `,

      });

      return res
        .status(201)
        .json({

          message:
            "Account created successfully. Please check your email to verify your account.",

        });

    } catch (error) {

      console.log(
        "REGISTER ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          message:
            "Server error",

        });

    }

  }
);

// ==============================
// VERIFY EMAIL
// ==============================

router.get(
  "/verify-email",

  async (req, res) => {

    try {

      const { token } =
        req.query;

      if (!token) {

        return res
          .status(400)
          .json({

            message:
              "Invalid verification token",

          });

      }

      const user =
        await User.findOne({

          emailVerificationToken:
            token,

        });

      if (!user) {

        return res
          .status(400)
          .json({

            message:
              "Invalid or expired verification link",

          });

      }

      user.isVerified =
        true;

      user.emailVerificationToken =
        undefined;

      await user.save();

      return res
        .status(200)
        .json({

          message:
            "Email verified successfully",

        });

    } catch (error) {

      console.log(
        "VERIFY EMAIL ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          message:
            "Server error",

        });

    }

  }
);

// ==============================
// LOGIN
// ==============================

router.post(

  "/login",

  async (req, res) => {

    try {

      const {
        email,
        password,
      } = req.body;

      // FIND USER
      const user =
        await User.findOne({
          email,
        });

      if (!user) {

        return res
          .status(400)
          .json({

            message:
              "Invalid credentials",

          });

      }

      // CHECK PASSWORD
      const isMatch =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!isMatch) {

        return res
          .status(400)
          .json({

            message:
              "Invalid credentials",

          });

      }

      // CHECK VERIFIED
      if (!user.isVerified) {

        return res
          .status(400)
          .json({

            message:
              "Please verify your email before logging in.",

          });

      }

// CHECK ACCOUNT STATUS
if (user.accountStatus === "suspended") {

  return res
    .status(403)
    .json({

      message:
        "Your account has been suspended. Please contact support.",

    });

}
      // CREATE TOKEN
      const token =
        jwt.sign(

          {
            id: user._id,
          },

          process.env.JWT_SECRET,

          {
            expiresIn: "7d",
          }

        );

      return res
        .status(200)
        .json({

          token,

          user: {

            _id:
              user._id,

            name:
              user.name,

            email:
              user.email,

            role:
              user.role,

          },

        });

    } catch (error) {

      console.log(
        "LOGIN ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          message:
            "Server error",

        });

    }

  }

);

// ==============================
// FORGOT PASSWORD
// ==============================

router.post(

  "/forgot-password",

  async (req, res) => {

    try {

      const { email } =
        req.body;

      const user =
        await User.findOne({
          email,
        });

      if (!user) {

        return res
          .status(200)
          .json({

            message:
              "If an account exists with this email, a reset link has been sent.",

          });

      }

      // GENERATE RESET TOKEN
      const resetToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      user.resetPasswordToken =
        resetToken;

      await user.save();

      // RESET LINK
      const resetLink =
        `https://craftbridgejobs.com/reset-password?token=${resetToken}`;

      // SEND EMAIL
      await sendEmail({

        to: user.email,

        subject:
          "Reset Your Password",

        html: `

          <div style="font-family: Arial; padding: 20px;">

            <h2>
              Reset Your Password
            </h2>

            <p>
              Click the button below to reset your password.
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
              "
            >
              Reset Password
            </a>

          </div>

        `,

      });

      return res
        .status(200)
        .json({

          message:
            "Reset link sent successfully.",

        });

    } catch (error) {

      console.log(
        "FORGOT PASSWORD ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          message:
            "Server error",

        });

    }

  }

);

// ==============================
// RESET PASSWORD
// ==============================

router.post(

  "/reset-password",

  async (req, res) => {

    try {

      const {
        token,
        password,
      } = req.body;

      const user =
        await User.findOne({

          resetPasswordToken:
            token,

        });

      if (!user) {

        return res
          .status(400)
          .json({

            message:
              "Invalid or expired token",

          });

      }

      // CHECK IF SAME PASSWORD
      const isSamePassword =
        await bcrypt.compare(
          password,
          user.password
        );

      if (isSamePassword) {

        return res
          .status(400)
          .json({

            message:
              "New password cannot be the same as the old password.",

          });

      }

      // HASH NEW PASSWORD
      const salt =
        await bcrypt.genSalt(10);

      user.password =
        await bcrypt.hash(
          password,
          salt
        );

      user.resetPasswordToken =
        undefined;

      await user.save();

      return res
        .status(200)
        .json({

          message:
            "Password reset successful",

        });

    } catch (error) {

      console.log(
        "RESET PASSWORD ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          message:
            "Server error",

        });

    }

  }

);

module.exports =
  router;

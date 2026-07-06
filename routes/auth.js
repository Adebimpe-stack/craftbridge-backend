const express = require("express");
const Company = require("../models/Company");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const router = express.Router();
const User = require("../models/User");
const TeamInvitation = require("../models/TeamInvitation");
const sendEmail = require("../utils/sendEmail");



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
        invitationToken,
        companyType,
        companyName,
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

      // Check if registering with invitation token
      let invitation = null;
      if (invitationToken) {
        invitation = await TeamInvitation.findOne({ token: invitationToken });
        if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
          return res.status(400).json({
            message: "Invalid or expired invitation token"
          });
        }
        if (invitation.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({
            message: "Invitation email does not match registration email"
          });
        }
      }

      // CREATE USER
      const user =
        await User.create({

          name,

          email,

          password:
            hashedPassword,

          role: invitation ? "employer" : (role || "jobseeker"),

          isVerified:
            false,

        });

      // If registering via invitation, join the company
      if (invitation) {
        await User.findByIdAndUpdate(
          user._id,
          { companyId: invitation.company, companyRole: invitation.role, role: "employer" },
          { runValidators: false }
        );

        // Update company team members
        const company = await Company.findById(invitation.company);
        if (!company.teamMembers.includes(user._id)) {
          company.teamMembers.push(user._id);
          await company.save();
        }

        // Update invitation status
        invitation.status = "accepted";
        invitation.acceptedAt = new Date();
        await invitation.save();
      } else if (role === "employer") {
        // Regular employer registration creates a new company
        const company =
          await Company.create({

            name: companyName || name,

            owner: user._id,

            teamMembers: [
              user._id,
            ],

            createdBy:
              user._id,

            businessType: companyType || "",

          });

        await User.findByIdAndUpdate(
          user._id,
          { companyId: company._id, companyRole: "owner" },
          { runValidators: false }
        );

      }


      // CREATE VERIFICATION TOKEN
      const verificationToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      await User.findByIdAndUpdate(
        user._id,
        { emailVerificationToken: verificationToken },
        { runValidators: false }
      );

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
                If you didn't create a
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

      const response = {
        message: "Account created successfully. Please check your email to verify your account.",
      };

      if (invitation) {
        response.joinedCompany = true;
        response.companyId = user.companyId;
        response.companyRole = user.companyRole;
      }

      return res
        .status(201)
        .json(response);

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

      await User.findByIdAndUpdate(
        user._id,
        { isVerified: true, emailVerificationToken: undefined },
        { runValidators: false }
      );

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

    const requestStart = Date.now();
    const { email, password } = req.body;
    const normalizedEmail = (email || "").toLowerCase().trim();

    console.log(`[LOGIN LIFECYCLE] Route entered for ${normalizedEmail || "unknown"} at ${requestStart}`);

    res.on("finish", () => {
      console.log(`[LOGIN LIFECYCLE] Response finished for ${normalizedEmail || "unknown"} in ${Date.now() - requestStart}ms`);
    });

    res.on("close", () => {
      console.log(`[LOGIN LIFECYCLE] Response connection closed for ${normalizedEmail || "unknown"} in ${Date.now() - requestStart}ms`);
    });

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    try {
      // FIND USER
      const findUserStart = Date.now();
      console.log(`[LOGIN LIFECYCLE] User.findOne starting for ${normalizedEmail}`);
      const user = await User.findOne({
        email: normalizedEmail,
      }).select("_id name email password role companyId companyRole isVerified isCompanyVerified accountStatus workerVerificationStatus verificationStatus");
      const findUserEnd = Date.now();
      console.log(`[LOGIN LIFECYCLE] User.findOne finished for ${normalizedEmail} in ${findUserEnd - findUserStart}ms (timestamp: ${findUserEnd})`);

      if (!user) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      // CHECK PASSWORD
      const bcryptStart = Date.now();
      console.log(`[LOGIN LIFECYCLE] bcrypt.compare starting for ${normalizedEmail}`);
      const isMatch = await bcrypt.compare(password, user.password);
      const bcryptEnd = Date.now();
      console.log(`[LOGIN LIFECYCLE] bcrypt.compare finished for ${normalizedEmail} in ${bcryptEnd - bcryptStart}ms (timestamp: ${bcryptEnd})`);

      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      // CHECK ACCOUNT STATUS BEFORE EMAIL VERIFICATION
      // so suspended/deactivated users see the correct message
      if (user.accountStatus === "suspended") {
        return res.status(403).json({
          message: "Your account has been suspended. Please contact support.",
        });
      }

      if (user.accountStatus === "deactivated") {
        return res.status(403).json({
          message: "Your account has been deactivated. Contact admin.",
        });
      }

      // CHECK VERIFIED
      if (!user.isVerified) {
        return res.status(400).json({
          message: "Please verify your email before logging in.",
        });
      }

      // CREATE TOKEN
      const jwtStart = Date.now();
      console.log(`[LOGIN LIFECYCLE] jwt.sign starting for ${normalizedEmail}`);
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      const jwtEnd = Date.now();
      console.log(`[LOGIN LIFECYCLE] jwt.sign finished for ${normalizedEmail} in ${jwtEnd - jwtStart}ms (timestamp: ${jwtEnd})`);

      // Prepare minimal user response
      const userResponse = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        accountStatus: user.accountStatus,
      };

      if (user.role === "jobseeker") {
        userResponse.workerVerificationStatus = user.workerVerificationStatus;
      }

      if (user.role === "employer" && user.companyId) {
        userResponse.companyId = user.companyId;
        userResponse.companyRole = user.companyRole;
        userResponse.companyVerificationStatus = user.verificationStatus;
        userResponse.isCompanyVerified = user.isCompanyVerified;
        // Subscription data is loaded by the company-profile endpoint; defaults prevent UI breakage
        userResponse.hasActiveSubscription = false;
        userResponse.subscriptionActive = false;
        userResponse.subscriptionPlan = "free";
        userResponse.subscriptionExpiry = null;
      }

      // Return authentication response immediately
      console.log(`[LOGIN LIFECYCLE] Calling res.json for ${normalizedEmail} at ${Date.now()}`);
      res.status(200).json({ token, user: userResponse });
      console.log(`[LOGIN LIFECYCLE] res.json returned for ${normalizedEmail} at ${Date.now()} (total: ${Date.now() - requestStart}ms)`);

      // Non-critical work: update last login asynchronously after response is sent
      const lastLoginStart = Date.now();
      console.log(`[LOGIN LIFECYCLE] Async lastLogin update starting for ${normalizedEmail}`);
      User.updateOne({ _id: user._id }, { lastLogin: new Date() })
        .then(() => {
          console.log(`[LOGIN LIFECYCLE] Async lastLogin update finished for ${normalizedEmail} in ${Date.now() - lastLoginStart}ms`);
        })
        .catch((err) => {
          console.error(`[LOGIN LIFECYCLE] lastLogin update failed for ${normalizedEmail}:`, err.message);
        });

    } catch (error) {
      console.log("LOGIN ERROR:", error);
      return res.status(500).json({ message: "Server error" });
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

      await User.findByIdAndUpdate(
        user._id,
        { resetPasswordToken: resetToken },
        { runValidators: false }
      );

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

      const hashedPassword =
        await bcrypt.hash(
          password,
          salt
        );

      await User.findByIdAndUpdate(
        user._id,
        { password: hashedPassword, resetPasswordToken: undefined },
        { runValidators: false }
      );

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

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["jobseeker", "employer", "admin"],
      default: "jobseeker",
    },

    // =========================
    // PAID JOB POST FLAG
    // =========================
    hasPaidJobPost: {
      type: Boolean,
      default: false,
    },

    // =========================
    // OPTIONAL PROFILE FIELDS
    // =========================
    companyName: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    resume: {
      type: String,
      default: "",
    },

    // =========================
    // EMAIL VERIFICATION
    // =========================
    isVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      default: "",
    },

    // =========================
    // RESET PASSWORD
    // =========================
    resetPasswordToken: {
      type: String,
      default: "",
    },

    resetPasswordExpires: {
      type: Date,
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);

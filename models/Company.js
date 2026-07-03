const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    website: {
      type: String,
      default: "",
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Company verification status
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    verificationDocuments: [
      {
        type: String,
      },
    ],

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    // Business type (set at registration)
    businessType: {
      type: String,
      default: "",
    },

    // Company details
    industry: {
      type: String,
    },

    companySize: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "500+"],
    },

    location: {
      type: String,
    },

    cacNumber: {
      type: String,
    },

    // Job posting limits
    subscriptionPlan: {
      type: String,
      enum: ["free", "basic", "premium"],
      default: "free",
    },

    jobsPosted: {
      type: Number,
      default: 0,
    },

    subscriptionActive: {
      type: Boolean,
      default: false,
    },

    subscriptionExpiry: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);

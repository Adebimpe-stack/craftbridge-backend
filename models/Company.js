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

    // Employer Favourites with Notes
    favoriteProfessionals: [
      {
        professional: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        notes: { type: String, trim: true },
      }
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Company verification status
    verificationStatus: {
      type: String,
      enum: ["none", "pending", "verified", "rejected", "revoked", "info_requested"],
      default: "none",
    },

    verificationDocuments: [
      {
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    documentsApproved: {
      type: Boolean,
      default: false,
    },

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

    companyType: {
      type: String,
      enum: ["employer", "agency"],
      default: "employer",
    },

    location: {
      type: String,
    },

    cacNumber: {
      type: String,
    },

    companyEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // Company status
    isActive: {
      type: Boolean,
      default: true,
    },

    deactivatedAt: {
      type: Date,
    },

    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Deactivation/Reactivation request
    deactivationRequest: {
      requestType: { type: String, enum: ["deactivation", "reactivation"] },
      reason: String,
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      requestedAt: Date,
      status: { type: String, enum: ["pending", "approved", "rejected"] },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      rejectionReason: String,
    },

    // Type change request
    typeChangeRequest: {
      requestedType: String,
      currentType: String,
      reason: String,
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      requestedAt: Date,
      status: { type: String, enum: ["pending", "approved", "rejected"] },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      rejectionReason: String,
    },

    // Deletion request
    deletionRequest: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      requestedAt: Date,
      status: { type: String, enum: ["pending", "approved", "rejected"] },
      scheduledFor: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      approvedAt: Date,
      rejectionReason: String,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    reportsReceived: {
      type: Number,
      default: 0,
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

companySchema.virtual("age").get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("Company", companySchema);

const mongoose = require("mongoose");

const businessApplicationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    coverLetter: {
      type: String,
      required: true,
    },

    availability: {
      type: String,
      default: "",
    },

    expectedRate: {
      type: String,
      default: "",
    },

    portfolioLink: {
      type: String,
      default: "",
    },

    skills: [{
      type: String,
    }],

    status: {
      type: String,
      enum: [
        "pending",
        "reviewed",
        "accepted",
        "declined",
      ],
      default: "pending",
    },

    declineReason: {
      type: String,
      default: "",
    },

    acceptedAt: {
      type: Date,
    },

    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate applications from same professional to same business
businessApplicationSchema.index({ business: 1, professional: 1 }, { unique: true });

module.exports = mongoose.model("BusinessApplication", businessApplicationSchema);
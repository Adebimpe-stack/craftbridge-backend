const mongoose = require("mongoose");

const serviceRequestSchema = new mongoose.Schema(
  {
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },

    serviceType: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    preferredDate: {
      type: Date,
    },

    budget: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "completed"],
      default: "pending",
    },

    declineReason: {
      type: String,
      trim: true,
    },

    acceptedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);

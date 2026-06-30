const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    requestedRole: {
      type: String,
      enum: ["recruiter", "admin"],
      default: "recruiter",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    message: {
      type: String,
      default: "",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AccessRequest",
  accessRequestSchema
);

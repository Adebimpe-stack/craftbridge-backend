const mongoose = require("mongoose");

const moderationLogSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId, // Can be a Report ID
      required: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "Warn Employer",
        "Suspend Employer",
        "Restore Employer",
        "Reject Report",
        "Resolve Report",
        "Change Status",
      ],
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    notes: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ModerationLog", moderationLogSchema);
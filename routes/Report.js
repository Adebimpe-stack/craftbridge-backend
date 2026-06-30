const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ["Job", "Company", "User"],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "targetType",
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "Scam",
        "Fake Company",
        "Fake Job",
        "Duplicate Job",
        "Spam",
        "Harassment",
        "Other",
      ],
    },
    comments: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Under Review", "Resolved", "Rejected"],
      default: "Pending",
    },
    resolutionDetails: {
      actionTaken: String,
      notes: String,
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      resolvedAt: Date,
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("Report", reportSchema);
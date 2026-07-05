const mongoose = require("mongoose");

const verificationLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["worker", "employer", "business"],
      required: true,
    },

    action: {
      type: String,
      enum: [
        "status_change",
        "note",
        "request_info",
        "document_upload",
        "document_delete",
        "submit",
        "resubmit",
      ],
      required: true,
    },

    fromStatus: {
      type: String,
    },

    toStatus: {
      type: String,
    },

    reason: {
      type: String,
      default: "",
    },

    note: {
      type: String,
      default: "",
    },

    requestedInfo: {
      type: String,
      default: "",
    },

    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VerificationLog", verificationLogSchema);

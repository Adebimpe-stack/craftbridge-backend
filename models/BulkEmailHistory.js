const mongoose = require("mongoose");

const failedRecipientSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Unknown user" },
    email: { type: String, required: true },
  },
  { _id: false }
);

const bulkEmailHistorySchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    recipientGroup: { type: String, required: true, trim: true },
    numberSelected: { type: Number, required: true, min: 0 },
    numberSent: { type: Number, required: true, min: 0 },
    numberFailed: { type: Number, required: true, min: 0 },
    failedRecipients: { type: [failedRecipientSchema], default: [] },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

bulkEmailHistorySchema.index({ createdAt: -1 });
bulkEmailHistorySchema.index({ recipientGroup: 1, createdAt: -1 });

module.exports = mongoose.model("BulkEmailHistory", bulkEmailHistorySchema);

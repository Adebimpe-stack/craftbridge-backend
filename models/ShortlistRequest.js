const mongoose = require("mongoose");

// An employer asking us to source a shortlist for them. Deliberately open to
// logged-out visitors, since the point is to keep the directory private while
// staying reachable, so `requestedBy` is only set when a session exists.
const shortlistRequestSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    hires: {
      type: String,
      trim: true,
    },

    details: {
      type: String,
      trim: true,
    },

    contactName: {
      type: String,
      required: true,
      trim: true,
    },

    company: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["new", "in_progress", "delivered", "closed"],
      default: "new",
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

shortlistRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ShortlistRequest", shortlistRequestSchema);

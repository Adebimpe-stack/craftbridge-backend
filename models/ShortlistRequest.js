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

    // Broad capability sector the visitor picked on the catalog page.
    sector: {
      type: String,
      trim: true,
    },

    // "professional" when they asked for a technician, "business" for a company.
    recipientType: {
      type: String,
      enum: ["professional", "business"],
      default: "professional",
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

    // The catalog form collects an email; the localized landing pages collect a
    // phone number instead, so one of the two is required rather than both.
    email: {
      type: String,
      required: function () {
        return !this.phone;
      },
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    // Which surface produced the lead: the sector catalog or a
    // [trade]/[location] landing page.
    source: {
      type: String,
      enum: ["catalog", "local_page"],
      default: "catalog",
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

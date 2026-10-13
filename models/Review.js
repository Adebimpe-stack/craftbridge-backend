const mongoose = require("mongoose");

/**
 * A client's rating of a professional. Only someone who contacted the
 * professional through CraftBridge can leave one: the review is tied to that
 * contact's reference code and the phone number the client gave at the time.
 */
const reviewSchema = new mongoose.Schema(
  {
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutboundClick",
      required: true,
      unique: true,
    },
    refCode: { type: String, required: true, index: true },
    clientName: { type: String, default: "", trim: true },
    // Never returned publicly; kept so one client can't review the same
    // professional twice through separate contacts.
    clientPhone: { type: String, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    hired: { type: Boolean, default: false },
    comment: { type: String, default: "", trim: true, maxlength: 600 },
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
      index: true,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ professional: 1, clientPhone: 1 });
reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);

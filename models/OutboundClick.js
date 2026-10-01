const mongoose = require("mongoose");

/**
 * One outbound contact click: a visitor leaving CraftBridge for an artisan's
 * WhatsApp or dialler. Transactions happen off-platform, so these rows are the
 * only record of the value the directory delivered.
 *
 * Written from an unauthenticated endpoint, so every field is denormalised —
 * the trade and page are stored as they were at click time and stay correct
 * even if the artisan later edits their profile.
 */
const outboundClickSchema = new mongoose.Schema(
  {
    artisan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    artisanName: { type: String, default: "" },
    artisanTrade: { type: String, default: "", index: true },
    targetLocationPage: { type: String, default: "", index: true },
    type: {
      type: String,
      enum: ["whatsapp_click", "phone_call_click"],
      required: true,
      index: true,
    },
    // Who made contact. Clients leave a name and phone number before the
    // WhatsApp or call link is revealed, and the reference code travels in the
    // WhatsApp message so either side can quote it in a report.
    clientName: { type: String, default: "", trim: true },
    clientPhone: { type: String, default: "", index: true },
    refCode: { type: String, index: true },
    referrer: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

outboundClickSchema.index({ createdAt: -1 });

module.exports = mongoose.model("OutboundClick", outboundClickSchema);

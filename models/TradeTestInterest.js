const mongoose = require("mongoose");

// Someone asking to be put forward to the Federal Trade Test office for an
// official trade test or training. `consentAt` records when they agreed to
// CraftBridge sharing these details with that office.
const tradeTestInterestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    trade: { type: String, required: true, trim: true },
    area: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 500 },
    consentAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["new", "shared", "closed"],
      default: "new",
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

tradeTestInterestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("TradeTestInterest", tradeTestInterestSchema);

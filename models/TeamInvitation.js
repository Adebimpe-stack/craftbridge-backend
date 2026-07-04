const mongoose = require("mongoose");
const crypto = require("crypto");

const teamInvitationSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    role: {
      type: String,
      enum: ["admin", "recruiter"],
      required: true,
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    acceptedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Generate secure token before saving
teamInvitationSchema.pre("save", function(next) {
  if (!this.token) {
    this.token = crypto.randomBytes(32).toString("hex");
  }
  next();
});

// Index for efficient lookups
teamInvitationSchema.index({ email: 1, company: 1, status: 1 });
teamInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("TeamInvitation", teamInvitationSchema);

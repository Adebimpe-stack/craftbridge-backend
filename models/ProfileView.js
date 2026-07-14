const mongoose = require("mongoose");

const profileViewSchema = new mongoose.Schema(
  {
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    viewerType: {
      type: String,
      enum: ["guest", "employer", "company"],
      default: "guest",
      index: true,
    },
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    viewerIp: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      default: "public_directory",
    },
  },
  { timestamps: true }
);

profileViewSchema.index({ professional: 1, createdAt: -1 });
profileViewSchema.index({ professional: 1, viewer: 1, createdAt: -1 });

module.exports = mongoose.model("ProfileView", profileViewSchema);

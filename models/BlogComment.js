const mongoose = require("mongoose");

const blogCommentSchema = new mongoose.Schema(
  {
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
      required: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogComment",
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "spam"],
      default: "pending",
    },

    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],

    likeCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
blogCommentSchema.index({ blog: 1, status: 1, createdAt: -1 });
blogCommentSchema.index({ author: 1 });
blogCommentSchema.index({ parentComment: 1 });

module.exports = mongoose.model("BlogComment", blogCommentSchema);
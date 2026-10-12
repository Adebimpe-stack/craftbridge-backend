const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
    },

    excerpt: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: ["hiring", "safety", "technical", "industry", "career", "news"],
      default: "technical",
    },

    tags: [{
      type: String,
    }],

    featuredImage: {
      type: String,
      default: "",
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    inlineCallout: {
      enabled: {
        type: Boolean,
        default: true,
      },
      position: {
        type: Number,
        default: 50, // Percentage through content (0-100)
      },
      text: {
        type: String,
        default: "Are you a technician or tradesperson? Get found by clients near you on CraftBridge.",
      },
      ctaLink: {
        type: String,
        default: "/register?type=professional",
      },
      backgroundColor: {
        type: String,
        default: "#166534",
      },
      textColor: {
        type: String,
        default: "#ffffff",
      },
    },

    sidebarWidget: {
      enabled: {
        type: Boolean,
        default: true,
      },
      title: {
        type: String,
        default: "Need a professional?",
      },
      description: {
        type: String,
        default: "Browse electricians, plumbers, technicians and more near you, or post a custom request.",
      },
      ctaText: {
        type: String,
        default: "Explore Trades",
      },
      ctaLink: {
        type: String,
        default: "/explore-trades",
      },
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },

    publishedAt: {
      type: Date,
    },

    seoTitle: {
      type: String,
    },

    seoDescription: {
      type: String,
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    commentCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for search functionality
blogSchema.index({ title: "text", content: "text", tags: "text" });
blogSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model("Blog", blogSchema);
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  status: {
    type: String,
    enum: ["pending", "shortlisted", "rejected", "hired"],
    default: "pending",
  },

  resume: {
    type: String, // file URL or file path
  },

  appliedAt: {
    type: Date,
    default: Date.now,
  },
});

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: String,

    location: {
      type: String,
      default: "Remote",
    },

    type: {
      type: String,
      default: "Full-time",
    },

    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    applications: [applicationSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);

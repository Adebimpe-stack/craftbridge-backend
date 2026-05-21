// =========================
// models/Job.js
// FULL UPDATED CODE
// =========================

const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  status: {
    type: String,
    default: "pending",
  },

  resume: {
    type: String,
    default: null,
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

    description: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      required: true,
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

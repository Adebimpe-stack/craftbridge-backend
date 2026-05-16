const mongoose = require("mongoose");

const applicantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
});

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    requirements: {
      type: Array,
      default: [],
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    employerEmail: {
      type: String,
    },

    applicants: [applicantSchema],

    // AUTO EXPIRY
    expiresAt: {
      type: Date,
    },

    expired: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);

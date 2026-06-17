const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    resume: {
      type: String,
      default: "",
    },

    coverLetter: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "reviewed",
        "interview",
        "rejected",
        "hired",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.model(
    "Application",
    applicationSchema
  );

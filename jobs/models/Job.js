const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "pending" },
  appliedAt: { type: Date, default: Date.now },
});

const jobSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    location: String,
    type: String,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    applications: [applicationSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);

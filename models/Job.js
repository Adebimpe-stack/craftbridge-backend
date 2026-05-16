const mongoose = require("mongoose");

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

    salary: {
      currency: {
        type: String,
        default: "NGN",
      },
      amount: Number,
    },

    requirements: {
      type: [String],
      default: [],
    },

    // ✅ NEW: applicants list
    applicants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);

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

    category: {
      type: String,
      required: true,
    },

    field: {
      type: String,
    },

    location: {
      type: String,
      required: true,
    },

    workMode: {
      type: String,
      enum: [
        "Onsite",
        "Remote",
        "Hybrid",
      ],
      default: "Onsite",
    },

    salary: {
      type: String,
    },

    type: {
      type: String,
    },

    experienceLevel: {
      type: String,
    },

    vacancies: {
      type: Number,
      default: 1,
    },

    applicationDeadline: {
      type: Date,
    },

    description: {
      type: String,
      required: true,
    },

    requirements: {
      type: String,
    },

    benefits: {
      type: String,
    },

    status: {
      type: String,
      enum: [
        "active",
        "closed",
        "suspended",
      ],
      default: "active",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },

    applications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Application",
      },
    ],

    isPriority: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);

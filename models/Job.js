const mongoose = require("mongoose");

const jobSchema =
  new mongoose.Schema(

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
        ],
        default: "active",
      },

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      company: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },

      applications: [

        {
          type:
            mongoose.Schema.Types.ObjectId,

          ref:
            "Application",
        },

      ],

    },

    {
      timestamps: true,
    }

  );

module.exports =
  mongoose.model(
    "Job",
    jobSchema
  );

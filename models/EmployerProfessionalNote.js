const mongoose = require("mongoose");

const employerProfessionalNoteSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["company", "user"],
      required: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "ownerType",
    },

    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    note: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (tags) {
          return tags.every((t) => typeof t === "string" && t.length <= 50);
        },
        message: "Each tag must be a string of 50 characters or less.",
      },
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    isSaved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// One note per employer/professional relationship
employerProfessionalNoteSchema.index(
  { ownerType: 1, ownerId: 1, professional: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "EmployerProfessionalNote",
  employerProfessionalNoteSchema
);

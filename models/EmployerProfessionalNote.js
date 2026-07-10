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
      required: true,
      trim: true,
      maxlength: 5000,
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

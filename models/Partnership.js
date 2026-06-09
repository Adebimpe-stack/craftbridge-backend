const mongoose = require("mongoose");

const partnershipSchema = new mongoose.Schema(
  {
    organizationName: {
      type: String,
      required: true,
    },
    contactName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: String,
    partnershipType: String,
    organizationInfo: String,
    partnershipInterest: String,
    status: {
      type: String,
      default: "New",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Partnership",
  partnershipSchema
);

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,

  email: {
    type: String,
    unique: true
  },

  password: String,

  role: {
    type: String,
    enum: ["user", "employer", "admin"],
    default: "user"
  },

  /* =========================
     SUBSCRIPTION SYSTEM (30 DAYS)
  ========================= */

  subscription: {
    plan: {
      type: String,
      default: "free" // free | paid
    },

    isActive: {
      type: Boolean,
      default: false
    },

    startDate: Date,

    expiresAt: Date
  },

  /* =========================
     JOB LIMIT (FREE USERS ONLY)
  ========================= */

  freeJobUsed: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model("User", userSchema);

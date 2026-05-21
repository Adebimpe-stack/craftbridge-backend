const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,

  role: {
    type: String,
    enum: ["user", "employer", "admin"],
    default: "user",
  },

  subscription: {
    plan: { type: String, default: "free" },
    isActive: { type: Boolean, default: false },
    startDate: Date,
    expiresAt: Date,
  },
});

module.exports = mongoose.model("User", userSchema);

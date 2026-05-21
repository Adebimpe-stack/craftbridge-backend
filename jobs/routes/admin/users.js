const express = require("express");
const router = express.Router();

const User = require("../../models/User");
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");

/* =========================
   GET ALL USERS
========================= */
router.get("/", auth, role(["admin"]), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

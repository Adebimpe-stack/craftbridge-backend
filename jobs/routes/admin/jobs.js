const express = require("express");
const router = express.Router();

const Job = require("../../models/Job");
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");

/* =========================
   GET ALL JOBS
========================= */
router.get("/", auth, role(["admin"]), async (req, res) => {
  try {
    const jobs = await Job.find().populate("createdBy", "name email");
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

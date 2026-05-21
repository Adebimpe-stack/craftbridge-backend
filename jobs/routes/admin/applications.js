const express = require("express");
const router = express.Router();

const Job = require("../../models/Job");
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");

/* =========================
   GET ALL APPLICATIONS
========================= */
router.get("/", auth, role(["admin"]), async (req, res) => {
  try {
    const jobs = await Job.find().populate("applications.userId", "name email");

    const applications = jobs.flatMap((job) =>
      (job.applications || []).map((app) => ({
        jobTitle: job.title,
        user: app.userId,
        status: app.status,
      }))
    );

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

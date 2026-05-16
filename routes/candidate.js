const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Job = require("../models/Job");

// GET ALL JOBS APPLIED BY USER
router.get("/applications", auth, async (req, res) => {
  try {
    const jobs = await Job.find({
      "applicants.userId": req.user.id,
    });

    const applications = jobs.map((job) => {
      const myApp = job.applicants.find(
        (a) => a.userId.toString() === req.user.id
      );

      return {
        jobId: job._id,
        title: job.title,
        location: job.location,
        description: job.description,
        status: myApp?.status || "pending",
      };
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

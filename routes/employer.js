const router = require("express").Router();
const auth = require("../middleware/auth");
const Job = require("../models/Job");

// GET EMPLOYER STATS
router.get("/stats", auth, async (req, res) => {
  try {
    const jobs = await Job.find({ createdBy: req.user.id });

    const totalJobs = jobs.length;

    const totalApplicants = jobs.reduce(
      (sum, job) => sum + (job.applicants?.length || 0),
      0
    );

    const activeJobs = jobs.filter(job => job.status !== "closed").length;

    res.json({
      totalJobs,
      totalApplicants,
      activeJobs
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

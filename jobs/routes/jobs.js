const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const User = require("../models/User");

const auth = require("../middleware/auth");
const role = require("../middleware/role");

/* =========================
   GET JOBS (OPTIONAL FILTER)
   /jobs?status=active
   /jobs?status=closed
========================= */
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    const jobs = await Job.find(filter)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   CREATE JOB (FREE FIRST POST LOGIC)
========================= */
router.post("/", auth, role(["employer"]), async (req, res) => {
  try {
    const userId = req.user.id;

    const jobCount = await Job.countDocuments({
      createdBy: userId,
    });

    const isFirstJob = jobCount === 0;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // FREE JOB RULE
    if (!isFirstJob && !user.hasPaidJobPost) {
      return res.status(403).json({
        message:
          "Free job post already used. Please upgrade to post more jobs.",
      });
    }

    const job = await Job.create({
      ...req.body,
      createdBy: userId,
      status: "active",
    });

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   CLOSE JOB (EMPLOYER ONLY)
========================= */
router.patch(
  "/:id/close",
  auth,
  role(["employer"]),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      // ownership check
      if (job.createdBy.toString() !== req.user.id) {
        return res.status(403).json({
          message: "Not allowed",
        });
      }

      job.status = "closed";
      await job.save();

      res.json({
        message: "Job closed successfully",
        job,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/* =========================
   APPLY TO JOB
========================= */
router.post("/:id/apply", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    const alreadyApplied = job.applications.find(
      (a) => a.userId.toString() === req.user.id
    );

    if (alreadyApplied) {
      return res.status(400).json({
        message: "You already applied",
      });
    }

    job.applications.push({
      userId: req.user.id,
      status: "pending",
    });

    await job.save();

    res.json({
      message: "Application submitted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const User = require("../models/User");

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const sendEmail = require("../utils/sendEmail");


// =======================
// GET ALL ACTIVE JOBS
// =======================
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({
      expired: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET SINGLE JOB
// =======================
router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// CREATE JOB
// =======================
router.post("/", auth, requireRole("employer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // FIRST FREE POST
    if (!user.freePostUsed) {
      user.freePostUsed = true;
      await user.save();
    } else {
      // REQUIRE ACTIVE SUBSCRIPTION
      if (
        !user.subscriptionActive ||
        !user.subscriptionExpiresAt ||
        new Date(user.subscriptionExpiresAt) < new Date()
      ) {
        return res.status(403).json({
          message: "Subscription required",
        });
      }
    }

    // 30 DAYS EXPIRY
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const job = await Job.create({
      ...req.body,
      employerId: req.user.id,
      employerEmail: user.email,
      expiresAt: expiryDate,
    });

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// APPLY TO JOB
// =======================
router.post("/:id/apply", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    // PREVENT DUPLICATE APPLICATION
    const alreadyApplied = job.applicants.find(
      (a) => a.userId.toString() === req.user.id
    );

    if (alreadyApplied) {
      return res.status(400).json({
        message: "Already applied",
      });
    }

    job.applicants.push({
      userId: req.user.id,
      status: "pending",
    });

    await job.save();

    // EMAIL TO EMPLOYER
    if (job.employerEmail) {
      await sendEmail({
        to: job.employerEmail,
        subject: `New Application for ${job.title}`,
        text: `A candidate has applied for your job: ${job.title}`,
      });
    }

    res.json({
      message: "Applied successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});


// =======================
// UPDATE APPLICATION STATUS
// =======================
router.put(
  "/:jobId/applicants/:userId",
  auth,
  requireRole("employer"),
  async (req, res) => {
    try {
      const { jobId, userId } = req.params;
      const { status } = req.body;

      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      const applicant = job.applicants.find(
        (a) => a.userId.toString() === userId
      );

      if (!applicant) {
        return res.status(404).json({
          message: "Applicant not found",
        });
      }

      applicant.status = status;

      await job.save();

      // EMAIL TO APPLICANT
      const user = await User.findById(userId);

      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: "Application Update - Craftbridge Jobs",
          text: `Your application for "${job.title}" is now ${status}.`,
        });
      }

      res.json({
        message: "Status updated and email sent",
      });
    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);

module.exports = router;

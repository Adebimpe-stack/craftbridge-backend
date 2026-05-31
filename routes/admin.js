const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const User = require("../models/User");
const Job = require("../models/Job");


// =======================
// GET ALL USERS
// =======================
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL JOBS
// =======================
router.get("/jobs", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL APPLICATIONS (FLATTENED)
// =======================
router.get("/applications", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find();

    const applications = [];

    jobs.forEach((job) => {
      job.applicants.forEach((app) => {
        applications.push({
          jobId: job._id,
          jobTitle: job.title,
          userId: app.userId,
          status: app.status,
        });
      });
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE JOB (ADMIN CONTROL)
// =======================
router.delete("/jobs/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE USER
// =======================
router.delete("/users/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// PENDING EMPLOYERS
// =======================
router.get(
  "/employers/pending",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employers =
        await User.find({

          role: "employer",

          isCompanyVerified: false,

        }).select("-password");

      res.json(employers);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

// =======================
// VERIFY EMPLOYER
// =======================
router.put(
  "/employers/:id/verify",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employer =
        await User.findById(
          req.params.id
        );

      if (!employer) {

        return res.status(404).json({
          message:
            "Employer not found",
        });

      }

      employer.isCompanyVerified =
        true;

      await employer.save();

      res.json({
        message:
          "Employer verified successfully",
      });

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

module.exports = router;

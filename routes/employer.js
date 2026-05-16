const express = require("express");
const router = express.Router();

const Job = require("../models/Job");

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

// GET EMPLOYER APPLICATIONS
router.get(
  "/applications",
  auth,
  requireRole("employer"),
  async (req, res) => {
    try {
      const jobs = await Job.find({
        employerId: req.user.id,
      }).populate("applicants.userId", "name email");

      res.json(jobs);

    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);

// UPDATE APPLICANT STATUS
router.patch(
  "/application/:jobId/:userId",
  auth,
  requireRole("employer"),
  async (req, res) => {
    try {
      const { jobId, userId } = req.params;
      const { status } = req.body;

      const job = await Job.findById(jobId);

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

      res.json({
        message: "Status updated",
      });

    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);

module.exports = router;

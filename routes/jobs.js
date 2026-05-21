const express = require("express");
const router = express.Router();

const Job = require("../models/Job");

const auth = require("../middleware/auth");
const role = require("../middleware/role");

const multer = require("multer");

// =========================
// FILE UPLOAD CONFIG
// =========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// =========================
// GET ALL JOBS
// =========================
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find().populate(
      "createdBy",
      "name email"
    );

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// CREATE JOB
// =========================
router.post(
  "/",
  auth,
  role(["employer"]),
  async (req, res) => {
    try {
      const job = await Job.create({
        ...req.body,
        createdBy: req.user.id,
        status: "active",
        applications: [],
      });

      res.json(job);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// =========================
// APPLY TO JOB (WITH RESUME UPLOAD)
// =========================
router.post(
  "/:id/apply",
  auth,
  upload.single("resume"),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      // SAFE fallback
      job.applications = job.applications || [];

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
        resume: req.file
          ? `/uploads/${req.file.filename}`
          : null,
      });

      await job.save();

      res.json({
        message: "Application submitted successfully",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// =========================
// CLOSE / REOPEN JOB
// =========================
router.patch(
  "/:id/status",
  auth,
  role(["employer"]),
  async (req, res) => {
    try {
      const { status } = req.body;

      // VALIDATION FIX
      if (!["active", "closed"].includes(status)) {
        return res.status(400).json({
          message: "Invalid status value",
        });
      }

      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      if (job.createdBy.toString() !== req.user.id) {
        return res.status(403).json({
          message: "Unauthorized",
        });
      }

      job.status = status;

      await job.save();

      res.json({
        message: "Job status updated",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// =========================
// UPDATE APPLICATION STATUS (ATS)
// =========================
router.patch(
  "/:jobId/application/:appId",
  auth,
  role(["employer"]),
  async (req, res) => {
    try {
      const { jobId, appId } = req.params;
      const { status } = req.body;

      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      if (job.createdBy.toString() !== req.user.id) {
        return res.status(403).json({
          message: "Unauthorized",
        });
      }

      const application = job.applications.id(appId);

      if (!application) {
        return res.status(404).json({
          message: "Application not found",
        });
      }

      application.status = status;

      await job.save();

      res.json({
        message: "Application updated successfully",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;

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
    const jobs = await Job.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// GET SINGLE JOB
// =========================
router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json(job);
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
// DELETE JOB
// =========================
router.delete(
  "/:id",
  auth,
  role(["employer"]),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await job.deleteOne();

      res.json({ message: "Job deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;

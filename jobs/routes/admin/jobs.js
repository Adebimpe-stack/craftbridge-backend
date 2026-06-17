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

/* =========================
   SUSPEND JOB
========================= */
router.patch(
  "/:id/suspend",
  auth,
  role(["admin"]),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res
          .status(404)
          .json({ message: "Job not found" });
      }

      job.status = "suspended";

      await job.save();

      res.json({
        message: "Job suspended successfully",
      });
    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);

/* =========================
   DELETE JOB
========================= */
router.delete(
  "/:id",
  auth,
  role(["admin"]),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res
          .status(404)
          .json({ message: "Job not found" });
      }

      await Job.findByIdAndDelete(
        req.params.id
      );

      res.json({
        message: "Job deleted successfully",
      });
    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);

module.exports = router;

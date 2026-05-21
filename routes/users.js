const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const Job = require("../models/Job");

// GET FULL APPLICANT PROFILE
router.get("/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // jobs applied to
    const jobs = await Job.find({
      "applications.userId": user._id,
    });

    res.json({
      user,
      jobsApplied: jobs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

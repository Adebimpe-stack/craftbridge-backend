const express = require("express");
const router = express.Router();

// middleware auth (your JWT middleware)
const auth = require("./middleware/auth");

// GET SUBSCRIPTION STATUS
router.get("/employer/subscription-status", auth, async (req, res) => {
  try {
    const user = req.user; // from auth middleware

    // example logic (adjust to your DB model)
    const canPostJob =
      user.jobsPosted < 1 || user.isSubscribed === true;

    return res.json({
      canPostJob
    });

  } catch (err) {    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

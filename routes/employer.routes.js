const express = require("express");
const router = express.Router();

// TEST ROUTE
router.get("/", (req, res) => {
  res.json({ message: "Employer routes working 🚀" });
});

module.exports = router;

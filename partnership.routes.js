const express = require("express");
const router = express.Router();
const Partnership = require("./models/Partnership");

router.post("/partnerships", async (req, res) => {
  try {
    const partnership =
      await Partnership.create(req.body);

    res.status(201).json({
      message:
        "Partnership request submitted successfully",
      partnership,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
});

router.get("/partnerships", async (req, res) => {
  try {
    const partnerships =
      await Partnership.find().sort({
        createdAt: -1,
      });

    res.json(partnerships);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
});

module.exports = router;

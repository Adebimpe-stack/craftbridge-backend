const router = require("express").Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const Partnership = require("../models/Partnership");

router.put("/:id/approve", auth, requireRole("admin"), async (req, res) => {
  try {
    const partnership = await Partnership.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { returnDocument: "after" }
    );

    if (!partnership) {
      return res.status(404).json({ message: "Partnership request not found" });
    }

    res.json(partnership);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id/reject", auth, requireRole("admin"), async (req, res) => {
  try {
    const partnership = await Partnership.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { returnDocument: "after" }
    );

    if (!partnership) {
      return res.status(404).json({ message: "Partnership request not found" });
    }

    res.json(partnership);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

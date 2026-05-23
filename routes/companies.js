const router = require("express").Router();

const Company = require("../models/Company");
const Job = require("../models/Job");

// =========================
// GET COMPANY + ITS JOBS
// =========================
router.get("/:id/jobs", async (req, res) => {
  try {
    const companyId = req.params.id;

    // get company
    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    // get jobs linked to company
    const jobs = await Job.find({
      companyId: companyId
    }).sort({ createdAt: -1 });

    res.json({
      company,
      jobs
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

module.exports = router;

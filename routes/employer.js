const router = require("express").Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const Job = require("../models/Job");
const Application =
  require("../models/Application");

// GET EMPLOYER STATS
router.get("/stats", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.companyId) {
      return res.status(400).json({ message: "No company associated with this user" });
    }

    const jobs = await Job.find({ companyId: user.companyId });

    const totalJobs = jobs.length;

const totalApplicants =
  await Application.countDocuments({
    job: {
      $in: jobs.map(
        job => job._id
      ),
    },
  });
    const activeJobs = jobs.filter(job => job.status !== "closed").length;

    res.json({
      totalJobs,
      totalApplicants,
      activeJobs
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get(
  "/applicants",
  auth,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user.companyId) {
        return res.status(400).json({ message: "No company associated with this user" });
      }

      const jobs =
        await Job.find({
          companyId: user.companyId,
        });

      const applications =
        await Application.find({
          job: {
            $in: jobs.map(
              job => job._id
            ),
          },
        })
        .populate("job")
        .populate(
          "applicant",
          "name email"
        );

      res.json(applications);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }
  }
);

// =========================
// GET RECENT APPLICANTS (employer dashboard)
// =========================
router.get("/recent-applicants", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.companyId) {
      return res.status(400).json({ message: "No company associated with this user" });
    }

    const jobs = await Job.find({ companyId: user.companyId });
    const jobIds = jobs.map(job => job._id);

    const applications = await Application.find({
      job: { $in: jobIds }
    })
      .populate("applicant", "name email")
      .populate("job", "title")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(applications);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

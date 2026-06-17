const router = require("express").Router();
const auth = require("../middleware/auth");
const Job = require("../models/Job");
const Application =
  require("../models/Application");

// GET EMPLOYER STATS
router.get("/stats", auth, async (req, res) => {
  try {
    const jobs = await Job.find({ createdBy: req.user.id });

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

      const jobs =
        await Job.find({
          createdBy: req.user._id,
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
          "firstName lastName email"
        );

      res.json(applications);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }
  }
);

module.exports = router;

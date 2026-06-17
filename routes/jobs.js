const express =
  require("express");

const router =
  express.Router();

const Application =
  require("../models/Application");

const Job =
  require("../models/Job");

const User =
  require("../models/User");

const auth =
  require("../middleware/auth");

// =========================
// CREATE JOB
// =========================

router.post(
  "/",
  auth,
  async (req, res) => {
console.log("REQ USER:", req.user);

    try {

      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {

        return res.status(404).json({
          message:
            "User not found",
        });

      }

      // =========================
      // ONLY EMPLOYERS
      // =========================

      if (
        user.role !==
        "employer"
      ) {

        return res.status(403).json({
          message:
            "Only employers can post jobs",
        });

      }

      // =========================
      // EMAIL VERIFIED ONLY
      // =========================

      if (
        !user.isVerified
      ) {

        return res.status(403).json({
          message:
            "Please verify your email before posting jobs",
        });

      }

      // =========================
      // COMPANY VERIFICATION
      // =========================

      if (
        !user.isCompanyVerified
      ) {

        return res.status(403).json({

          message:
            "Your company is pending verification by admin",

        });

      }

      // =========================
      // FREE JOB + SUBSCRIPTION
      // =========================

      if (

        user.hasUsedFreeJob &&

        !user.subscriptionActive

      ) {

        return res.status(403).json({

          message:
            "Subscription required to post another job",

        });

      }

const newJob =
  new Job({

    title:
      req.body.title,

    category:
      req.body.category,

    field:
      req.body.field,

    location:
      req.body.location,

    workMode:
      req.body.workMode,

    salary:
      req.body.salary,

    type:
      req.body.type,

    experienceLevel:
      req.body.experienceLevel,

    vacancies:
      req.body.vacancies,

    applicationDeadline:
      req.body.applicationDeadline,

    description:
      req.body.description,

    requirements:
      req.body.requirements,

    benefits:
      req.body.benefits,

    createdBy:
      user._id,

  });

      const savedJob =
        await newJob.save();

      // =========================
      // MARK FREE JOB AS USED
      // =========================

      if (
        !user.hasUsedFreeJob
      ) {

        user.hasUsedFreeJob =
          true;

        await user.save();

      }


res.status(201).json(
  savedJob
);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          error.message,
      });

    }

  }
);


// =========================
// GET ALL JOBS
// =========================

router.get(
  "/",
  async (req, res) => {

    try {

      const jobs =
        await Job.find()
          .sort({
            createdAt: -1,
          });

      res.json(jobs);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

// =========================
// GET SINGLE JOB
// =========================

router.get(
  "/:id",
  async (req, res) => {

    try {

      const job =
        await Job.findById(
          req.params.id
        );

      if (!job) {

        return res.status(404).json({
          message:
            "Job not found",
        });

      }

      res.json(job);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

// =========================
// CLOSE JOB
// =========================

router.put(
  "/:id/close",
  auth,
  async (req, res) => {

    try {

      const job =
        await Job.findById(
          req.params.id
        );

      if (!job) {

        return res.status(404).json({
          message:
            "Job not found",
        });

      }

      // OWNER ONLY

if (
  job.createdBy.toString() !==
  req.user.id
) {

  return res.status(403).json({
    message:
      "Not authorized",
  });

}


job.status =
  "closed";

await job.save();

res.json({
  message:
    "Job closed successfully",
});

} catch (error) {

  console.log(error);

  res.status(500).json({
    message:
      "Server error",
  });

}

}
);

// =========================
// DELETE JOB
// =========================

router.delete(
  "/:id",
  auth,
  async (req, res) => {

    try {

      const job =
        await Job.findById(
          req.params.id
        );

      if (!job) {

        return res.status(404).json({
          message:
            "Job not found",
        });

      }

      // OWNER OR ADMIN

// OWNER OR ADMIN
if (

  job.createdBy.toString() !==
    req.user.id &&

  req.user.role !==
    "admin"

) {

  return res.status(403).json({
    message:
      "Not authorized",
  });

}

await job.deleteOne();

res.json({
  message:
    "Job deleted successfully",
});

} catch (error) {

  console.log(error);

  res.status(500).json({
    message:
      "Server error",
  });

}

}
);

// =========================
// APPLY FOR JOB
// =========================

router.post(
  "/:id/apply",
  auth,
  async (req, res) => {
    try {

const job = await Job.findById(
  req.params.id
);

if (!job) {
  return res.status(404).json({
    message: "Job not found",
  });
}

const existingApplication =
  await Application.findOne({
    job: job._id,
    applicant: req.user.id,
  });

if (existingApplication) {
  return res.status(400).json({
    message:
      "You have already applied for this job",
  });
}

const application =
  new Application({
    job: job._id,
    applicant: req.user._id,
    coverLetter:
      req.body?.coverLetter || "",
  });

await application.save();

res.json({
  message:
    "Application submitted successfully",
});
    } catch (error) {

      console.log(error);

      res.status(500).json({
        message: "Server error",
      });

    }
  }
);

module.exports =
  router;

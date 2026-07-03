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

const Company =
  require("../models/Company");

const auth =
  require("../middleware/auth");

// =========================
// CREATE JOB
// =========================

router.post(
  "/",
  auth,
  async (req, res) => {

    try {

      const user = req.user;

      // =========================
      // ONLY EMPLOYERS
      // =========================

      if (user.role !== "employer") {

        return res.status(403).json({
          message: "Only employers can post jobs",
        });

      }

      // =========================
      // EMAIL VERIFIED ONLY
      // =========================

      if (!user.isVerified) {

        return res.status(403).json({
          message: "Please verify your email before posting jobs",
        });

      }

      // =========================
      // COMPANY VERIFICATION (admin must verify)
      // =========================

      if (!user.isCompanyVerified) {

        return res.status(403).json({
          message: "Your account must be verified by admin before posting jobs.",
        });

      }

      // =========================
      // COMPANY JOB POSTING LIMITS
      // =========================

      const company = await Company.findById(user.companyId);
      if (!company) {
        return res.status(404).json({
          message: "Company not found"
        });
      }

      // Check job posting limits based on subscription plan
      const jobLimits = {
        free: 1,
        basic: 10,
        premium: -1 // -1 means unlimited
      };

      const maxJobs = jobLimits[company.subscriptionPlan] || 1;

      // Enforce limit if not unlimited and subscription not active
      if (maxJobs !== -1 && !company.subscriptionActive) {
        if (company.jobsPosted >= maxJobs) {
          return res.status(403).json({
            message: `Your ${company.subscriptionPlan} plan allows ${maxJobs} job posting(s). Please upgrade to post more jobs.`
          });
        }
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

    companyId:
      user.companyId,

    createdBy:
      user._id,

    isPriority: company.subscriptionActive === true,

  });

      const savedJob =
        await newJob.save();

      // =========================
      // INCREMENT COMPANY JOB COUNT
      // =========================

      company.jobsPosted = (company.jobsPosted || 0) + 1;
      await company.save();


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

      const jobs = await Job.find({ status: "active" })
        .sort({ isPriority: -1, createdAt: -1 });

      // Enrich with company verification/subscription info for badges
      const enriched = await Promise.all(
        jobs.map(async (job) => {
          const obj = job.toObject();
          if (job.companyId) {
            const company = await Company.findById(job.companyId)
              .select("verificationStatus subscriptionActive name");
            if (company) {
              obj.companyVerified = company.verificationStatus === "verified";
              obj.companySubscribed = company.subscriptionActive === true;
              obj.companyName = obj.companyName || company.name;
            }
          }
          return obj;
        })
      );

      res.json(enriched);

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
// UPDATE JOB
// =========================

router.put(
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

      // COMPANY MEMBER ONLY

if (
  job.companyId.toString() !==
  req.user.companyId?.toString()
) {

  return res.status(403).json({
    message:
      "Not authorized",
  });

}

      // Update editable fields
      const {
        title,
        description,
        location,
        salary,
        type,
        category,
        field,
        workMode,
        experienceLevel,
        vacancies,
        applicationDeadline,
        requirements,
        benefits,
      } = req.body;

      if (title !== undefined) job.title = title;
      if (description !== undefined) job.description = description;
      if (location !== undefined) job.location = location;
      if (salary !== undefined) job.salary = salary;
      if (type !== undefined) job.type = type;
      if (category !== undefined) job.category = category;
      if (field !== undefined) job.field = field;
      if (workMode !== undefined) job.workMode = workMode;
      if (experienceLevel !== undefined) job.experienceLevel = experienceLevel;
      if (vacancies !== undefined) job.vacancies = vacancies;
      if (applicationDeadline !== undefined) job.applicationDeadline = applicationDeadline;
      if (requirements !== undefined) job.requirements = requirements;
      if (benefits !== undefined) job.benefits = benefits;

      // Preserve createdBy and companyId
      // These are not modified

      await job.save();

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

      // COMPANY MEMBER ONLY

if (
  job.companyId.toString() !==
  req.user.companyId?.toString()
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
// CLOSE JOB (POST — used by Dashboard)
// =========================

router.post(
  "/:id/close",
  auth,
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.companyId.toString() !== req.user.companyId?.toString()) {
        return res.status(403).json({ message: "Not authorized" });
      }

      job.status = "closed";
      await job.save();
      res.json({ message: "Job closed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// =========================
// REOPEN JOB (POST — used by Dashboard)
// =========================

router.post(
  "/:id/reopen",
  auth,
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.companyId.toString() !== req.user.companyId?.toString()) {
        return res.status(403).json({ message: "Not authorized" });
      }

      job.status = "active";
      await job.save();
      res.json({ message: "Job reopened successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
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

      // COMPANY MEMBER OR ADMIN

if (

  job.companyId.toString() !==
    req.user.companyId?.toString() &&

  req.user.role !==
    "admin"

) {

  return res.status(403).json({
    message:
      "Not authorized",
  });

}

await job.deleteOne();

// Decrement company job count
const company = await Company.findById(job.companyId);
if (company) {
  company.jobsPosted = Math.max(0, (company.jobsPosted || 0) - 1);
  await company.save();
}

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

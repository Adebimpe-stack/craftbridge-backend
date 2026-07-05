const express =
  require("express");

const router =
  express.Router();

const Application =
  require("../models/Application");

const Job =
  require("../models/Job");
const Company = require("../models/Company");

const User =
  require("../models/User");

const auth =
  require("../middleware/auth");

const upload = require("../middleware/upload");

const { body, validationResult } = require("express-validator");

// =========================
// CREATE JOB
// =========================

router.post(
  "/",
  auth,
  [
    body("title", "Job title is required").not().isEmpty(),
    body("category", "Category is required").not().isEmpty(),
    body("location", "Location is required").not().isEmpty(),
    body("salary", "Salary range is required").not().isEmpty(),
    body("type", "Job type is required").not().isEmpty(),
    body("workMode", "Work mode is required").not().isEmpty(),
    body("experienceLevel", "Experience level is required").not().isEmpty(),
    body("applicationDeadline", "Application deadline is required").not().isEmpty(),
    body("description", "Description is required").not().isEmpty(),
    body("requirements", "Requirements are required").not().isEmpty(),
  ],
  async (req, res) => {
console.log("REQ USER:", req.user);
    try {

      const user =
        await User.findById(
          req.user.id
        );

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

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

      const company = await Company.findById(user.companyId);
      if (!company || company.verificationStatus !== "verified") {
        return res.status(403).json({

          message:
            "Your company must be verified by an admin before posting jobs.",

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

    companyId:
      user.companyId,

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

        await User.findByIdAndUpdate(
          user._id,
          { hasUsedFreeJob: true },
          { runValidators: false }
        );

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

      const jobs = await Job.find({
        status: "active",
        isDeleted: false,
      })
        .populate("companyId", "name verificationStatus subscriptionActive")
        .sort({ createdAt: -1 });

      const formattedJobs = jobs.map((job) => {
        const company = job.companyId;
        return {
          ...job.toObject(),
          companyName: company?.name || "Confidential",
          companyVerified: company?.verificationStatus === "verified",
          companySubscribed: company?.subscriptionActive || false,
        };
      });

      res.json(formattedJobs);

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

      const job = await Job.findOne({
        _id: req.params.id,
        status: "active",
        isDeleted: false,
      }).populate("companyId", "name verificationStatus subscriptionActive");

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      const company = job.companyId;
      res.json({
        ...job.toObject(),
        companyName: company?.name || "Confidential",
        companyVerified: company?.verificationStatus === "verified",
        companySubscribed: company?.subscriptionActive || false,
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

      // AUTHORIZATION: Verify user is an owner/admin of the company that owns this job.
      const company = await Company.findById(job.companyId);
      if (!company) {
        return res.status(404).json({ message: "Associated company not found" });
      }

      const user = await User.findById(req.user.id);
      const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
      const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

      if (!hasPermission) {
        return res.status(403).json({ message: "Not authorized to update this job" });
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

      if (job.isDeleted) {
        return res.status(400).json({ message: "Cannot close a deleted job" });
      }

      // AUTHORIZATION: Verify user is an owner/admin of the company that owns this job.
      const company = await Company.findById(job.companyId);
      if (!company) {
        return res.status(404).json({ message: "Associated company not found" });
      }

      const user = await User.findById(req.user.id);
      const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
      const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

      if (!hasPermission) {
        return res.status(403).json({ message: "Not authorized to close this job" });
      }

await Job.findByIdAndUpdate(req.params.id, { status: "closed" }, { runValidators: false });

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
// CLOSE JOB (POST support)
// =========================
router.post("/:id/close", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.isDeleted) {
      return res.status(400).json({ message: "Cannot close a deleted job" });
    }

    const company = await Company.findById(job.companyId);
    if (!company) {
      return res.status(404).json({ message: "Associated company not found" });
    }

    const user = await User.findById(req.user.id);
    const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
    const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

    if (!hasPermission) {
      return res.status(403).json({ message: "Not authorized to close this job" });
    }

    await Job.findByIdAndUpdate(req.params.id, { status: "closed" }, { runValidators: false });

    res.json({ message: "Job closed successfully" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// REOPEN JOB (employer)
// =========================

router.post(
  "/:id/reopen",
  auth,
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.isDeleted) {
        return res.status(400).json({ message: "Cannot reopen a deleted job" });
      }

      // AUTHORIZATION
      const company = await Company.findById(job.companyId);
      if (!company) {
        return res.status(404).json({ message: "Associated company not found" });
      }

      const user = await User.findById(req.user.id);
      const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
      const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

      if (!hasPermission) {
        return res.status(403).json({ message: "Not authorized to reopen this job" });
      }

      await Job.findByIdAndUpdate(req.params.id, { status: "active" }, { runValidators: false });

      res.json({ message: "Job reopened successfully" });

    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// =========================
// DELETE JOB (employer soft delete)
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

      // AUTHORIZATION: Verify user is an owner/admin of the company that owns this job, OR a platform admin.
      const user = await User.findById(req.user.id);
      if (user.role !== "admin") {
        const company = await Company.findById(job.companyId);
        if (!company) {
          return res.status(404).json({ message: "Associated company not found" });
        }

        const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
        const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

        if (!hasPermission) {
          return res.status(403).json({ message: "Not authorized to delete this job" });
        }
      }

await Job.findByIdAndUpdate(
  req.params.id,
  {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: req.user._id,
  },
  { runValidators: false }
);

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
  upload.single("resume"),
  async (req, res) => {
    try {

const job = await Job.findOne({
  _id: req.params.id,
  status: "active",
  isDeleted: false,
});

if (!job) {
  return res.status(404).json({
    message: "Job not found or no longer accepting applications",
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

const user = await User.findById(req.user.id);
const resumeUrl = req.file?.location || req.body?.resumeUrl || user?.resumeUrl || "";

const application =
  new Application({
    job: job._id,
    applicant: req.user._id,
    resume: resumeUrl,
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

// =========================
// GET APPLICANTS FOR A JOB (employer)
// =========================

router.get(
  "/:id/applicants",
  auth,
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const company = await Company.findById(job.companyId);
      if (!company) {
        return res.status(404).json({ message: "Associated company not found" });
      }

      const user = await User.findById(req.user.id);
      const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
      const hasPermission =
        user.role === "admin" ||
        (isMember && (user.companyRole === "owner" || user.companyRole === "admin" || user.companyRole === "recruiter"));

      if (!hasPermission) {
        return res.status(403).json({ message: "Not authorized to view applicants for this job" });
      }

      const applications = await Application.find({ job: job._id })
        .populate("applicant", "name email")
        .sort({ createdAt: -1 });

      res.json(applications);

    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports =
  router;

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

const { createNotification } = require("../services/notificationService");
const { submitJobForIndexing } = require("../services/indexingService");
const { generateSlug } = require("../utils/slugGenerator");
const { buildJobPostingJsonLd } = require("../utils/jobFeed");

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "https://craftbridgejobs.com").replace(/\/$/, "");

const auth =
  require("../middleware/auth");

const upload = require("../middleware/upload");

const { body, validationResult } = require("express-validator");

// The field is an enum, so anything unrecognised (including the empty string a
// blank select posts) has to become undefined rather than fail validation.
const SALARY_CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD", "AUD"];
const normalizeCurrency = (value) => {
  const code = String(value || "").trim().toUpperCase();
  return SALARY_CURRENCIES.includes(code) ? code : undefined;
};

// Job text is author-supplied, so it must be escaped before being interpolated
// into HTML/XML; `</script` is also broken up so JSON-LD cannot close its tag.
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const jsonLdScript = (schema) =>
  JSON.stringify(schema).replace(/</g, "\\u003c");

const plainText = (value = "") =>
  String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// =========================
// GET SEO-OPTIMIZED JOB PAGE HTML
// GET /api/jobs/:id/seo-html
// Serves HTML with JSON-LD for crawlers
// =========================
router.get("/:id/seo-html", async (req, res) => {
  try {
    const { id } = req.params;
    const query = /^[0-9a-fA-F]{24}$/.test(id) ? { _id: id } : { slug: id };
    const job = await Job.findOne(query)
      .populate("companyId", "name logo verificationStatus isActive");

    if (!job || job.status !== "active" || job.isDeleted) {
      return res.status(404).send("Job not found");
    }

    if (job.companyId?.isActive === false) {
      return res.status(404).send("Job not found");
    }

    // Reuse the same JSON-LD the feed and job page emit, so the three can
    // never describe the same job differently.
    const schema = {
      ...buildJobPostingJsonLd(job, { frontendUrl: frontendUrl() }),
      directApply: true,
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow" />
  <title>${escapeHtml(job.title)} | ${escapeHtml(job.companyName || "CraftBridge")}</title>
  <meta name="description" content="${escapeHtml(plainText(job.description).slice(0, 160))}" />
  <link rel="canonical" href="${escapeHtml(schema.url)}" />
  <script type="application/ld+json">
    ${jsonLdScript(schema)}
  </script>
</head>
<body>
  <h1>${escapeHtml(job.title)}</h1>
  <p>Company: ${escapeHtml(job.companyName || "Confidential")}</p>
  <p>Location: ${escapeHtml(job.location || "")}</p>
  <p>Type: ${escapeHtml(job.type || "")}</p>
  <div>${escapeHtml(plainText(job.description))}</div>
  <p><a href="${escapeHtml(schema.url)}">View full job details on CraftBridge</a></p>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("SEO HTML generation error:", error);
    res.status(500).send("Error generating SEO HTML");
  }
});

// =========================
// GENERATE SITEMAP
// =========================
router.get("/sitemap.xml", async (req, res) => {
  try {
    const jobs = await Job.find({
      status: "active",
      isDeleted: false,
    })
      .populate("companyId", "isActive")
      .select("slug updatedAt")
      .sort({ updatedAt: -1 });

    const baseUrl = frontendUrl();
    const apiUrl = (
      process.env.API_URL || "https://api.craftbridgejobs.com"
    ).replace(/\/$/, "");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    jobs.forEach(job => {
      if (job.companyId?.isActive === false) return;

      const lastMod = (job.updatedAt || new Date()).toISOString().split('T')[0];

      // The crawlable page and its server-rendered twin are both listed so
      // Google can reach the JobPosting markup without executing JavaScript.
      const urls = [
        { loc: `${baseUrl}/jobs/${job.slug || job._id}`, priority: "0.8" },
        { loc: `${apiUrl}/api/jobs/${job._id}/seo-html`, priority: "0.6" },
      ];

      urls.forEach(({ loc, priority }) => {
        xml += `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>
`;
      });
    });

    xml += `</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).json({ message: "Error generating sitemap" });
  }
});

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
    body("type", "Job type is required").not().isEmpty(),
    body("workMode", "Work mode is required").not().isEmpty(),
    body("experienceLevel", "Experience level is required").not().isEmpty(),
    body("applicationDeadline", "Application deadline is required").not().isEmpty(),
    body("description", "Description is required").not().isEmpty(),
    body("requirements", "Requirements are required").not().isEmpty(),
  ],
  async (req, res) => {
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

      const now = new Date();
      const isSubscribed =
        company.subscriptionActive &&
        company.subscriptionExpiry &&
        new Date(company.subscriptionExpiry) > now;

      const isAgency = company.organizationType === "recruitment_agency";
      const agencyTrialMs = 30 * 24 * 60 * 60 * 1000;
      const withinAgencyTrial =
        now - new Date(company.createdAt) <= agencyTrialMs;

      // The free plan allows one live listing, so the limit is measured
      // against jobs that still occupy a slot rather than the cumulative
      // jobsPosted counter. Only closing or deleting a job frees the slot;
      // a suspended job still counts.
      const activeJobs = await Job.countDocuments({
        companyId: user.companyId,
        status: { $in: ["active", "suspended"] },
        isDeleted: false,
      });

      if (!isSubscribed) {
        if (isAgency) {
          if (activeJobs >= 1 || !withinAgencyTrial) {
            const message = !withinAgencyTrial
              ? "Your 30-day free trial has ended. Subscribe to Agency Pro to post more jobs."
              : "Your free trial covers one active job. Subscribe to Agency Pro to post more jobs.";
            return res.status(403).json({ message });
          }
        } else if (activeJobs >= 1) {
          return res.status(403).json({
            message:
              "Free plan allows only 1 active job. Upgrade your subscription to post more jobs.",
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

    salaryCurrency:
      normalizeCurrency(req.body.salaryCurrency),

    type:
      req.body.type,

    experienceLevel:
      req.body.experienceLevel,

    vacancies:
      req.body.vacancies === "" || req.body.vacancies === null
        ? undefined
        : req.body.vacancies,

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

      newJob.slug = generateSlug(newJob.title, newJob.location, newJob._id);

      const savedJob = await newJob.save();

      // =========================
      // TRACK COMPANY JOB POSTS
      // =========================

      company.jobsPosted = (company.jobsPosted || 0) + 1;
      await company.save();

      // =========================
      // SUBMIT TO GOOGLE INDEXING API
      // =========================
      // Non-blocking call to submit the new job to Google for indexing
      submitJobForIndexing(savedJob._id, 'URL_UPDATED')
        .catch(err => console.error('Error submitting job to Google Indexing:', err));


res.status(201).json(
  savedJob
);

    } catch (error) {

      console.error(error);

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
        .populate("companyId", "name verificationStatus subscriptionActive isActive")
        .sort({ createdAt: -1 });

      const formattedJobs = jobs
        .filter((job) => job.companyId?.isActive !== false)
        .map((job) => {
        const company = job.companyId;
        const isCraftBridgeRecruitment = company?.name === "CraftBridge Recruitment";
        return {
          ...job.toObject(),
          companyName: isCraftBridgeRecruitment ? "Recruiting through CraftBridge" : (company?.name || "Confidential"),
          companyVerified: company?.verificationStatus === "verified",
          companySubscribed: company?.subscriptionActive || false,
        };
      });

      res.json(formattedJobs);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

// =========================
// GET SINGLE JOB (by ID or slug)
// =========================

router.get(
  "/:identifier",
  async (req, res) => {

    try {

      // Try to find by slug first, then by ID
      let job = await Job.findOne({
        slug: req.params.identifier,
        status: "active",
        isDeleted: false,
      }).populate("companyId", "name verificationStatus subscriptionActive isActive");

      // If not found by slug, try by ID
      if (!job) {
        job = await Job.findOne({
          _id: req.params.identifier,
          status: "active",
          isDeleted: false,
        }).populate("companyId", "name verificationStatus subscriptionActive isActive");
      }

      if (!job || job.companyId?.isActive === false) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      const company = job.companyId;
      const isCraftBridgeRecruitment = company?.name === "CraftBridge Recruitment";
      res.json({
        ...job.toObject(),
        companyName: isCraftBridgeRecruitment ? "Recruiting through CraftBridge" : (company?.name || "Confidential"),
        companyVerified: company?.verificationStatus === "verified",
        companySubscribed: company?.subscriptionActive || false,
      });

    } catch (error) {

      console.error(error);

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
        salaryCurrency,
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
      if (salaryCurrency !== undefined) {
        job.salaryCurrency = normalizeCurrency(salaryCurrency);
      }
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

      // =========================
      // SUBMIT TO GOOGLE INDEXING API
      // =========================
      // Non-blocking call to submit the updated job to Google for indexing
      submitJobForIndexing(job._id, 'URL_UPDATED')
        .catch(err => console.error('Error submitting job to Google Indexing:', err));

      res.json(job);

} catch (error) {

  console.error(error);

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

// =========================
// SUBMIT TO GOOGLE INDEXING API
// =========================
// Non-blocking call to notify Google that the job is no longer active
submitJobForIndexing(req.params.id, 'URL_DELETED')
  .catch(err => console.error('Error submitting job deletion to Google Indexing:', err));

res.json({
  message:
    "Job closed successfully",
});

} catch (error) {

  console.error(error);

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

    // =========================
    // SUBMIT TO GOOGLE INDEXING API
    // =========================
    // Non-blocking call to notify Google that the job is no longer active
    submitJobForIndexing(req.params.id, 'URL_DELETED')
      .catch(err => console.error('Error submitting job deletion to Google Indexing:', err));

    res.json({ message: "Job closed successfully" });

  } catch (error) {
    console.error(error);
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
      console.error(error);
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

// =========================
// SUBMIT TO GOOGLE INDEXING API
// =========================
// Non-blocking call to notify Google that the job is deleted
submitJobForIndexing(req.params.id, 'URL_DELETED')
  .catch(err => console.error('Error submitting job deletion to Google Indexing:', err));

res.json({
  message:
    "Job deleted successfully",
});

} catch (error) {

  console.error(error);

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

const user = await User.findById(req.user.id);

if (!user) {
  return res.status(404).json({ message: "User not found" });
}

if (user.role === "employer") {
  return res.status(403).json({
    message: "Employers cannot apply for jobs. Please create a job seeker account.",
  });
}

if (user.role === "admin") {
  return res.status(403).json({
    message: "Admins cannot apply for jobs.",
  });
}

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

    // Notify the employer internally (non-blocking)
    createNotification({
      recipientId: job.createdBy,
      type: "job_application",
      data: {
        jobId: job._id,
        jobTitle: job.title,
        applicantId: user._id,
        applicationId: application._id,
      },
    }).catch((err) => console.error("JOB APPLICATION NOTIFICATION ERROR:", err));

    res.json({
      message:
        "Application submitted successfully",
    });
    } catch (error) {

      console.error(error);

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
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports =
  router;

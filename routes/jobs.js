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

const auth =
  require("../middleware/auth");

const upload = require("../middleware/upload");

const { body, validationResult } = require("express-validator");

// =========================
// GET SEO-OPTIMIZED JOB PAGE HTML
// GET /api/jobs/:id/seo-html
// Serves HTML with JSON-LD for crawlers
// =========================
router.get("/:id/seo-html", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("companyId", "name logo verificationStatus isActive");

    if (!job || job.status !== "active" || job.isDeleted) {
      return res.status(404).send("Job not found");
    }

    if (job.companyId?.isActive === false) {
      return res.status(404).send("Job not found");
    }

    const employmentTypeMap = {
      "Full-time": "FULL_TIME",
      "Part-time": "PART_TIME",
      "Contract": "CONTRACTOR",
      "Temporary": "TEMPORARY",
      "Internship": "INTERN",
      "Volunteer": "VOLUNTEER",
    };

    const getJobLocationType = (workMode) => {
      switch (workMode) {
        case "Remote": return "TELECOMMUTE";
        case "Hybrid": return "HYBRID";
        default: return null;
      }
    };

    const formatDate = (date) => {
      if (!date) return null;
      return new Date(date).toISOString().split('T')[0];
    };

    const schema = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "title": job.title,
      "description": job.description,
      "datePosted": formatDate(job.createdAt),
      "validThrough": job.applicationDeadline ? formatDate(job.applicationDeadline) : null,
      "employmentType": employmentTypeMap[job.type] || "FULL_TIME",
      "hiringOrganization": {
        "@type": "Organization",
        "name": job.companyName || "Confidential",
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": job.location || "Nigeria",
          "addressCountry": "NG"
        }
      },
      "applicantLocationRequirements": {
        "@type": "Country",
        "name": "NG"
      }
    };

    const jobLocationType = getJobLocationType(job.workMode);
    if (jobLocationType) {
      schema.jobLocationType = jobLocationType;
    }

    if (job.salary) {
      const salaryMatch = job.salary.match(/([₦$]?\s*[\d,]+)\s*[-–]\s*([₦$]?\s*[\d,]+)/);
      if (salaryMatch) {
        const minSalary = parseInt(salaryMatch[1].replace(/[₦$,]/g, '').replace(/,/g, ''));
        const maxSalary = parseInt(salaryMatch[2].replace(/[₦$,]/g, '').replace(/,/g, ''));
        if (!isNaN(minSalary) && !isNaN(maxSalary)) {
          schema.baseSalary = {
            "@type": "MonetaryAmount",
            "currency": "NGN",
            "value": {
              "@type": "QuantitativeValue",
              "minValue": minSalary,
              "maxValue": maxSalary,
              "unitText": "MONTH"
            }
          };
        }
      }
    }

    if (job.experienceLevel) {
      const experienceMap = {
        "Entry Level": "no_experience",
        "Mid Level": "1-3_years",
        "Senior Level": "3-5_years",
        "Executive": "5-10_years",
      };
      schema.experienceRequirements = {
        "@type": "OccupationalExperienceRequirements",
        "monthsOfExperience": experienceMap[job.experienceLevel] || null
      };
    }

    schema.directApply = true;
    const baseUrl = process.env.FRONTEND_URL || "https://craftbridgejobs.com";
    schema.url = `${baseUrl}/jobs/${job.slug || job._id}`;

    Object.keys(schema).forEach(key => {
      if (schema[key] === null) delete schema[key];
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${job.title} | ${job.companyName || "CraftBridge"}</title>
  <meta name="description" content="${job.description?.substring(0, 160)}" />
  <link rel="canonical" href="${schema.url}" />
  <script type="application/ld+json">
    ${JSON.stringify(schema)}
  </script>
</head>
<body>
  <h1>${job.title}</h1>
  <p>Company: ${job.companyName || "Confidential"}</p>
  <p>Location: ${job.location}</p>
  <p>Type: ${job.type}</p>
  <p><a href="${schema.url}">View full job details on CraftBridge</a></p>
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

    const baseUrl = process.env.FRONTEND_URL || "https://craftbridgejobs.com";
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    jobs.forEach(job => {
      if (job.companyId?.isActive !== false && job.slug) {
        const jobUrl = `${baseUrl}/jobs/${job.slug}`;
        const seoUrl = `${process.env.API_ORIGIN || "https://api.craftbridgejobs.com"}/api/jobs/${job._id}/seo-html`;
        const lastMod = job.updatedAt ? job.updatedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        xml += `  <url>
    <loc>${jobUrl}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${seoUrl}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
`;
      }
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

      if (!isSubscribed) {
        if (isAgency) {
          if (company.jobsPosted >= 1 || !withinAgencyTrial) {
            const message = !withinAgencyTrial
              ? "Your 30-day free trial has ended. Subscribe to Agency Pro to post more jobs."
              : "Your free trial covers one job post. Subscribe to Agency Pro to post more jobs.";
            return res.status(403).json({ message });
          }
        } else if (company.jobsPosted >= 1) {
          return res.status(403).json({
            message: "Subscription required to post another job",
          });
        }
      }

const newJob =
  new Job({

    title:
      req.body.title,

    slug: generateSlug(req.body.title, req.body.location, null), // Will be updated after save

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

      const savedJob = await newJob.save();

      // =========================
      // GENERATE SLUG
      // =========================
      savedJob.slug = generateSlug(savedJob.title, savedJob.location, savedJob._id);
      await savedJob.save();

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

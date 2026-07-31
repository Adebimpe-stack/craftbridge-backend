const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const { buildJobFeedXml, buildJobPostingJsonLd } = require("../utils/jobFeed");

const FEED_LIMIT = 5000;
const CACHE_SECONDS = 900;

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "https://craftbridgejobs.com").replace(/\/+$/, "");

// Only live, non-deleted jobs that are still open are distributed: aggregators
// penalise feeds that keep returning expired listings.
const feedQuery = () => ({
  status: "active",
  isDeleted: false,
  $or: [
    { applicationDeadline: { $exists: false } },
    { applicationDeadline: null },
    { applicationDeadline: { $gte: new Date() } },
  ],
});

const loadFeedJobs = () =>
  Job.find(feedQuery())
    .sort({ createdAt: -1 })
    .limit(FEED_LIMIT)
    .populate("companyId", "name logo website location isActive")
    .lean();

/* =========================
   XML JOB FEED
   GET /feeds/jobs.xml
   A single feed submitted to every aggregator (Jooble, Jobrapido, Adzuna,
   Talent.com, Careerjet, Jora, ...). Google for Jobs is served by the
   JobPosting structured data on the job page instead.
========================= */
router.get("/feeds/jobs.xml", async (req, res) => {
  try {
    const jobs = await loadFeedJobs();

    const xml = buildJobFeedXml(jobs, { frontendUrl: frontendUrl() });

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    return res.send(xml);
  } catch (err) {
    console.error("JOB FEED ERROR:", err);
    return res.status(500).send("<error>Feed unavailable</error>");
  }
});

/* =========================
   GOOGLE FOR JOBS STRUCTURED DATA
   GET /feeds/jobs/:id/structured-data
   Returned as JSON so the job page can embed it in a
   <script type="application/ld+json"> tag.
========================= */
router.get("/feeds/jobs/:id/structured-data", async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("companyId", "name logo website location")
      .lean();

    if (!job || job.status !== "active") {
      return res.status(404).json({ message: "Job not found" });
    }

    return res.json(buildJobPostingJsonLd(job, { frontendUrl: frontendUrl() }));
  } catch (err) {
    console.error("JOB STRUCTURED DATA ERROR:", err);
    return res.status(500).json({ message: "Structured data unavailable" });
  }
});

/* =========================
   JOB SITEMAP
   GET /feeds/jobs-sitemap.xml
   Google for Jobs requires a sitemap of the job pages so it can discover and
   re-crawl the JobPosting markup.
========================= */
router.get("/feeds/jobs-sitemap.xml", async (req, res) => {
  try {
    const jobs = await Job.find(feedQuery())
      .sort({ createdAt: -1 })
      .limit(FEED_LIMIT)
      .select("_id updatedAt")
      .lean();

    const base = frontendUrl();
    const urls = jobs
      .map(
        (job) =>
          "  <url>\n" +
          `    <loc>${base}/jobs/${job._id}</loc>\n` +
          (job.updatedAt
            ? `    <lastmod>${new Date(job.updatedAt).toISOString().split("T")[0]}</lastmod>\n`
            : "") +
          "  </url>\n"
      )
      .join("");

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls +
      "</urlset>\n";

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    return res.send(xml);
  } catch (err) {
    console.error("JOB SITEMAP ERROR:", err);
    return res.status(500).send("<error>Sitemap unavailable</error>");
  }
});

module.exports = router;

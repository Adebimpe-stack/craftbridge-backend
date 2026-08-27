const express = require("express");
const crypto = require("crypto");
const zlib = require("zlib");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const Job = require("../models/Job");
const {
  buildJobFeedXml,
  buildJobSitemapXml,
  buildJobPostingJsonLd,
} = require("../utils/jobFeed");
const { validateXml } = require("../utils/xmlValidate");

const FEED_LIMIT = 5000;
const CACHE_SECONDS = 900;

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "https://craftbridgejobs.com").replace(/\/+$/, "");

// Only live, non-deleted jobs that are still open are distributed: aggregators
// penalise feeds that keep returning expired listings. The query runs on every
// request, so creating, editing, closing, deleting or letting a job expire is
// reflected in the next fetch without any regeneration step.
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

// The newest job update in the feed is the feed's real Last-Modified: it only
// moves when the syndicated content moves, so an aggregator polling every few
// minutes gets a 304 until something actually changes.
const feedLastModified = async () => {
  const [latest] = await Job.find(feedQuery())
    .sort({ updatedAt: -1 })
    .limit(1)
    .select("updatedAt")
    .lean();

  return latest?.updatedAt ? new Date(latest.updatedAt) : new Date(0);
};

/**
 * Serves generated XML with the caching and compression behaviour aggregators
 * expect: a content-derived ETag, Last-Modified, conditional GET support and
 * gzip when the client advertises it.
 */
const sendXml = (req, res, xml, lastModified) => {
  const etag = `"${crypto.createHash("sha1").update(xml).digest("hex")}"`;
  const modified = lastModified instanceof Date ? lastModified : new Date();

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
  res.set("ETag", etag);
  res.set("Last-Modified", modified.toUTCString());
  res.set("Vary", "Accept-Encoding");

  // ETag and Last-Modified describe the uncompressed feed, so conditional
  // requests are answered before compression is considered.
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = req.headers["if-modified-since"];
  const notModified =
    (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === etag)) ||
    (!ifNoneMatch &&
      ifModifiedSince &&
      !Number.isNaN(Date.parse(ifModifiedSince)) &&
      Math.floor(modified.getTime() / 1000) <=
        Math.floor(Date.parse(ifModifiedSince) / 1000));

  if (notModified) return res.status(304).end();

  if (/\bgzip\b/i.test(req.headers["accept-encoding"] || "")) {
    const gzipped = zlib.gzipSync(xml);
    res.set("Content-Encoding", "gzip");
    res.set("Content-Length", String(gzipped.length));
    return res.end(gzipped);
  }

  return res.send(xml);
};

/* =========================
   XML JOB FEED
   GET /feeds/jobs.xml
   A single feed submitted to every aggregator (Jooble, Jobrapido, Adzuna,
   Talent.com, Careerjet, Jora, ...). Google for Jobs is served by the
   JobPosting structured data on the job page instead.
========================= */
router.get("/feeds/jobs.xml", async (req, res) => {
  try {
    const [jobs, lastModified] = await Promise.all([
      loadFeedJobs(),
      feedLastModified(),
    ]);

    // Stamping the build date with the last job update rather than "now" keeps
    // the bytes — and therefore the ETag — stable until the content changes.
    const xml = buildJobFeedXml(jobs, {
      frontendUrl: frontendUrl(),
      generatedAt: lastModified.getTime() ? lastModified : new Date(),
    });

    return sendXml(req, res, xml, lastModified);
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
    const [jobs, lastModified] = await Promise.all([
      Job.find(feedQuery())
        .sort({ createdAt: -1 })
        .limit(FEED_LIMIT)
        .select("_id updatedAt createdAt")
        .lean(),
      feedLastModified(),
    ]);

    const xml = buildJobSitemapXml(jobs, { frontendUrl: frontendUrl() });

    return sendXml(req, res, xml, lastModified);
  } catch (err) {
    console.error("JOB SITEMAP ERROR:", err);
    return res.status(500).send("<error>Sitemap unavailable</error>");
  }
});

/* =========================
   SYNDICATION STATUS (ADMIN)
   GET /api/feeds/status
   Backs the admin syndication page: feed/sitemap URLs, how many jobs are
   currently syndicated, when the feed was last generated and whether the
   generated XML is well-formed.
========================= */
router.get("/feeds/status", auth, requireRole("admin"), async (req, res) => {
  try {
    const generatedAt = new Date();
    const [jobs, lastModified] = await Promise.all([
      loadFeedJobs(),
      feedLastModified(),
    ]);

    const feedXml = buildJobFeedXml(jobs, {
      frontendUrl: frontendUrl(),
      generatedAt,
    });
    const sitemapXml = buildJobSitemapXml(jobs, { frontendUrl: frontendUrl() });

    const feedValidation = validateXml(feedXml);
    const sitemapValidation = validateXml(sitemapXml);

    const apiBase = `${req.protocol}://${req.get("host")}`;

    return res.json({
      feedUrl: `${apiBase}/feeds/jobs.xml`,
      sitemapUrl: `${apiBase}/feeds/jobs-sitemap.xml`,
      frontendUrl: frontendUrl(),
      jobCount: jobs.length,
      feedLimit: FEED_LIMIT,
      generatedAt: generatedAt.toISOString(),
      lastJobUpdate:
        lastModified.getTime() > 0 ? lastModified.toISOString() : null,
      cacheSeconds: CACHE_SECONDS,
      gzipEnabled: true,
      feedSizeBytes: Buffer.byteLength(feedXml),
      gzipSizeBytes: zlib.gzipSync(feedXml).length,
      validation: {
        feed: feedValidation,
        sitemap: sitemapValidation,
        valid: feedValidation.valid && sitemapValidation.valid,
      },
    });
  } catch (err) {
    console.error("FEED STATUS ERROR:", err);
    return res.status(500).json({ message: "Feed status unavailable" });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ServiceRequest = require("../models/ServiceRequest");
const {
  buildPublicDirectoryRankingPipeline,
  buildPublicDirectoryEligibilityMatch,
} = require("../utils/professionalRanking");
const {
  recordProfileView,
  resolveViewerFromRequest,
} = require("../services/profileViewService");
const {
  slugify,
  deslugify,
  escapeRegex,
  whatsappLink,
  localPageTitle,
  localPageDescription,
} = require("../utils/localSeo");

const PUBLIC_FIELDS =
  "-password -emailVerificationToken -resetPasswordToken";

// =========================
// GET ALL PROFESSIONALS
// GET /api/professionals
// =========================
router.get("/", async (req, res) => {
  try {
    const {
      verified,
      trade,
      skill,
      location,
      minExperience,
      availability,
      emergency,
      language,
    } = req.query;

    const matchStage = {
      // Include both current jobseekers and legacy user/customer accounts that
      // look like professionals (have a trade, skills, or availability set).
      $or: [
        { role: "jobseeker" },
        {
          role: { $in: ["user", "customer"] },
          $or: [
            { primaryTrade: { $exists: true, $nin: ["", null] } },
            { skills: { $exists: true, $not: { $size: 0 } } },
            { availability: { $exists: true, $nin: ["", null] } },
          ],
        },
      ],
      // Show any account that is not explicitly suspended or deactivated.
      accountStatus: { $nin: ["suspended", "deactivated"] },
      workerVerificationStatus: { $nin: ["rejected"] },
    };

    const $and = [];

    if (verified === "true" || verified === "1") {
      $and.push({
        $or: [
          { workerVerificationStatus: "verified" },
          { isVerified: true },
        ],
      });
      delete matchStage.workerVerificationStatus;
    }

    if (location && typeof location === "string" && location.trim()) {
      const term = location.trim();
      $and.push({
        $or: [
          { location: { $regex: term, $options: "i" } },
          { city: { $regex: term, $options: "i" } },
          { state: { $regex: term, $options: "i" } },
          { country: { $regex: term, $options: "i" } },
        ],
      });
    }

    if ($and.length > 0) {
      matchStage.$and = $and;
    }

    const addRegexFilter = (field, value) => {
      if (value && typeof value === "string" && value.trim()) {
        matchStage[field] = { $regex: value.trim(), $options: "i" };
      }
    };

    addRegexFilter("primaryTrade", trade);
    addRegexFilter("availability", availability);

    if (skill && typeof skill === "string" && skill.trim()) {
      matchStage.skills = { $elemMatch: { $regex: skill.trim(), $options: "i" } };
    }

    if (language && typeof language === "string" && language.trim()) {
      matchStage.languages = { $elemMatch: { $regex: language.trim(), $options: "i" } };
    }

    if (minExperience && !isNaN(Number(minExperience))) {
      matchStage.experienceYears = { $gte: Number(minExperience) };
    }

    if (emergency === "true" || emergency === "1") {
      matchStage.emergencyService = true;
    }

    const pipeline = buildPublicDirectoryRankingPipeline(matchStage);

    // Only expose public listing fields and the score used for ranking.
    pipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        name: 1,
        profilePicture: 1,
        profileImage: 1,
        primaryTrade: 1,
        category: 1,
        location: 1,
        city: 1,
        state: 1,
        country: 1,
        workerVerificationStatus: 1,
        isVerified: 1,
        availability: 1,
        experienceYears: 1,
        skills: 1,
        profileCompletionScore: 1,
        createdAt: 1,
        portfolio: 1,
        phone: 1,
        socialLinks: 1,
      },
    });

    const rows = await User.aggregate(pipeline);

    // Verified professionals carry a WhatsApp deep link; the number itself
    // never leaves the server.
    const professionals = rows.map(({ phone, socialLinks, ...rest }) => ({
      ...rest,
      whatsappUrl:
        rest.workerVerificationStatus === "verified" || rest.isVerified
          ? whatsappLink(socialLinks?.whatsapp || phone || socialLinks?.phone)
          : null,
    }));

    res.json({ professionals });
  } catch (err) {
    console.error("PROFESSIONALS LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET FEATURED PROFESSIONALS
// GET /api/professionals/featured?limit=5
// A hard-capped showroom for the homepage: verified professionals with work
// samples only, so the public never learns how large the network actually is.
// Declared before /:id so "featured" is not read as an id.
// =========================
router.get("/featured", async (req, res) => {
  try {
    const requested = Number(req.query.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 5, 1),
      5
    );

    const baseMatch = () => ({
      $or: [
        { role: "jobseeker" },
        {
          role: { $in: ["user", "customer"] },
          primaryTrade: { $exists: true, $nin: ["", null] },
        },
      ],
      accountStatus: { $nin: ["suspended", "deactivated"] },
      $and: [
        {
          $or: [
            { workerVerificationStatus: "verified" },
            { isVerified: true },
          ],
        },
        // A showroom is only worth showing with complete profiles in it.
        buildPublicDirectoryEligibilityMatch(),
      ],
    });

    const projection = {
      $project: {
        _id: 1,
        name: 1,
        profilePicture: 1,
        profileImage: 1,
        primaryTrade: 1,
        location: 1,
        city: 1,
        state: 1,
        country: 1,
        workerVerificationStatus: 1,
        isVerified: 1,
        experienceYears: 1,
        skills: 1,
        portfolio: 1,
        phone: 1,
        socialLinks: 1,
      },
    };

    const topRanked = async (matchStage, count, excludeIds = []) => {
      if (count <= 0) return [];
      if (excludeIds.length) matchStage._id = { $nin: excludeIds };

      const pipeline = buildPublicDirectoryRankingPipeline(matchStage);
      pipeline.push({ $limit: count }, projection);
      return User.aggregate(pipeline);
    };

    const withPortfolio = baseMatch();
    withPortfolio.$and.push({ portfolio: { $exists: true, $not: { $size: 0 } } });

    // Work samples first, but a young network shouldn't leave the showroom
    // empty, so the remaining slots fall back to top-ranked verified profiles.
    const professionals = await topRanked(withPortfolio, limit);
    if (professionals.length < limit) {
      professionals.push(
        ...(await topRanked(
          baseMatch(),
          limit - professionals.length,
          professionals.map((p) => p._id)
        ))
      );
    }

    res.json({
      professionals: professionals.map(({ phone, socialLinks, ...rest }) => ({
        ...rest,
        whatsappUrl: whatsappLink(
          socialLinks?.whatsapp || phone || socialLinks?.phone
        ),
      })),
    });
  } catch (err) {
    console.error("FEATURED PROFESSIONALS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// The landing pages are a discovery surface, not a directory dump: three cards
// is enough to prove the network is real without revealing its size.
const LOCAL_PAGE_CARD_LIMIT = 3;

// Public listing shape for a landing page card. `phone` never leaves the server
// on its own — only the pre-formatted wa.me link derived from it does.
const LOCAL_CARD_PROJECTION = {
  $project: {
    _id: 1,
    name: 1,
    profilePicture: 1,
    profileImage: 1,
    primaryTrade: 1,
    location: 1,
    city: 1,
    state: 1,
    country: 1,
    workerVerificationStatus: 1,
    isVerified: 1,
    experienceYears: 1,
    availability: 1,
    skills: 1,
    portfolio: 1,
    profileCompletionScore: 1,
    phone: 1,
    socialLinks: 1,
  },
};

// A professional is on a landing page when their trade and their location both
// match the slugs, using the same visibility rules as the directory.
const localPageMatch = (tradeLabel, locationLabel) => ({
  $or: [
    { role: "jobseeker" },
    {
      role: { $in: ["user", "customer"] },
      primaryTrade: { $exists: true, $nin: ["", null] },
    },
  ],
  accountStatus: { $nin: ["suspended", "deactivated"] },
  primaryTrade: { $regex: escapeRegex(tradeLabel), $options: "i" },
  $and: [
    { $or: [{ workerVerificationStatus: "verified" }, { isVerified: true }] },
    buildPublicDirectoryEligibilityMatch(),
    {
      $or: [
        { city: { $regex: escapeRegex(locationLabel), $options: "i" } },
        { state: { $regex: escapeRegex(locationLabel), $options: "i" } },
        { location: { $regex: escapeRegex(locationLabel), $options: "i" } },
      ],
    },
  ],
});

// =========================
// GET LOCALIZED TRADE LANDING PAGE
// GET /api/professionals/local/:trade/:location
// Backs the programmatic SEO pages: up to three ranked cards plus the title
// and description the page renders. An empty result is a valid response — the
// page falls back to its matchmaking block rather than 404ing, so the URL
// keeps its ranking while we source someone.
// Declared before /:id so "local" is not read as an id.
// =========================
router.get("/local/:trade/:location", async (req, res) => {
  try {
    const tradeLabel = deslugify(req.params.trade);
    const locationLabel = deslugify(req.params.location);

    if (!tradeLabel || !locationLabel) {
      return res.status(400).json({ message: "Trade and location are required" });
    }

    const pipeline = buildPublicDirectoryRankingPipeline(
      localPageMatch(tradeLabel, locationLabel)
    );
    pipeline.push({ $limit: LOCAL_PAGE_CARD_LIMIT }, LOCAL_CARD_PROJECTION);

    const matches = await User.aggregate(pipeline);

    const professionals = matches.map(({ phone, socialLinks, ...rest }) => ({
      ...rest,
      whatsappUrl: whatsappLink(
        socialLinks?.whatsapp || phone || socialLinks?.phone
      ),
    }));

    // The region shown in the title ("Lekki, Lagos") comes from the people we
    // actually have there, so it stays accurate without a location table.
    const region =
      professionals.find(
        (p) => p.state && p.state.toLowerCase() !== locationLabel.toLowerCase()
      )?.state || "";

    return res.json({
      trade: tradeLabel,
      tradeSlug: slugify(tradeLabel),
      location: locationLabel,
      locationSlug: slugify(locationLabel),
      region,
      title: localPageTitle(tradeLabel, locationLabel, region),
      description: localPageDescription(tradeLabel, locationLabel, region),
      professionals,
    });
  } catch (err) {
    console.error("LOCAL TRADE PAGE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// DIRECTORY SITEMAP
// GET /api/professionals/sitemap.xml
// Regenerated on every request from the distinct trade/location pairs in the
// database, so a landing page is listed the moment the artisan who created it
// registers — no build step and nothing to keep in sync.
// Declared before /:id so "sitemap.xml" is not read as an id.
// =========================
router.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = (
      process.env.FRONTEND_URL || "https://craftbridgejobs.com"
    ).replace(/\/+$/, "");

    const rows = await User.aggregate([
      {
        $match: {
          $or: [
            { role: "jobseeker" },
            {
              role: { $in: ["user", "customer"] },
              primaryTrade: { $exists: true, $nin: ["", null] },
            },
          ],
          accountStatus: { $nin: ["suspended", "deactivated"] },
          $and: [
            {
              $or: [
                { workerVerificationStatus: "verified" },
                { isVerified: true },
              ],
            },
            buildPublicDirectoryEligibilityMatch(),
          ],
        },
      },
      {
        $group: {
          _id: {
            trade: { $toLower: "$primaryTrade" },
            location: { $toLower: { $ifNull: ["$city", "$location"] } },
          },
          updatedAt: { $max: "$updatedAt" },
        },
      },
    ]);

    const urls = new Map();
    for (const row of rows) {
      const trade = slugify(row._id.trade);
      const location = slugify(row._id.location);
      if (!trade || !location) continue;

      const loc = `${baseUrl}/professionals/${trade}/${location}`;
      const lastmod = (row.updatedAt || new Date()).toISOString().split("T")[0];
      const existing = urls.get(loc);
      if (!existing || existing < lastmod) urls.set(loc, lastmod);
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      [...urls.entries()]
        .map(
          ([loc, lastmod]) =>
            `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
            "    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>"
        )
        .join("\n") +
      "\n</urlset>";

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(xml);
  } catch (err) {
    console.error("DIRECTORY SITEMAP ERROR:", err);
    return res.status(500).send("<error>Sitemap unavailable</error>");
  }
});

// =========================
// GET SINGLE PROFESSIONAL
// GET /api/professionals/:id
// Contact info is only shown if the logged-in client has an accepted request
// =========================
router.get("/:id", async (req, res) => {
  try {
    const professional = await User.findById(req.params.id).select(
      PUBLIC_FIELDS
    );

    if (!professional) {
      return res.status(404).json({ message: "Professional not found" });
    }

    if (professional.role !== "jobseeker") {
      return res.status(404).json({ message: "Professional not found" });
    }

    const isVisible =
      professional.role === "jobseeker" &&
      !["rejected"].includes(professional.workerVerificationStatus) &&
      !["suspended", "deactivated"].includes(professional.accountStatus);

    if (!isVisible) {
      return res.status(404).json({ message: "Professional not found" });
    }

    // Decode the viewer once so it can be reused for contact unlocking and
    // profile view analytics.
    let viewer = null;
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const viewerId = decoded.user?.id || decoded.id;
        if (viewerId) {
          viewer = await User.findById(viewerId).select("_id role companyId");
        }
      } catch (e) {
        // token invalid — remain a guest viewer
      }
    }

    const result = professional.toObject();

    // Preserve whether sensitive data exists before we strip it
    const hasResume = !!(
      result.resumeUrl ||
      result.resume ||
      result.resumeData ||
      result.resumeText
    );
    const hasPhone = !!(
      result.phone ||
      result.socialLinks?.phone ||
      result.socialLinks?.whatsapp
    );
    const hasEmail = !!(result.email || result.companyEmail);
    const hasContact = hasPhone || hasEmail;

    let showContact = false;
    if (viewer) {
      // Admins can always see contact information
      if (viewer.role === "admin") {
        showContact = true;
      } else {
        const clientId = viewer._id;
        const companyId = viewer.companyId;

        const acceptedRequests = await ServiceRequest.find({
          professional: req.params.id,
          status: { $in: ["accepted", "completed"] },
        }).populate("client", "companyId");

        const hasUnlock = acceptedRequests.some((r) => {
          if (String(r.client?._id) === String(clientId)) return true;
          if (!companyId) return false;
          return (
            String(r.companyId) === String(companyId) ||
            String(r.client?.companyId) === String(companyId)
          );
        });

        if (hasUnlock) {
          showContact = true;
        }
      }
    }

    if (!showContact) {
      delete result.phone;
      delete result.email;
      delete result.companyEmail;
      delete result.resumeUrl;
      delete result.resume;
      delete result.resumeData;
      delete result.resumeText;
    }

    // Verified professionals are reachable on WhatsApp straight from the
    // profile. Only the deep link leaves the server, never the raw number.
    const isVerifiedProfile =
      professional.workerVerificationStatus === "verified" ||
      professional.isVerified === true;
    const whatsappSource =
      professional.socialLinks?.whatsapp ||
      professional.phone ||
      professional.socialLinks?.phone;
    result.whatsappUrl = isVerifiedProfile ? whatsappLink(whatsappSource) : null;

    result.hasResume = hasResume;
    result.hasContact = hasContact;
    result.hasPhone = hasPhone;
    result.hasEmail = hasEmail;
    result.showContact = showContact;

    // Record the profile view asynchronously; exclude self-views, admin views,
    // and other professional views. Only guest and employer/company views count
    // toward engagement analytics. Duplicate refreshes within the cooldown window
    // are dropped.
    const isSelfView = viewer && String(viewer._id) === String(professional._id);
    const isJobSeekerView = viewer && viewer.role === "jobseeker";
    const isAdminView = viewer && viewer.role === "admin";
    if (!isSelfView && !isJobSeekerView && !isAdminView) {
      const viewerInfo = resolveViewerFromRequest(viewer);
      recordProfileView({
        professionalId: professional._id,
        viewerType: viewerInfo.viewerType,
        viewerId: viewerInfo.viewerId,
        viewerIp: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        source: "public_directory",
      }).catch((err) => console.error("PROFILE VIEW RECORD ERROR:", err));
    }

    res.json(result);
  } catch (err) {
    console.error("PROFESSIONAL DETAIL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

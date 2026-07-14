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
      country,
      state,
      city,
      minExperience,
      availability,
      emergency,
      language,
    } = req.query;

    const matchStage = {
      role: "jobseeker",
      // Only active accounts appear publicly. Treat missing accountStatus as
      // active because older documents rely on the schema default.
      accountStatus: { $in: ["active", null] },
      workerVerificationStatus: { $nin: ["rejected"] },
      ...buildPublicDirectoryEligibilityMatch(),
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
    addRegexFilter("country", country);
    addRegexFilter("state", state);
    addRegexFilter("city", city);
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
      },
    });

    const professionals = await User.aggregate(pipeline);

    res.json({ professionals });
  } catch (err) {
    console.error("PROFESSIONALS LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET SINGLE PROFESSIONAL
// GET /api/professionals/:id
// Contact info is only shown if the logged-in client has an accepted request
// =========================
router.get("/:id", async (req, res) => {
  console.log("USING PROFESSIONAL ROUTE");
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

    if (!showContact) {
      delete result.phone;
      delete result.email;
      delete result.companyEmail;
      delete result.resumeUrl;
      delete result.resume;
      delete result.resumeData;
      delete result.resumeText;
    }

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

    console.log({
      hasResume,
      hasContact,
      showContact,
    });

    res.json(result);
  } catch (err) {
    console.error("PROFESSIONAL DETAIL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

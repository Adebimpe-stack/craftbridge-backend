const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const Company = require("../models/Company");
const Job = require("../models/Job");
const Application = require("../models/Application");
const ServiceRequest = require("../models/ServiceRequest");
const EmployerProfessionalNote = require("../models/EmployerProfessionalNote");
const ProfileView = require("../models/ProfileView");
const { isPubliclyEligible } = require("../utils/professionalRanking");
const { getProfileViewAnalytics } = require("../services/profileViewService");

// =========================
// HELPERS
// =========================

async function getCompanyMemberIds(companyId) {
  const company = await Company.findById(companyId).select("teamMembers owner");
  if (!company) return [];
  const ids = new Set();
  if (company.owner) ids.add(String(company.owner));
  (company.teamMembers || []).forEach((id) => ids.add(String(id)));
  return Array.from(ids);
}

// =========================
// PROFILE COMPLETION HELPERS
// =========================

function calculateProfessionalCompletion(user) {
  const checkList = [
    { key: "profilePicture", label: "Profile Picture", done: !!(user.profilePicture || user.profileImage) },
    { key: "primaryTrade", label: "Primary Trade", done: !!(user.primaryTrade) },
    { key: "bio", label: "About Me", done: !!(user.bio || user.professionalSummary) },
    { key: "location", label: "Location", done: !!(user.location || user.city || user.state || user.country) },
    { key: "phone", label: "Phone Number", done: !!(user.phone) },
    { key: "skills", label: "Skills", done: Array.isArray(user.skills) && user.skills.length > 0 },
    { key: "experience", label: "Experience", done: typeof user.experienceYears === "number" && user.experienceYears > 0 },
    { key: "resume", label: "Resume", done: !!(user.resume || user.resumeUrl || user.resumeText || user.resumeData) },
    { key: "certifications", label: "Certifications", done: Array.isArray(user.certifications) && user.certifications.length > 0 },
  ];

  const completed = checkList.filter((c) => c.done).length;
  const percentage = Math.round((completed / checkList.length) * 100);
  const remaining = checkList.filter((c) => !c.done).map((c) => c.label);

  return { percentage, total: checkList.length, completed, remaining };
}

async function calculateEmployerCompletion(user) {
  const company = user.companyId
    ? await Company.findById(user.companyId).lean()
    : null;

  let checks = [];
  if (company) {
    checks = [
      !!company.name,
      !!company.industry,
      !!company.companySize,
      !!company.location,
      !!company.description,
      !!company.website,
      !!company.logo,
      !!company.phone,
    ];
  } else {
    checks = [
      !!user.name,
      !!user.email,
      !!user.phone,
      !!user.companyEmail,
      !!(user.location || user.city || user.state),
      !!(user.profilePicture || user.profileImage),
      !!(user.industry || user.bio),
      !!(user.website),
    ];
  }

  const completed = checks.filter(Boolean).length;
  const percentage = Math.round((completed / checks.length) * 100);

  return {
    percentage,
    total: checks.length,
    completed,
    source: company ? "company" : "user",
  };
}

async function getRemainingServiceRequests(user) {
  const now = new Date();
  const subscriptionActive =
    user.subscriptionActive &&
    user.subscriptionExpiry &&
    new Date(user.subscriptionExpiry) > now;

  if (subscriptionActive && user.serviceRequestsRemaining === -1) {
    return Infinity;
  }

  if (subscriptionActive) {
    return user.serviceRequestsRemaining || 0;
  }

  return user.hasUsedFreeServiceRequest ? 0 : 1;
}

// =========================
// EMPLOYER DASHBOARD STATS
// GET /api/dashboard/employer
// =========================
router.get("/employer", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const owner = user.companyId
      ? { ownerType: "company", ownerId: user.companyId }
      : { ownerType: "user", ownerId: user._id };

    const requestQuery =
      owner.ownerType === "company"
        ? {
            $or: [
              { companyId: owner.ownerId },
              { client: { $in: await getCompanyMemberIds(owner.ownerId) } },
            ],
          }
        : { client: owner.ownerId };

    // Job and application metrics for the employer/company.
    const jobQuery = owner.ownerType === "company"
      ? { companyId: owner.ownerId, isDeleted: false }
      : { createdBy: owner.ownerId, isDeleted: false };

    const [totalRequests, accepted, completed, savedCount, completion, jobs, applications] =
      await Promise.all([
        ServiceRequest.countDocuments(requestQuery),
        ServiceRequest.countDocuments({ ...requestQuery, status: "accepted" }),
        ServiceRequest.countDocuments({ ...requestQuery, status: "completed" }),
        EmployerProfessionalNote.countDocuments({
          ...owner,
          isSaved: true,
        }),
        calculateEmployerCompletion(user),
        Job.find(jobQuery).select("_id status").lean(),
        Application.countDocuments({
          job: { $in: (await Job.find(jobQuery).select("_id").lean()).map((j) => j._id) },
        }),
      ]);

    const jobIds = jobs.map((j) => j._id);
    const activeJobs = jobs.filter((j) => j.status === "active").length;

    // Recent service requests.
    const recentServiceRequests = await ServiceRequest.find(requestQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .select("serviceType status createdAt")
      .lean();

    // Recently viewed professionals by this employer/company user.
    const recentProfessionalViews = await ProfileView.find({
      viewer: user._id,
      viewerType: "company",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("professional", "name primaryTrade profileImage profilePicture")
      .select("professional createdAt")
      .lean();

    const remaining = await getRemainingServiceRequests(user);

    res.json({
      jobs: {
        posted: jobs.length,
        active: activeJobs,
      },
      applicationsReceived: applications,
      serviceRequests: {
        total: totalRequests,
        accepted,
        completed,
        recent: recentServiceRequests,
        remaining: remaining === Infinity ? -1 : remaining,
        unlimited: remaining === Infinity,
      },
      savedProfessionals: savedCount,
      recentProfessionalViews: recentProfessionalViews.map((view) => ({
        professionalId: view.professional?._id || null,
        name: view.professional?.name || "Unknown",
        primaryTrade: view.professional?.primaryTrade || "",
        profileImage: view.professional?.profileImage || view.professional?.profilePicture || "",
        viewedAt: view.createdAt,
      })),
      notifications: [], // Reserved for the internal notification system.
      profileCompletion: completion,
    });
  } catch (err) {
    console.error("EMPLOYER DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL DASHBOARD STATS
// GET /api/dashboard/professional
// =========================
router.get("/professional", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const professionalId = user._id;

    const [incoming, accepted, completed, completion, profileViews] = await Promise.all([
      ServiceRequest.countDocuments({ professional: professionalId }),
      ServiceRequest.countDocuments({
        professional: professionalId,
        status: "accepted",
      }),
      ServiceRequest.countDocuments({
        professional: professionalId,
        status: "completed",
      }),
      calculateProfessionalCompletion(user),
      getProfileViewAnalytics(professionalId),
    ]);

    res.json({
      serviceRequests: {
        incoming,
        accepted,
        completed,
      },
      profileCompletion: completion,
      profileViews,
      isPubliclyEligible: isPubliclyEligible(user),
    });
  } catch (err) {
    console.error("PROFESSIONAL DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

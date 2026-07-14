const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const Company = require("../models/Company");
const ServiceRequest = require("../models/ServiceRequest");
const EmployerProfessionalNote = require("../models/EmployerProfessionalNote");
const { isPubliclyEligible } = require("../utils/professionalRanking");

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
  const checks = [
    !!(user.profilePicture || user.profileImage),
    !!(user.primaryTrade),
    !!(user.bio || user.professionalSummary),
    !!(user.location || user.city || user.state || user.country),
    !!(user.phone),
    Array.isArray(user.skills) && user.skills.length > 0,
    typeof user.experienceYears === "number" && user.experienceYears > 0,
    !!(user.resume || user.resumeUrl || user.resumeText || user.resumeData),
    Array.isArray(user.certifications) && user.certifications.length > 0,
  ];

  const completed = checks.filter(Boolean).length;
  const percentage = Math.round((completed / checks.length) * 100);

  return { percentage, total: checks.length, completed };
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

    const [totalRequests, accepted, completed, savedCount, completion] =
      await Promise.all([
        ServiceRequest.countDocuments(requestQuery),
        ServiceRequest.countDocuments({ ...requestQuery, status: "accepted" }),
        ServiceRequest.countDocuments({ ...requestQuery, status: "completed" }),
        EmployerProfessionalNote.countDocuments({
          ...owner,
          isSaved: true,
        }),
        calculateEmployerCompletion(user),
      ]);

    const remaining = await getRemainingServiceRequests(user);

    res.json({
      serviceRequests: {
        total: totalRequests,
        accepted,
        completed,
        remaining: remaining === Infinity ? -1 : remaining,
        unlimited: remaining === Infinity,
      },
      savedProfessionals: savedCount,
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

    const [incoming, accepted, completed, completion] = await Promise.all([
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
    ]);

    res.json({
      serviceRequests: {
        incoming,
        accepted,
        completed,
      },
      profileCompletion: completion,
      isPubliclyEligible: isPubliclyEligible(user),
    });
  } catch (err) {
    console.error("PROFESSIONAL DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

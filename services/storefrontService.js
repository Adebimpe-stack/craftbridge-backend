const User = require("../models/User");
const OutboundClick = require("../models/OutboundClick");
const { getProfileViewAnalytics } = require("./profileViewService");
const {
  isPubliclyEligible,
  getPublicDirectoryIneligibilityReasons,
} = require("../utils/professionalRanking");

const STOREFRONT_FIELDS =
  "name role headline primaryTrade city state country location profilePicture portfolio experienceYears availability certifiedBy workerVerificationStatus isVerified ratingAverage ratingCount createdAt";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// A professional's "digital storefront": the card clients see, plus the
// engagement numbers behind it. Shared by the professional dashboard and admin.
async function getStorefront(userId) {
  const user = await User.findById(userId).select(STOREFRONT_FIELDS).lean();
  if (!user || user.role !== "jobseeker") return null;

  const [views, contactsTotal, contactsLast30Days] = await Promise.all([
    getProfileViewAnalytics(user._id),
    OutboundClick.countDocuments({ artisan: user._id }),
    OutboundClick.countDocuments({
      artisan: user._id,
      createdAt: { $gte: new Date(Date.now() - THIRTY_DAYS_MS) },
    }),
  ]);

  return {
    profile: {
      _id: user._id,
      name: user.name,
      headline: user.headline || "",
      primaryTrade: user.primaryTrade || "",
      location: [user.city, user.state, user.country].filter(Boolean).join(", ") || user.location || "",
      profilePicture: user.profilePicture || "",
      portfolio: (user.portfolio || [])
        .filter((item) => item.url && item.type !== "video")
        .slice(0, 3)
        .map((item) => ({ url: item.url, caption: item.caption || "" })),
      experienceYears: user.experienceYears || 0,
      availability: user.availability || "",
      certifiedBy: (user.certifiedBy || []).map((c) => c.body),
      verified: user.workerVerificationStatus === "verified",
      ratingAverage: user.ratingAverage || 0,
      ratingCount: user.ratingCount || 0,
      memberSince: user.createdAt,
    },
    live: isPubliclyEligible(user),
    missing: getPublicDirectoryIneligibilityReasons(user),
    stats: {
      viewsTotal: views.total,
      viewsThisWeek: views.thisWeek,
      contactsTotal,
      contactsLast30Days,
      reviews: user.ratingCount || 0,
    },
  };
}

module.exports = { getStorefront };

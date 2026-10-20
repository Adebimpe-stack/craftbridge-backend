const User = require("../models/User");
const OutboundClick = require("../models/OutboundClick");
const ProfileView = require("../models/ProfileView");
const { getProfileViewAnalytics } = require("./profileViewService");
const {
  isPubliclyEligible,
  getPublicDirectoryIneligibilityReasons,
} = require("../utils/professionalRanking");

const STOREFRONT_FIELDS =
  "name role headline primaryTrade city state country location profilePicture portfolio experienceYears availability certifications certifiedBy workerVerificationStatus isVerified ratingAverage ratingCount createdAt";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toStorefrontCard(user) {
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
    tips: [
      ...(!user.certifications?.length && !user.certifiedBy?.length
        ? ["Add your certifications to stand out"]
        : []),
    ],
  };
}

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
    ...toStorefrontCard(user),
    stats: {
      viewsTotal: views.total,
      viewsThisWeek: views.thisWeek,
      contactsTotal,
      contactsLast30Days,
      reviews: user.ratingCount || 0,
    },
  };
}

const countBy = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));

// Every professional's storefront card for the admin directory, with phone
// numbers so admins can reach them when matching a client request.
async function listStorefronts() {
  const users = await User.find({ role: "jobseeker", accountStatus: { $ne: "deactivated" } })
    .select(`${STOREFRONT_FIELDS} phone`)
    .lean();
  const ids = users.map((u) => u._id);

  const [views, contacts] = await Promise.all([
    ProfileView.aggregate([
      { $match: { professional: { $in: ids } } },
      { $group: { _id: "$professional", count: { $sum: 1 } } },
    ]),
    OutboundClick.aggregate([
      { $match: { artisan: { $in: ids }, createdAt: { $gte: new Date(Date.now() - THIRTY_DAYS_MS) } } },
      { $group: { _id: "$artisan", count: { $sum: 1 } } },
    ]),
  ]);
  const viewsById = countBy(views);
  const contactsById = countBy(contacts);

  return users
    .map((user) => ({
      ...toStorefrontCard(user),
      phone: user.phone || "",
      stats: {
        viewsTotal: viewsById.get(String(user._id)) || 0,
        contactsLast30Days: contactsById.get(String(user._id)) || 0,
        reviews: user.ratingCount || 0,
      },
    }))
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) ||
        Number(b.profile.verified) - Number(a.profile.verified) ||
        b.profile.certifiedBy.length - a.profile.certifiedBy.length ||
        b.profile.ratingAverage - a.profile.ratingAverage ||
        b.stats.contactsLast30Days - a.stats.contactsLast30Days
    );
}

module.exports = { getStorefront, listStorefronts };

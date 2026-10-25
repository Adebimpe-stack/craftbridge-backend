const User = require("../models/User");
const OutboundClick = require("../models/OutboundClick");
const ProfileView = require("../models/ProfileView");
const Review = require("../models/Review");
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

const ACTIVITY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Admin-only detail behind a storefront's numbers: who viewed, who made
// contact and what they said. IPs and user agents are deliberately left out.
async function getStorefrontActivity(userId) {
  const user = await User.findById(userId).select("role").lean();
  if (!user || user.role !== "jobseeker") return null;

  const professional = user._id;
  const since30 = new Date(Date.now() - THIRTY_DAYS_MS);
  const [viewsByType, viewsByDay, recentViews, contactsByType, recentContacts, reviews] = await Promise.all([
    ProfileView.aggregate([
      { $match: { professional } },
      { $group: { _id: "$viewerType", count: { $sum: 1 } } },
    ]),
    ProfileView.aggregate([
      { $match: { professional, createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Africa/Lagos" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ProfileView.find({ professional })
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT)
      .populate("viewer", "name")
      .select("viewerType viewer source createdAt")
      .lean(),
    OutboundClick.aggregate([
      { $match: { artisan: professional } },
      {
        $group: {
          _id: "$type",
          total: { $sum: 1 },
          last30Days: { $sum: { $cond: [{ $gte: ["$createdAt", since30] }, 1, 0] } },
        },
      },
    ]),
    OutboundClick.find({ artisan: professional })
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT)
      .select("type clientName clientPhone refCode targetLocationPage createdAt")
      .lean(),
    Review.find({ professional })
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT)
      .select("clientName rating hired comment status refCode createdAt")
      .lean(),
  ]);

  const contactCount = (type, field) => contactsByType.find((row) => row._id === type)?.[field] || 0;
  const viewsPerDay = new Map(viewsByDay.map((row) => [row._id, row.count]));
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * DAY_MS).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    return { date, count: viewsPerDay.get(date) || 0 };
  });

  return {
    views: {
      total: viewsByType.reduce((sum, row) => sum + row.count, 0),
      byViewerType: Object.fromEntries(viewsByType.map((row) => [row._id || "guest", row.count])),
      last30Days: last30,
      recent: recentViews.map((v) => ({
        at: v.createdAt,
        viewerType: v.viewerType,
        viewerName: v.viewer?.name || "",
        source: v.source,
      })),
    },
    contacts: {
      whatsapp: { total: contactCount("whatsapp_click", "total"), last30Days: contactCount("whatsapp_click", "last30Days") },
      calls: { total: contactCount("phone_call_click", "total"), last30Days: contactCount("phone_call_click", "last30Days") },
      recent: recentContacts.map((c) => ({
        at: c.createdAt,
        method: c.type === "phone_call_click" ? "call" : "whatsapp",
        clientName: c.clientName,
        clientPhone: c.clientPhone,
        refCode: c.refCode || "",
        page: c.targetLocationPage,
      })),
    },
    reviews: reviews.map((r) => ({
      _id: r._id,
      at: r.createdAt,
      clientName: r.clientName,
      rating: r.rating,
      hired: r.hired,
      comment: r.comment,
      status: r.status,
      refCode: r.refCode,
    })),
  };
}

module.exports = { getStorefront, listStorefronts, getStorefrontActivity };

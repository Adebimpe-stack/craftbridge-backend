const ProfileView = require("../models/ProfileView");

// Prevent duplicate refreshes from the same viewer/IP within this window.
const VIEW_COOLDOWN_MINUTES = 5;

/**
 * Record a profile view unless it should be excluded or is a duplicate within
 * the cooldown window.
 *
 * @param {Object} options
 * @param {string} options.professionalId - MongoDB _id of the professional being viewed
 * @param {string} options.viewerType - "guest", "employer", "company"
 * @param {string|null} options.viewerId - MongoDB _id of the logged-in viewer, if any
 * @param {string|null} options.viewerIp - IP address of the requester
 * @param {string|null} options.userAgent - User-Agent string
 * @param {string} options.source - Optional tracking source
 * @returns {Promise<boolean>} true if a new view was recorded
 */
async function recordProfileView({
  professionalId,
  viewerType,
  viewerId = null,
  viewerIp = null,
  userAgent = null,
  source = "public_directory",
}) {
  if (!professionalId) return false;

  // Self-views and admin views are excluded by the caller; this is a safety net.
  if (viewerType === "admin") return false;

  const cooldownWindow = new Date(Date.now() - VIEW_COOLDOWN_MINUTES * 60 * 1000);

  const query = {
    professional: professionalId,
    createdAt: { $gte: cooldownWindow },
  };

  if (viewerId) {
    query.viewer = viewerId;
  } else if (viewerIp) {
    query.viewerIp = viewerIp;
    query.viewer = null;
  }

  const recentView = await ProfileView.findOne(query).lean();
  if (recentView) return false;

  await ProfileView.create({
    professional: professionalId,
    viewerType,
    viewer: viewerId,
    viewerIp,
    userAgent,
    source,
  });

  return true;
}

/**
 * Resolve the viewer type and ID from a decoded user object.
 *
 * @param {Object|null} user - Decoded user object (e.g., from JWT or auth middleware)
 * @returns {{viewerType: string, viewerId: string|null}}
 */
function resolveViewerFromRequest(user) {
  if (!user || !user._id) {
    return { viewerType: "guest", viewerId: null };
  }

  const viewerId = user._id.toString ? user._id.toString() : user._id;

  // Admin and jobseeker views are treated as anonymous guests so they do not
  // pollute the employer-interest analytics. Self-views are excluded by the caller.
  if (user.role === "admin" || user.role === "jobseeker") {
    return { viewerType: "guest", viewerId: null };
  }

  if (user.role === "employer" || user.role === "company") {
    return { viewerType: "company", viewerId };
  }

  return { viewerType: "guest", viewerId: null };
}

/**
 * Get profile view analytics for a professional.
 *
 * @param {string} professionalId
 * @returns {Promise<{total: number, thisWeek: number, lastWeek: number, change: number}>}
 */
async function getProfileViewAnalytics(professionalId) {
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const endOfLastWeek = new Date(startOfThisWeek);

  const [total, thisWeek, lastWeek] = await Promise.all([
    ProfileView.countDocuments({ professional: professionalId }),
    ProfileView.countDocuments({
      professional: professionalId,
      createdAt: { $gte: startOfThisWeek },
    }),
    ProfileView.countDocuments({
      professional: professionalId,
      createdAt: { $gte: startOfLastWeek, $lt: endOfLastWeek },
    }),
  ]);

  const change = thisWeek - lastWeek;

  return { total, thisWeek, lastWeek, change };
}

module.exports = {
  recordProfileView,
  resolveViewerFromRequest,
  getProfileViewAnalytics,
};

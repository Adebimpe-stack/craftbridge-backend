const User = require("../models/User");
const Company = require("../models/Company");

// =========================
// SUBSCRIPTION SYNC HELPER
// Company is the authoritative source for employer subscription status.
// This helper writes the same state to the user record so backend checks,
// cron jobs, and legacy code paths stay consistent.
// =========================
const syncSubscriptionToUser = async (companyId, userId) => {
  if (!companyId && !userId) return;

  const company = companyId ? await Company.findById(companyId) : null;
  const user = userId ? await User.findById(userId) : null;

  if (!company && !user) return;

  const now = new Date();
  const isActive =
    company?.subscriptionActive &&
    company?.subscriptionExpiry &&
    new Date(company.subscriptionExpiry) > now;

  const plan = company?.subscriptionPlan || "free";
  const expiry = company?.subscriptionExpiry || null;

  const update = {
    subscriptionActive: isActive,
    subscriptionPlan: plan,
    subscriptionExpiry: expiry,
  };

  // Also keep the embedded subscription object in sync
  if (expiry) {
    update.subscription = {
      plan,
      isActive,
      startDate: user?.subscription?.startDate || new Date(),
      expiresAt: expiry,
    };
  } else {
    update.subscription = {
      plan: "free",
      isActive: false,
      startDate: null,
      expiresAt: null,
    };
  }

  if (user) {
    await User.findByIdAndUpdate(user._id, update, { runValidators: false });
  }
};

// =========================
// ACTIVATE SUBSCRIPTION
// Sets the company as the active subscriber and mirrors to user.
// =========================
const activateSubscription = async (companyId, userId, plan = "premium", days = 30) => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);

  if (companyId) {
    await Company.findByIdAndUpdate(companyId, {
      subscriptionActive: true,
      subscriptionPlan: plan,
      subscriptionExpiry: expiry,
    }, { runValidators: false });
  }

  await syncSubscriptionToUser(companyId, userId);

  return { plan, expiry };
};

module.exports = {
  syncSubscriptionToUser,
  activateSubscription,
};

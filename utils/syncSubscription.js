const User = require("../models/User");
const Company = require("../models/Company");

// =========================
// SUBSCRIPTION SYNC HELPER
// Company is the authoritative source for employer subscription status.
// This helper mirrors the Company's current subscription state to the user
// so backend checks, cron jobs, and legacy code paths stay consistent.
// =========================
const syncSubscriptionToUser = async (companyId, userId) => {
  if (!companyId || !userId) return;

  const company = await Company.findById(companyId);
  const user = await User.findById(userId);

  if (!company || !user) return;

  const now = new Date();
  const isActive =
    company.subscriptionActive &&
    company.subscriptionExpiry &&
    new Date(company.subscriptionExpiry) > now;

  const plan = company.subscriptionPlan || "free";
  const expiry = company.subscriptionExpiry || null;

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
      startDate: user.subscription?.startDate || new Date(),
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

  await User.findByIdAndUpdate(user._id, update, { runValidators: false });
};

// =========================
// ACTIVATE SUBSCRIPTION
// Sets the company as the active subscriber and mirrors to the user.
// If no company is linked, the user record is activated directly.
// =========================
const activateSubscription = async (companyId, userId, plan = "premium", days = 30) => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);

  // Service request entitlement: -1 means unlimited for this plan
  const serviceRequestsRemaining = -1;

  if (companyId) {
    await Company.findByIdAndUpdate(companyId, {
      subscriptionActive: true,
      subscriptionPlan: plan,
      subscriptionExpiry: expiry,
    }, { runValidators: false });

    await User.findByIdAndUpdate(userId, {
      subscriptionActive: true,
      subscriptionPlan: plan,
      subscriptionExpiry: expiry,
      serviceRequestsRemaining,
      subscription: {
        plan,
        isActive: true,
        startDate: new Date(),
        expiresAt: expiry,
      },
    }, { runValidators: false });
  } else if (userId) {
    // No company on file — activate the user record directly
    await User.findByIdAndUpdate(userId, {
      subscriptionActive: true,
      subscriptionPlan: plan,
      subscriptionExpiry: expiry,
      serviceRequestsRemaining,
      subscription: {
        plan,
        isActive: true,
        startDate: new Date(),
        expiresAt: expiry,
      },
    }, { runValidators: false });
  }

  return { plan, expiry };
};

// =========================
// DEACTIVATE SUBSCRIPTION
// Revokes the company subscription and mirrors to user.
// If no company is linked, the user record is deactivated directly.
// =========================
const deactivateSubscription = async (companyId, userId) => {
  if (companyId) {
    await Company.findByIdAndUpdate(companyId, {
      subscriptionActive: false,
      subscriptionPlan: "free",
      subscriptionExpiry: null,
    }, { runValidators: false });

    await User.findByIdAndUpdate(userId, {
      subscriptionActive: false,
      subscriptionPlan: "free",
      subscriptionExpiry: null,
      serviceRequestsRemaining: 0,
      subscription: {
        plan: "free",
        isActive: false,
        startDate: null,
        expiresAt: null,
      },
    }, { runValidators: false });
  } else if (userId) {
    await User.findByIdAndUpdate(userId, {
      subscriptionActive: false,
      subscriptionPlan: "free",
      subscriptionExpiry: null,
      serviceRequestsRemaining: 0,
      subscription: {
        plan: "free",
        isActive: false,
        startDate: null,
        expiresAt: null,
      },
    }, { runValidators: false });
  }
};

module.exports = {
  syncSubscriptionToUser,
  activateSubscription,
  deactivateSubscription,
};

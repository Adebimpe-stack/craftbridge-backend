const User = require("../models/User");
const Company = require("../models/Company");

const subscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let isSubscribed = false;
    const now = new Date();

    // Company is the authoritative source for employer subscriptions.
    if (user.companyId) {
      const company = await Company.findById(user.companyId).select(
        "subscriptionActive subscriptionExpiry"
      );
      if (company) {
        isSubscribed =
          company.subscriptionActive &&
          company.subscriptionExpiry &&
          new Date(company.subscriptionExpiry) > now;
      }
    } else {
      // Fallback to user record for non-employer roles
      isSubscribed =
        (user.subscription?.isActive &&
          user.subscription?.expiresAt &&
          new Date(user.subscription.expiresAt) > now) ||
        (user.subscriptionActive &&
          user.subscriptionExpiry &&
          new Date(user.subscriptionExpiry) > now);
    }

    req.userData = user;
    req.isSubscribed = isSubscribed;

    next();

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Subscription check failed" });
  }
};

module.exports = subscription;

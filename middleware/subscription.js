kkconst User = require("../models/User");

const subscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();

    const isSubscribed =
      user.subscription?.isActive &&
      user.subscription?.expiresAt &&
      new Date(user.subscription.expiresAt) > now;

    req.userData = user;
    req.isSubscribed = isSubscribed;

    next();

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Subscription check failed" });
  }
};

module.exports = subscription;

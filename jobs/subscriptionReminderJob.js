const cron = require("node-cron");
const User = require("../models/User");
const sendEmail = require("../utils/mailer");

const subscriptionReminderJob = () => {
  // runs every day at 8AM
  cron.schedule("0 8 * * *", async () => {
    try {
      const now = new Date();

      const users = await User.find({
        "subscription.expiresAt": { $ne: null }
      });

      for (let user of users) {
        const expiry = new Date(user.subscription.expiresAt);
        const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

        /* =========================
           7 DAYS BEFORE EXPIRY
        ========================== */
        if (diffDays === 7) {
          await sendEmail({
            to: user.email,
            subject: "Subscription expires in 7 days",
            text: `Hi ${user.name}, your subscription expires in 7 days. Please renew to continue posting jobs.`
          });
        }

        /* =========================
           1 DAY BEFORE EXPIRY
        ========================== */
        if (diffDays === 1) {
          await sendEmail({
            to: user.email,
            subject: "Subscription expires tomorrow",
            text: `Hi ${user.name}, your subscription expires tomorrow. Renew now.`
          });
        }

        /* =========================
           EXPIRED → AUTO DISABLE
        ========================== */
        if (diffDays <= 0 && user.subscription.isActive) {
          user.subscription.plan = "free";
          user.subscription.isActive = false;

          await user.save();

          await sendEmail({
            to: user.email,
            subject: "Subscription expired",
            text: `Hi ${user.name}, your subscription has expired. Your account has been switched to free plan. Please renew to regain access.`
          });

          console.log(`User downgraded: ${user.email}`);
        }
      }

      console.log("Subscription cron completed");

    } catch (err) {
      console.log("Cron error:", err.message);
    }
  });
};

module.exports = subscriptionReminderJob;

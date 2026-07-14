const cron = require("node-cron");
const User = require("../models/User");
const Company = require("../models/Company");
const sendEmail = require("../utils/mailer");
const { syncSubscriptionToUser } = require("../utils/syncSubscription");

const subscriptionReminderJob = () => {
  // runs every day at 8AM
  cron.schedule("0 8 * * *", async () => {
    try {
      const now = new Date();

      // Company is the authoritative source for subscription expiry
      const companies = await Company.find({
        subscriptionExpiry: { $ne: null }
      });

      for (let company of companies) {
        const expiry = new Date(company.subscriptionExpiry);
        const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

        // Find a company owner to notify
        const owner = await User.findOne({
          companyId: company._id,
          companyRole: "owner",
        });

        const email = owner?.email;
        const name = owner?.name || "Employer";

        /* =========================
           7 DAYS BEFORE EXPIRY
        ========================== */
        if (diffDays === 7 && email) {
          await sendEmail({
            to: email,
            subject: "Subscription expires in 7 days",
            text: `Hi ${name}, your subscription expires in 7 days. Please renew to continue posting jobs.`
          });
        }

        /* =========================
           1 DAY BEFORE EXPIRY
        ========================== */
        if (diffDays === 1 && email) {
          await sendEmail({
            to: email,
            subject: "Subscription expires tomorrow",
            text: `Hi ${name}, your subscription expires tomorrow. Renew now.`
          });
        }

        /* =========================
           EXPIRED → AUTO DISABLE
        ========================== */
        if (diffDays <= 0 && company.subscriptionActive) {
          await Company.findByIdAndUpdate(
            company._id,
            {
              subscriptionActive: false,
              subscriptionPlan: "free",
            },
            { runValidators: false }
          );

          // Mirror deactivation to all company members
          const members = await User.find({ companyId: company._id });
          for (let member of members) {
            await syncSubscriptionToUser(company._id, member._id);
          }

          if (email) {
            await sendEmail({
              to: email,
              subject: "Subscription expired",
              text: `Hi ${name}, your subscription has expired. Your account has been switched to free plan. Please renew to regain access.`
            });
          }
        }
      }
    } catch (err) {
    }
  });
};

module.exports = subscriptionReminderJob;

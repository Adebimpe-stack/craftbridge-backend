const cron = require("node-cron");
const User = require("../models/User");
const { createNotification } = require("./notificationService");
const {
  buildPublicDirectoryEligibilityMatch,
  getPublicDirectoryIneligibilityReasons,
} = require("../utils/professionalRanking");

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_REMINDER_AFTER_MS = DAY_MS;
const REPEAT_EVERY_MS = 7 * DAY_MS;
const MAX_REMINDERS = 3;
const BATCH_SIZE = 100;
const PAUSE_BETWEEN_MS = 1000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Remind professionals whose profile is hidden from clients (missing trade,
// location, etc.): 1 day after sign-up, then weekly, at most MAX_REMINDERS times.
async function sendProfileReminders({ now = new Date(), pauseMs = PAUSE_BETWEEN_MS } = {}) {
  const users = await User.find({
    role: "jobseeker",
    isVerified: true,
    accountStatus: { $nin: ["suspended", "deactivated"] },
    createdAt: { $lte: new Date(now - FIRST_REMINDER_AFTER_MS) },
    $and: [
      { $or: [{ profileReminderCount: { $exists: false } }, { profileReminderCount: { $lt: MAX_REMINDERS } }] },
      { $or: [{ profileReminderLastAt: null }, { profileReminderLastAt: { $lte: new Date(now - REPEAT_EVERY_MS) } }] },
    ],
    $expr: { $not: [buildPublicDirectoryEligibilityMatch().$expr] },
  })
    .select("name primaryTrade city country location availability certifications certifiedBy")
    .sort({ createdAt: 1 })
    .limit(BATCH_SIZE)
    .lean();

  let sent = 0;
  for (const user of users) {
    const missing = getPublicDirectoryIneligibilityReasons(user);
    if (!missing.length) continue;

    const notification = await createNotification({
      recipientId: user._id,
      type: "profile_incomplete",
      data: {
        missing,
        certificationsTip: !user.certifications?.length && !user.certifiedBy?.length,
        link: "/jobseeker-profile",
      },
      email: true,
    });
    if (!notification) continue;

    await User.updateOne(
      { _id: user._id },
      { $inc: { profileReminderCount: 1 }, $set: { profileReminderLastAt: now } }
    );
    sent += 1;
    if (pauseMs) await pause(pauseMs);
  }
  return sent;
}

const startProfileReminderCron = () => {
  cron.schedule(
    "0 9 * * *",
    () => {
      sendProfileReminders()
        .then((sent) => sent && console.log(`PROFILE REMINDERS SENT: ${sent}`))
        .catch((err) => console.error("PROFILE REMINDER CRON ERROR:", err.message));
    },
    { timezone: "Africa/Lagos" }
  );
};

module.exports = { sendProfileReminders, startProfileReminderCron };

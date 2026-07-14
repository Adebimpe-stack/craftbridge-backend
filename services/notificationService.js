const Notification = require("../models/Notification");
const { isPubliclyEligible } = require("../utils/professionalRanking");

const NOTIFICATION_MESSAGES = {
  service_request: (data) => ({
    title: "New Service Request",
    message: `You received a new service request${data.serviceType ? ` for ${data.serviceType}` : ""}.`,
  }),
  job_invitation: (data) => ({
    title: "Job Invitation",
    message: `You have been invited to apply for ${data.jobTitle || "a job"}.`,
  }),
  profile_visible: () => ({
    title: "Profile Now Public",
    message: "Your profile is now visible to employers in the public directory.",
  }),
  verification_status_change: (data) => ({
    title: "Verification Status Updated",
    message: `Your verification status is now ${data.status || "updated"}.`,
  }),
  profile_activity: (data) => ({
    title: "Profile Activity Spike",
    message: `Your profile received ${data.viewCount || "significant"} views recently.`,
  }),
  job_application: (data) => ({
    title: "New Job Application",
    message: `Someone applied for ${data.jobTitle || "your job posting"}.`,
  }),
  service_request_accepted: (data) => ({
    title: "Service Request Accepted",
    message: `Your service request${data.serviceType ? ` for ${data.serviceType}` : ""} was accepted.`,
  }),
  professional_reply: (data) => ({
    title: "New Reply",
    message: `${data.professionalName || "A professional"} replied to your message.`,
  }),
};

/**
 * Create a notification for a user.
 *
 * @param {Object} options
 * @param {string} options.recipientId - User ID to notify
 * @param {string} options.type - Notification type
 * @param {Object} options.data - Contextual data (jobId, serviceRequestId, etc.)
 * @returns {Promise<Object|null>} Created notification or null if silent failure
 */
async function createNotification({ recipientId, type, data = {} }) {
  if (!recipientId || !type) return null;

  const builder = NOTIFICATION_MESSAGES[type];
  if (!builder) return null;

  const { title, message } = builder(data);

  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data,
      read: false,
    });
    return notification;
  } catch (err) {
    console.error("CREATE NOTIFICATION ERROR:", err);
    return null;
  }
}

/**
 * Create a notification when a professional's profile becomes publicly visible,
 * but only if it was not visible before. This is a no-op if the user was already eligible.
 *
 * @param {Object} user - Mongoose User document
 * @param {Object} previousSnapshot - Optional previous state to compare against
 * @returns {Promise<Object|null>}
 */
async function notifyProfileVisible(user, previousSnapshot = null) {
  if (!user || user.role !== "jobseeker") return null;
  if (!isPubliclyEligible(user)) return null;

  if (previousSnapshot && isPubliclyEligible(previousSnapshot)) {
    return null;
  }

  return createNotification({
    recipientId: user._id,
    type: "profile_visible",
    data: { professionalId: user._id },
  });
}

module.exports = {
  createNotification,
  notifyProfileVisible,
};

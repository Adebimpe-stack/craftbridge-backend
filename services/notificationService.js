const Notification = require("../models/Notification");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
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
    title: "Your profile is live",
    message: "Clients can now find your profile in the CraftBridge directory. Share your profile link to get more enquiries.",
  }),
  verification_status_change: (data) => VERIFICATION_MESSAGES[data.status] || ({
    title: "Verification Status Updated",
    message: `Your verification status is now ${data.status || "updated"}.`,
  }),
  profile_activity: (data) => ({
    title: "Clients are viewing your profile",
    message: `Your CraftBridge profile has now been viewed ${data.viewCount} time${data.viewCount === 1 ? "" : "s"}.`,
  }),
  client_contact: (data) => ({
    title: "A client wants to reach you",
    message: `${data.clientName || "A client"} opened ${data.method === "phone_call_click" ? "a call" : "WhatsApp"} to you from CraftBridge (reference ${data.refCode}). Reply quickly to win the job.`,
  }),
  review_received: (data) => ({
    title: "You received a new review",
    message: `${data.clientName || "A client"} rated you ${data.rating} out of 5 stars.`,
  }),
  admin_request: (data) => ({
    title: data.title || "New request from CraftBridge",
    message: data.message,
  }),
  profile_shared: (data) => ({
    title: data.title || "Your profile was shared with a client",
    message: data.message || "CraftBridge shared your profile with a client who needs your trade. Keep your phone on so you don't miss their call.",
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

const VERIFICATION_MESSAGES = {
  verified: {
    title: "Your profile has been approved",
    message: "CraftBridge has approved your profile. Clients can now contact you on WhatsApp or by phone from your profile.",
  },
  rejected: {
    title: "Your profile was not approved",
    message: "CraftBridge could not approve your profile yet. Check your dashboard for the reason and update your details.",
  },
  info_requested: {
    title: "CraftBridge needs more information",
    message: "Please check your dashboard and upload the requested documents so we can approve your profile.",
  },
};

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function emailNotification(recipientId, { title, message, link }) {
  const user = await User.findById(recipientId).select("email name");
  if (!user?.email) return;
  const url = `${process.env.CLIENT_URL || "https://craftbridgejobs.com"}${link || "/notifications"}`;
  await sendEmail({
    to: user.email,
    subject: title,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p>Hi ${escapeHtml(user.name || "there")},</p>
        <h2 style="color:#166534;">${escapeHtml(title)}</h2>
        <p style="white-space:pre-line;">${escapeHtml(message)}</p>
        <a href="${url}" style="display:inline-block;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open CraftBridge</a>
        <p style="color:#64748b;font-size:12px;margin-top:24px;">You are receiving this because you have a CraftBridge account.</p>
      </div>
    `,
  });
}

/**
 * Create a notification for a user.
 *
 * @param {Object} options
 * @param {string} options.recipientId - User ID to notify
 * @param {string} options.type - Notification type
 * @param {Object} options.data - Contextual data (jobId, serviceRequestId, etc.); `data.link` is the in-app path the notification opens
 * @param {boolean} options.email - Also send the notification by email
 * @returns {Promise<Object|null>} Created notification or null if silent failure
 */
async function createNotification({ recipientId, type, data = {}, email = false }) {
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
    if (email) {
      emailNotification(recipientId, { title, message, link: data.link }).catch((err) =>
        console.error("NOTIFICATION EMAIL ERROR:", err)
      );
    }
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
    data: { professionalId: user._id, link: `/professionals/${user._id}` },
    email: true,
  });
}

module.exports = {
  createNotification,
  notifyProfileVisible,
};

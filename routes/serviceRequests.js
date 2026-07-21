const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const subscription = require("../middleware/subscription");
const ServiceRequest = require("../models/ServiceRequest");
const User = require("../models/User");
const Company = require("../models/Company");
const sendEmail = require("../utils/sendEmail");
const { createNotification } = require("../services/notificationService");

const requireBusinessAccount = (req, res, next) => {
  if (req.user?.role !== "employer") {
    return res.status(403).json({ message: "Only a business account can perform this action." });
  }
  next();
};

// =========================
// CLIENT: GET SERVICE REQUEST LIMITS
// GET /api/service-requests/limits
// =========================
router.get("/limits", auth, requireBusinessAccount, subscription, async (req, res) => {
  try {
    const user = req.userData;

    const remaining = req.isSubscribed
      ? user.serviceRequestsRemaining
      : user.hasUsedFreeServiceRequest
      ? 0
      : 1;

    res.json({
      hasUsedFreeServiceRequest: user.hasUsedFreeServiceRequest,
      serviceRequestsRemaining: user.serviceRequestsRemaining,
      subscriptionActive: req.isSubscribed,
      remaining,
      unlimited: req.isSubscribed && user.serviceRequestsRemaining === -1,
    });
  } catch (err) {
    console.error("SERVICE REQUEST LIMITS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// CLIENT: SUBMIT A SERVICE REQUEST
// POST /api/service-requests
// =========================
router.post("/", auth, requireBusinessAccount, subscription, async (req, res) => {
  try {
    const { professionalId, businessId, serviceType, description, location, preferredDate, budget } = req.body;

    if ((!professionalId && !businessId) || !serviceType || !description) {
      return res.status(400).json({
        message: "Recipient (professional or service business), service type, and description are required.",
      });
    }

    // =========================
    // CLIENT TRUST CHECKS
    // =========================
    const client = req.userData;

    if (client.accountStatus === "suspended" || client.accountStatus === "deactivated") {
      return res.status(403).json({ message: "Your account is not active." });
    }

    if (!client.isVerified) {
      return res.status(403).json({ message: "Please verify your email before sending service requests." });
    }

    if (client.role === "employer") {
      const company = await Company.findById(client.companyId).select("verificationStatus");
      if (!company || company.verificationStatus !== "verified") {
        return res.status(403).json({ message: "Your company must be verified by an admin before sending service requests." });
      }
    }

    // =========================
    // RECIPIENT RESOLUTION
    // =========================
    let recipientType = null;
    let recipientId = null;
    let recipientName = "";
    let recipientEmail = "";
    let businessRecipient = null;

    if (professionalId) {
      const professional = await User.findById(professionalId).select("name email role workerVerificationStatus accountStatus");
      if (!professional) {
        return res.status(404).json({ message: "Professional not found." });
      }

      if (professional.accountStatus === "suspended" || professional.accountStatus === "deactivated") {
        return res.status(403).json({ message: "This professional is not available to receive requests." });
      }

      if (professional.workerVerificationStatus !== "verified") {
        return res.status(403).json({ message: "You can only send service requests to verified professionals." });
      }

      recipientType = "professional";
      recipientId = professionalId;
      recipientName = professional.name;
      recipientEmail = professional.email;
    } else if (businessId) {
      const business = await Company.findById(businessId)
        .select("name companyEmail owner verificationStatus isActive")
        .populate("owner", "name email");

      if (!business || business.isActive === false) {
        return res.status(404).json({ message: "Service business not found." });
      }

      if (business.verificationStatus !== "verified") {
        return res.status(403).json({ message: "You can only send service requests to verified service businesses." });
      }

      businessRecipient = business;
      recipientType = "business";
      recipientId = businessId;
      recipientName = business.name;
      recipientEmail = business.companyEmail || business.owner?.email || "";
    }

    // =========================
    // SERVICE REQUEST LIMITS
    // =========================
    const hasRemaining =
      req.isSubscribed &&
      (client.serviceRequestsRemaining > 0 || client.serviceRequestsRemaining === -1);

    const canUseFree = !client.hasUsedFreeServiceRequest;

    if (!canUseFree && !hasRemaining) {
      return res.status(403).json({
        message: "You have used your free service request. Upgrade your subscription to send additional service requests.",
        code: "SERVICE_REQUEST_LIMIT_EXCEEDED",
      });
    }

    const serviceRequestPayload = {
      client: req.user._id,
      companyId: client.companyId || null,
      serviceType,
      description,
      location,
      preferredDate: preferredDate ? new Date(preferredDate) : undefined,
      budget,
    };

    if (recipientType === "professional") {
      serviceRequestPayload.professional = professionalId;
    } else {
      serviceRequestPayload.business = businessId;
    }

    const serviceRequest = await ServiceRequest.create(serviceRequestPayload);

    // Consume the service request entitlement
    if (canUseFree) {
      client.hasUsedFreeServiceRequest = true;
    } else if (hasRemaining && client.serviceRequestsRemaining > 0) {
      client.serviceRequestsRemaining = Math.max(0, client.serviceRequestsRemaining - 1);
    }
    await client.save();

    // Notify recipient internally and by email (non-blocking)
    const notificationData = {
      serviceRequestId: serviceRequest._id,
      serviceType,
      clientId: req.user._id,
    };

    if (recipientType === "professional") {
      createNotification({
        recipientId: professionalId,
        type: "service_request",
        data: notificationData,
      }).catch((err) => console.error("SERVICE REQUEST NOTIFICATION ERROR:", err));
    } else if (recipientType === "business" && businessRecipient?.owner?._id) {
      // For companies, notify the owner
      createNotification({
        recipientId: businessRecipient.owner._id,
        type: "service_request",
        data: notificationData,
      }).catch((err) => console.error("SERVICE REQUEST NOTIFICATION ERROR:", err));
    }

    if (recipientEmail) {
      const isBusiness = recipientType === "business";
      sendEmail({
        to: recipientEmail,
        subject: "New Service Request on CraftBridge",
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
            <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:32px;">
              <h2 style="color:#166534;margin-bottom:8px;">New Service Request</h2>
              <p style="color:#475569;">Hi ${recipientName}, you have received a new service request.</p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Service:</td><td style="padding:8px 0;color:#0f172a;">${serviceType}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Description:</td><td style="padding:8px 0;color:#0f172a;">${description}</td></tr>
                ${location ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Location:</td><td style="padding:8px 0;color:#0f172a;">${location}</td></tr>` : ""}
                ${budget ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Budget:</td><td style="padding:8px 0;color:#0f172a;">${budget}</td></tr>` : ""}
              </table>
              <a href="${process.env.CLIENT_URL}/service-requests" style="display:inline-block;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Request</a>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    res.status(201).json({ message: "Service request submitted successfully.", serviceRequest });
  } catch (err) {
    console.error("SERVICE REQUEST CREATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL / BUSINESS: GET MY INCOMING REQUESTS
// GET /api/service-requests/incoming
// =========================
router.get("/incoming", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.companyId;

    const conditions = [{ professional: userId }];
    if (companyId) {
      conditions.push({ business: companyId });
    }
    const query = { $or: conditions };

    const requests = await ServiceRequest.find(query)
      .populate("client", "name email profilePicture")
      .populate("business", "name logo")
      .populate("professional", "name email profilePicture primaryTrade")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// CLIENT: GET MY SENT REQUESTS
// GET /api/service-requests/my
// =========================
router.get("/my", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.companyId;

    let query = { client: userId };

    if (companyId) {
      const company = await Company.findById(companyId).select("teamMembers owner");
      const memberIds = new Set([String(userId)]);
      if (company) {
        if (company.owner) memberIds.add(String(company.owner));
        (company.teamMembers || []).forEach((id) => memberIds.add(String(id)));
      }
      query = {
        $or: [
          { client: { $in: Array.from(memberIds) } },
          { companyId },
        ],
      };
    }

    const requests = await ServiceRequest.find(query)
      .populate("professional", "name email profilePicture primaryTrade location")
      .populate("business", "name logo location")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL / BUSINESS: ACCEPT / DECLINE / COMPLETE
// PUT /api/service-requests/:id/status
// =========================
router.put("/:id/status", auth, async (req, res) => {
  try {
    const { status, declineReason } = req.body;

    if (!["accepted", "declined", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const request = await ServiceRequest.findById(req.params.id)
      .populate("client", "name email companyId")
      .populate("professional", "name primaryTrade")
      .populate("business", "name owner teamMembers")
      .populate("business.owner", "name email");

    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    // =========================
    // AUTHORIZATION
    // =========================
    let isAuthorized = false;
    if (request.professional && request.professional._id.toString() === req.user._id.toString()) {
      isAuthorized = true;
    }
    if (!isAuthorized && request.business) {
      const ownerId = request.business.owner?._id?.toString();
      const teamIds = (request.business.teamMembers || []).map((id) => id.toString());
      if (ownerId === req.user._id.toString() || teamIds.includes(req.user._id.toString())) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const previousStatus = request.status;

    request.status = status;
    if (status === "declined" && declineReason) {
      request.declineReason = declineReason;
    }
    if (status === "accepted" && previousStatus !== "accepted") {
      request.acceptedAt = new Date();
    }
    if (status === "completed") {
      request.completedAt = new Date();
    }

    await request.save();

    // Notify client (non-blocking)
    const statusLabels = { accepted: "Accepted", declined: "Declined", completed: "Completed" };

    const recipientName = request.professional
      ? request.professional.name
      : request.business?.name || "Service Business";

    if (status === "accepted" && previousStatus !== "accepted") {
      createNotification({
        recipientId: request.client._id,
        type: "service_request_accepted",
        data: {
          serviceRequestId: request._id,
          serviceType: request.serviceType,
          professionalId: request.professional?._id,
          professionalName: recipientName,
        },
      }).catch((err) => console.error("SERVICE REQUEST ACCEPT NOTIFICATION ERROR:", err));

      const acceptedDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const profileUrl = request.professional
        ? `${process.env.CLIENT_URL}/professional/${request.professional._id}`
        : `${process.env.CLIENT_URL}/companies/${request.business._id}`;

      sendEmail({
        to: request.client.email,
        subject: "Your service request has been accepted",
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
            <div style="max-width:560px;margin:auto;background:white;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
              <h2 style="color:#166534;margin-top:0;">Your service request has been accepted</h2>

              <p style="color:#475569;">Hi ${request.client.name},</p>

              <p style="color:#475569;">
                <strong>${recipientName}</strong> has accepted your request for
                <strong>${request.serviceType}</strong>.
              </p>

              <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:4px 0;color:#334155;"><strong>Provider:</strong> ${recipientName}</p>
                ${request.professional ? `<p style="margin:4px 0;color:#334155;"><strong>Primary trade:</strong> ${request.professional.primaryTrade || "N/A"}</p>` : ""}
                <p style="margin:4px 0;color:#334155;"><strong>Service requested:</strong> ${request.serviceType}</p>
                <p style="margin:4px 0;color:#334155;"><strong>Date accepted:</strong> ${acceptedDate}</p>
              </div>

              <p style="color:#475569;">
                ${request.professional ? "The professional's contact information and resume are now unlocked for you on CraftBridge." : "The service business's contact information is now unlocked for you on CraftBridge."}
                You can log in to continue the conversation.
              </p>

              <a href="${profileUrl}" style="display:inline-block;margin-top:16px;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Unlocked Profile</a>

              <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">
                You are receiving this email because you have an active service request on CraftBridge.<br/>
                Questions? Contact us at <a href="mailto:hire@craftbridgejobs.com" style="color:#166534;">hire@craftbridgejobs.com</a>
              </p>
            </div>
          </div>
        `,
      }).catch(() => {});
    } else if (status !== "accepted") {
      sendEmail({
        to: request.client.email,
        subject: `Service Request ${statusLabels[status]} — CraftBridge`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
            <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:32px;">
              <h2 style="color:#166534;">Service Request ${statusLabels[status]}</h2>
              <p style="color:#475569;">Hi ${request.client.name}, your service request for <strong>${request.serviceType}</strong> has been <strong>${status}</strong>.</p>
              ${status === "declined" && declineReason ? `<p style="color:#475569;"><strong>Reason:</strong> ${declineReason}</p>` : ""}
              <a href="${process.env.CLIENT_URL}/my-service-requests" style="display:inline-block;margin-top:16px;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Status</a>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ message: `Request ${status} successfully.`, request });
  } catch (err) {
    console.error("SERVICE REQUEST STATUS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const BusinessApplication = require("../models/BusinessApplication");
const Company = require("../models/Company");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const { createNotification } = require("../services/notificationService");

// =========================
// PROFESSIONAL: SUBMIT APPLICATION TO BUSINESS
// POST /api/business-applications
// =========================
router.post("/", auth, async (req, res) => {
  try {
    const { businessId, coverLetter, availability, expectedRate, portfolioLink, skills } = req.body;

    // Only professionals can submit applications
    if (req.user.role !== "jobseeker") {
      return res.status(403).json({ message: "Only professionals can submit applications to businesses." });
    }

    if (!businessId || !coverLetter) {
      return res.status(400).json({ message: "Business ID and cover letter are required." });
    }

    // Check if professional account is active
    const professional = await User.findById(req.user._id);
    if (professional.accountStatus === "suspended" || professional.accountStatus === "deactivated") {
      return res.status(403).json({ message: "Your account is not active." });
    }

    // Verify business exists and is active
    const business = await Company.findById(businessId);
    if (!business || business.isActive === false) {
      return res.status(404).json({ message: "Business not found." });
    }

    // Check if business is verified
    if (business.verificationStatus !== "verified") {
      return res.status(403).json({ message: "You can only apply to verified businesses." });
    }

    // Check for duplicate application
    const existingApplication = await BusinessApplication.findOne({
      business: businessId,
      professional: req.user._id,
    });

    if (existingApplication) {
      return res.status(400).json({ message: "You have already applied to this business." });
    }

    // Create application
    const application = await BusinessApplication.create({
      business: businessId,
      professional: req.user._id,
      coverLetter,
      availability: availability || "",
      expectedRate: expectedRate || "",
      portfolioLink: portfolioLink || "",
      skills: skills || [],
    });

    // Notify business owner
    if (business.owner) {
      createNotification({
        recipientId: business.owner,
        type: "business_application",
        data: {
          applicationId: application._id,
          professionalId: req.user._id,
          professionalName: professional.name,
          businessId: businessId,
        },
      }).catch((err) => console.error("BUSINESS APPLICATION NOTIFICATION ERROR:", err));

      // Send email to business owner
      const owner = await User.findById(business.owner);
      if (owner && owner.email) {
        sendEmail({
          to: owner.email,
          subject: "New Application to Your Business on CraftBridge",
          html: `
            <div style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
              <div style="max-width:560px;margin:auto;background:white;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
                <h2 style="color:#166534;margin-top:0;">New Application to Your Business</h2>
                <p style="color:#475569;">Hi ${owner.name},</p>
                <p style="color:#475569;">
                  <strong>${professional.name}</strong> has applied to work with <strong>${business.name}</strong>.
                </p>
                <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;">
                  <p style="margin:4px 0;color:#334155;"><strong>Professional:</strong> ${professional.name}</p>
                  <p style="margin:4px 0;color:#334155;"><strong>Cover Letter:</strong> ${coverLetter}</p>
                  ${availability ? `<p style="margin:4px 0;color:#334155;"><strong>Availability:</strong> ${availability}</p>` : ""}
                  ${expectedRate ? `<p style="margin:4px 0;color:#334155;"><strong>Expected Rate:</strong> ${expectedRate}</p>` : ""}
                  ${portfolioLink ? `<p style="margin:4px 0;color:#334155;"><strong>Portfolio:</strong> <a href="${portfolioLink}" style="color:#166534;">View Portfolio</a></p>` : ""}
                </div>
                <a href="${process.env.CLIENT_URL}/business/applications" style="display:inline-block;margin-top:16px;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Applications</a>
              </div>
            </div>
          `,
        }).catch(() => {});
      }
    }

    res.status(201).json({ message: "Application submitted successfully.", application });
  } catch (err) {
    console.error("BUSINESS APPLICATION CREATE ERROR:", err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "You have already applied to this business." });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL: GET MY APPLICATIONS
// GET /api/business-applications/my
// =========================
router.get("/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "jobseeker") {
      return res.status(403).json({ message: "Only professionals can view their applications." });
    }

    const applications = await BusinessApplication.find({ professional: req.user._id })
      .populate("business", "name logo location industry")
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (err) {
    console.error("GET MY APPLICATIONS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// BUSINESS: GET INCOMING APPLICATIONS
// GET /api/business-applications/incoming
// =========================
router.get("/incoming", auth, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    if (!companyId) {
      return res.status(403).json({ message: "You must be associated with a business to view applications." });
    }

    // Verify user is owner or team member
    const company = await Company.findById(companyId);
    const isOwner = company.owner && company.owner.toString() === req.user._id.toString();
    const isTeamMember = company.teamMembers && company.teamMembers.some(id => id.toString() === req.user._id.toString());

    if (!isOwner && !isTeamMember) {
      return res.status(403).json({ message: "Not authorized to view business applications." });
    }

    const applications = await BusinessApplication.find({ business: companyId })
      .populate("professional", "name email profilePicture primaryTrade skills experienceYears location")
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (err) {
    console.error("GET INCOMING APPLICATIONS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// BUSINESS: UPDATE APPLICATION STATUS
// PUT /api/business-applications/:id/status
// =========================
router.put("/:id/status", auth, async (req, res) => {
  try {
    const { status, declineReason } = req.body;

    if (!["reviewed", "accepted", "declined"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const application = await BusinessApplication.findById(req.params.id)
      .populate("business", "name owner teamMembers")
      .populate("professional", "name email");

    if (!application) {
      return res.status(404).json({ message: "Application not found." });
    }

    // Authorization check
    const companyId = req.user.companyId;
    if (!companyId || application.business._id.toString() !== companyId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this application." });
    }

    const company = await Company.findById(companyId);
    const isOwner = company.owner && company.owner.toString() === req.user._id.toString();
    const isTeamMember = company.teamMembers && company.teamMembers.some(id => id.toString() === req.user._id.toString());

    if (!isOwner && !isTeamMember) {
      return res.status(403).json({ message: "Not authorized to update this application." });
    }

    const previousStatus = application.status;
    application.status = status;

    if (status === "declined" && declineReason) {
      application.declineReason = declineReason;
    }

    if (status === "reviewed" && previousStatus !== "reviewed") {
      application.reviewedAt = new Date();
    }

    if (status === "accepted" && previousStatus !== "accepted") {
      application.acceptedAt = new Date();
    }

    await application.save();

    // Notify professional
    createNotification({
      recipientId: application.professional._id,
      type: status === "accepted" ? "business_application_accepted" : "business_application_updated",
      data: {
        applicationId: application._id,
        businessId: application.business._id,
        businessName: application.business.name,
        status,
      },
    }).catch((err) => console.error("APPLICATION STATUS NOTIFICATION ERROR:", err));

    // Send email to professional
    const statusLabels = { reviewed: "Reviewed", accepted: "Accepted", declined: "Declined" };
    sendEmail({
      to: application.professional.email,
      subject: `Application ${statusLabels[status]} — ${application.business.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
          <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:32px;">
            <h2 style="color:#166534;">Application ${statusLabels[status]}</h2>
            <p style="color:#475569;">Hi ${application.professional.name},</p>
            <p style="color:#475569;">
              Your application to <strong>${application.business.name}</strong> has been <strong>${status}</strong>.
            </p>
            ${status === "declined" && declineReason ? `<p style="color:#475569;"><strong>Reason:</strong> ${declineReason}</p>` : ""}
            ${status === "accepted" ? `<p style="color:#475569;">The business will contact you soon with next steps.</p>` : ""}
            <a href="${process.env.CLIENT_URL}/my-applications" style="display:inline-block;margin-top:16px;background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View My Applications</a>
          </div>
        </div>
      `,
    }).catch(() => {});

    res.json({ message: `Application ${status} successfully.`, application });
  } catch (err) {
    console.error("UPDATE APPLICATION STATUS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL: CHECK IF ALREADY APPLIED
// GET /api/business-applications/check/:businessId
// =========================
router.get("/check/:businessId", auth, async (req, res) => {
  try {
    if (req.user.role !== "jobseeker") {
      return res.json({ hasApplied: false });
    }

    const application = await BusinessApplication.findOne({
      business: req.params.businessId,
      professional: req.user._id,
    });

    res.json({ hasApplied: !!application });
  } catch (err) {
    console.error("CHECK APPLICATION ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
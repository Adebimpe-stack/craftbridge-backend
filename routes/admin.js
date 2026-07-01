const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const User = require("../models/User");
const Job = require("../models/Job");
const Company = require("../models/Company");
const sendEmail = require("../utils/sendEmail");
const Report = require("../models/Report");
const ModerationLog = require("../models/ModerationLog");


// =======================
// GET ALL USERS
// =======================
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL JOBS
// =======================
router.get("/jobs", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL APPLICATIONS (FLATTENED)
// =======================
router.get("/applications", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find();

    const applications = [];

    jobs.forEach((job) => {
      job.applicants.forEach((app) => {
        applications.push({
          jobId: job._id,
          jobTitle: job.title,
          userId: app.userId,
          status: app.status,
        });
      });
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE JOB (ADMIN CONTROL)
// =======================
router.delete("/jobs/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE USER
// =======================
router.delete("/users/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// PENDING EMPLOYERS
// =======================
router.get(
  "/employers/pending",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employers =
        await User.find({

          role: "employer",

          isCompanyVerified: false,

        }).select("-password");

      res.json(employers);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

// =======================
// VERIFY EMPLOYER
// =======================
router.put(
  "/employers/:id/verify",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employer =
        await User.findById(
          req.params.id
        );

      if (!employer) {

        return res.status(404).json({
          message:
            "Employer not found",
        });

      }

      employer.isCompanyVerified =
        true;

      await employer.save();

      res.json({
        message:
          "Employer verified successfully",
      });

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

// =======================
// VERIFY COMPANY
// =======================
router.put(
  "/companies/:id/verify",
  auth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const company = await Company.findById(req.params.id);

      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const { status, reason } = req.body;

      if (status === "verified") {
        company.verificationStatus = "verified";
        company.rejectionReason = "";
      } else if (status === "rejected") {
        company.verificationStatus = "rejected";
        company.rejectionReason = reason || "No reason provided.";
      } else {
        return res.status(400).json({ message: "Invalid status provided." });
      }

      await company.save();

      // Also update the owner's account status if needed (e.g., for suspension)
      const owner = await User.findById(company.owner);
      if (owner) {
        if (status === "suspended") {
          owner.accountStatus = "suspended";
          owner.suspensionReason = reason || "Company suspended by admin.";
          await owner.save();
        } else if (owner.accountStatus === "suspended" && status !== "suspended") {
          owner.accountStatus = "active";
          owner.suspensionReason = "";
          await owner.save();
        }
      }

      res.json({
        message: `Company status updated to ${status} successfully`,
        company,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Server error",
      });
    }
  }
);

// =========================
// ADMIN: GET ALL STATUS CHANGE REQUESTS (DEACTIVATION/REACTIVATION)
// =========================
router.get("/status-change-requests", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status = 'pending' } = req.query; // Default to pending

    const companies = await Company.find({
      'deactivationRequest.status': status
    }).populate('owner', 'name email');

    const requests = companies.map(company => ({
      companyId: company._id,
      companyName: company.name,
      isActive: company.isActive,
      requestType: company.deactivationRequest?.requestType,
      reason: company.deactivationRequest?.reason,
      requestedAt: company.deactivationRequest?.requestedAt,
      reviewedAt: company.deactivationRequest?.reviewedAt,
      rejectionReason: company.deactivationRequest?.rejectionReason,
      owner: company.owner
    }));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: APPROVE STATUS CHANGE REQUEST
// =========================
router.put("/status-change-requests/:companyId/approve", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await Company.findById(companyId).populate('owner', 'email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const request = company.deactivationRequest;
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ message: "No pending status change request found" });
    }

    const newStatus = request.requestType === 'deactivation' ? false : true;
    company.isActive = newStatus;
    if (newStatus === false) {
      company.deactivatedAt = new Date();
      company.deactivatedBy = request.requestedBy;
    } else {
      company.deactivatedAt = null;
      company.deactivatedBy = null;
    }

    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await company.save();

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your request to ${request.requestType} your company has been approved`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to <strong>${request.requestType}</strong> your company, "${company.name}", has been approved by an administrator.</p><p>Your company is now <strong>${company.isActive ? 'Active' : 'Inactive'}</strong>.</p>`
    });

    res.json({ message: "Status change request approved successfully", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: REJECT STATUS CHANGE REQUEST
// =========================
router.put("/status-change-requests/:companyId/reject", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required." });
    }

    const company = await Company.findById(companyId).populate('owner', 'email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const request = company.deactivationRequest;
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ message: "No pending status change request found" });
    }

    request.status = 'rejected';
    request.rejectionReason = reason;
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await company.save();

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your request to ${request.requestType} your company has been rejected`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to <strong>${request.requestType}</strong> your company, "${company.name}", has been rejected.</p><p><strong>Reason:</strong> ${reason}</p>`
    });

    res.json({ message: "Status change request rejected successfully", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =========================
// ADMIN: GET ALL TYPE CHANGE REQUESTS
// =========================
router.get("/type-change-requests", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const companies = await Company.find({
      'typeChangeRequest.status': status
    }).populate('owner', 'name email');

    const requests = companies.map(company => ({
      companyId: company._id,
      companyName: company.name,
      currentType: company.companyType,
      requestedType: company.typeChangeRequest?.requestedType,
      reason: company.typeChangeRequest?.reason,
      requestedBy: company.typeChangeRequest?.requestedBy,
      requestedAt: company.typeChangeRequest?.requestedAt,
      reviewedAt: company.typeChangeRequest?.reviewedAt,
      rejectionReason: company.typeChangeRequest?.rejectionReason,
      owner: company.owner,
    }));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: APPROVE TYPE CHANGE REQUEST
// =========================
router.put("/type-change-requests/:companyId/approve", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await Company.findById(companyId).populate('owner', 'name email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!company.typeChangeRequest || company.typeChangeRequest.status !== 'pending') {
      return res.status(400).json({ message: "No pending type change request found" });
    }

    const previousType = company.companyType;
    company.companyType = company.typeChangeRequest.requestedType;
    company.typeChangeRequest.status = 'approved';
    company.typeChangeRequest.reviewedBy = req.user.id;
    company.typeChangeRequest.reviewedAt = new Date();
    await company.save();

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your account type change request has been approved`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to change your account type from <strong>${previousType}</strong> to <strong>${company.companyType}</strong> has been approved.</p>`
    });

    res.json({ message: "Type change request approved successfully", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: REJECT TYPE CHANGE REQUEST
// =========================
router.put("/type-change-requests/:companyId/reject", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { reason } = req.body;

    const company = await Company.findById(companyId).populate('owner', 'name email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!company.typeChangeRequest || company.typeChangeRequest.status !== 'pending') {
      return res.status(400).json({ message: "No pending type change request found" });
    }

    company.typeChangeRequest.status = 'rejected';
    company.typeChangeRequest.rejectionReason = reason;
    company.typeChangeRequest.reviewedBy = req.user.id;
    company.typeChangeRequest.reviewedAt = new Date();
    await company.save();

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your account type change request has been rejected`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to change your account type has been rejected.</p><p><strong>Reason:</strong> ${reason}</p>`
    });

    res.json({ message: "Type change request rejected successfully", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: GET ALL DELETION REQUESTS
// =========================
router.get("/deletion-requests", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const companies = await Company.find({
      'deletionRequest.status': status
    }).populate('owner', 'name email');

    const requests = companies.map(company => ({
      companyId: company._id,
      companyName: company.name,
      requestedBy: company.deletionRequest?.requestedBy,
      requestedAt: company.deletionRequest?.requestedAt,
      scheduledFor: company.deletionRequest?.scheduledFor,
      owner: company.owner,
      reviewedAt: company.deletionRequest?.reviewedAt,
    }));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: APPROVE DELETION REQUEST
// =========================
router.put("/deletion-requests/:companyId/approve", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await Company.findById(companyId).populate('owner', 'name email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!company.deletionRequest || company.deletionRequest.status !== 'pending') {
      return res.status(400).json({ message: "No pending deletion request found" });
    }

    company.deletionRequest.status = 'approved';
    company.deletionRequest.approvedBy = req.user.id;
    company.deletionRequest.approvedAt = new Date();
    company.isDeleted = true;
    company.deletedAt = new Date();
    company.deletedBy = req.user.id;
    await company.save();

    await User.updateMany(
      { companyId: company._id },
      { $set: { companyId: null, companyRole: null, role: 'jobseeker' } }
    );

    await Job.updateMany(
      { companyId: company._id },
      { $set: { status: 'closed', closedReason: 'Company deleted' } }
    );

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your company deletion request has been approved`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to delete your company, "${company.name}", has been approved and processed. Your company data has been soft-deleted.</p>`
    });

    res.json({ message: "Deletion request approved successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// ADMIN: REJECT DELETION REQUEST
// =========================
router.put("/deletion-requests/:companyId/reject", auth, requireRole("admin"), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { reason } = req.body;

    const company = await Company.findById(companyId).populate('owner', 'name email');
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!company.deletionRequest || company.deletionRequest.status !== 'pending') {
      return res.status(400).json({ message: "No pending deletion request found" });
    }

    company.deletionRequest.status = 'rejected';
    company.deletionRequest.rejectionReason = reason;
    company.deletionRequest.reviewedBy = req.user.id;
    company.deletionRequest.reviewedAt = new Date();
    company.isActive = true; // Reactivate
    await company.save();

    // Send email notification
    await sendEmail({
      to: company.owner.email,
      subject: `Your company deletion request has been rejected`,
      html: `<p>Hello ${company.owner.name},</p><p>Your request to delete your company, "${company.name}", has been rejected. Your company has been reactivated.</p><p><strong>Reason:</strong> ${reason}</p>`
    });

    res.json({ message: "Deletion request rejected successfully", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// MODERATION: GET QUEUE
// =========================
router.get("/moderation/queue", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status = "Pending" } = req.query;
    const reports = await Report.find({ status })
      .populate("reporter", "name email")
      .populate("targetId")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =========================
// MODERATION: TAKE ACTION
// =========================
router.post("/moderation/action", auth, requireRole("admin"), async (req, res) => {
  try {
    const { reportId, action, notes, targetId, targetType } = req.body;
    const adminId = req.user.id;

    if (!reportId || !action || !notes) {
      return res.status(400).json({ message: "Report ID, action, and notes are required." });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Report not found." });
    }

    let targetUser;
    if (targetType === "User") {
      targetUser = await User.findById(targetId);
    } else if (targetType === "Company" || targetType === "Job") {
      const company = targetType === "Company"
        ? await Company.findById(targetId)
        : await Company.findOne({ _id: (await Job.findById(targetId))?.companyId });
      if (company) {
        targetUser = await User.findById(company.owner);
      }
    }

    if (!targetUser) {
      return res.status(404).json({ message: "Target user/owner could not be found." });
    }

    // Perform action
    switch (action) {
      case "Warn Employer":
        await sendEmail({
          to: targetUser.email,
          subject: "Official Warning Regarding Your CraftBridge Account",
          html: `<p>Hello ${targetUser.name},</p><p>This is an official warning regarding activity on your account that violates our platform policies. Please review our terms of service. Further violations may result in account suspension.</p><p><strong>Admin Note:</strong> ${notes}</p>`,
        });
        break;

      case "Suspend Employer":
        targetUser.accountStatus = "suspended";
        targetUser.suspensionReason = notes;
        await targetUser.save();
        await sendEmail({
          to: targetUser.email,
          subject: "Your CraftBridge Account Has Been Suspended",
          html: `<p>Hello ${targetUser.name},</p><p>Your account has been suspended due to violations of our platform policies.</p><p><strong>Reason:</strong> ${notes}</p><p>Please contact support if you wish to appeal this decision.</p>`,
        });
        break;

      case "Restore Employer":
        targetUser.accountStatus = "active";
        targetUser.suspensionReason = "";
        await targetUser.save();
        await sendEmail({
          to: targetUser.email,
          subject: "Your CraftBridge Account Has Been Restored",
          html: `<p>Hello ${targetUser.name},</p><p>Your account has been restored. You may now log in and continue using CraftBridge.</p><p><strong>Admin Note:</strong> ${notes}</p>`,
        });
        break;

      case "Resolve Report":
        report.status = "Resolved";
        break;

      case "Reject Report":
        report.status = "Rejected";
        break;

      default:
        return res.status(400).json({ message: "Invalid action." });
    }

    // Update report details
    report.resolutionDetails = {
      actionTaken: action,
      notes,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    };
    if (action === "Resolve Report" || action === "Reject Report") {
        report.status = action === "Resolve Report" ? "Resolved" : "Rejected";
    }
    await report.save();

    // Create audit log
    const log = new ModerationLog({
      caseId: report._id,
      admin: adminId,
      action,
      target: report.targetId,
      notes,
    });
    await log.save();

    res.json({ message: "Action completed successfully.", report });
  } catch (err) {
    console.error("Moderation action error:", err);
    res.status(500).json({ message: "Server error during moderation action." });
  }
});

// =========================
// MODERATION: GET AUDIT LOG
// =========================
router.get("/moderation/log", auth, requireRole("admin"), async (req, res) => {
    try {
        const logs = await ModerationLog.find()
            .populate('admin', 'name')
            .sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// =========================
// PROFESSIONAL VERIFICATION
// =========================

// GET PENDING VERIFICATIONS
router.get("/verifications/pending", auth, requireRole("admin"), async (req, res) => {
    try {
        const users = await User.find({ workerVerificationStatus: 'pending' })
            .select('name email primaryTrade verificationEvidence');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// REVIEW AN EVIDENCE ITEM
router.put("/verifications/evidence/:userId/:evidenceId", auth, requireRole("admin"), async (req, res) => {
    try {
        const { status, adminNotes, applicantNotes } = req.body;
        const { userId, evidenceId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        const evidence = user.verificationEvidence.id(evidenceId);
        if (!evidence) return res.status(404).json({ message: "Evidence item not found." });

        const previousStatus = evidence.status;
        evidence.status = status;
        evidence.adminNotes = adminNotes;
        evidence.applicantNotes = applicantNotes;

        // Log this specific action
        const log = new ModerationLog({
            caseId: evidenceId, // Use evidence ID as the case
            admin: req.user.id,
            action: `Update Evidence Status`,
            target: userId,
            notes: `Admin changed status of '${evidence.documentName}' from ${previousStatus} to ${status}. Internal Note: ${adminNotes || 'N/A'}`
        });
        await log.save();

        // Check if all documents are approved to update the main status
        const allApproved = user.verificationEvidence.every(ev => ev.status === 'Approved');
        if (allApproved) {
            user.workerVerificationStatus = 'verified';
        } else {
            // If any are rejected or need more info, the overall status is not yet verified
            user.workerVerificationStatus = 'pending';
        }

        await user.save();

        // TODO: Send notification to user about the status change of their document

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

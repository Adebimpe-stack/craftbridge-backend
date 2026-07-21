const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const User = require("../models/User");
const Job = require("../models/Job");
const Company = require("../models/Company");
const VerificationLog = require("../models/VerificationLog");
const BulkEmailHistory = require("../models/BulkEmailHistory");
const { activateSubscription, deactivateSubscription } = require("../utils/syncSubscription");
const {
  isPubliclyEligible,
  getPublicDirectoryIneligibilityReasons,
} = require("../utils/professionalRanking");
const {
  createNotification,
  notifyProfileVisible,
} = require("../services/notificationService");
const sendEmail = require("../utils/sendEmail");

let bulkEmailJobRunning = false;

const RECIPIENT_GROUPS = {
  all_users: { label: "All Users", filter: {} },
  all_professionals: { label: "All Professionals", filter: { role: "jobseeker" } },
  all_employers: { label: "All Employers", filter: { role: "employer" } },
  verified_professionals: {
    label: "Verified Professionals",
    filter: { role: "jobseeker", $or: [{ workerVerificationStatus: "verified" }, { isVerified: true }] },
  },
  pending_worker_verification: {
    label: "Pending Worker Verification",
    filter: { role: "jobseeker", workerVerificationStatus: "pending" },
  },
  verified_businesses: {
    label: "Verified Businesses",
    filter: { role: "employer", $or: [{ verificationStatus: "verified" }, { isCompanyVerified: true }] },
  },
  pending_business_verification: {
    label: "Pending Business Verification",
    filter: { role: "employer", verificationStatus: "pending" },
  },
  active_subscribers: {
    label: "Active Subscribers",
    filter: { $or: [{ subscriptionActive: true }, { "subscription.isActive": true }] },
  },
  inactive_subscribers: {
    label: "Inactive Subscribers",
    filter: {
      $and: [
        { $or: [{ subscriptionPlan: { $ne: "" } }, { "subscription.plan": { $ne: "" } }] },
        { $nor: [{ subscriptionActive: true }, { "subscription.isActive": true }] },
      ],
    },
  },
  free_plan_users: {
    label: "Free Plan Users",
    filter: { subscriptionPlan: "", "subscription.plan": "" },
  },
  paid_plan_users: {
    label: "Paid Plan Users",
    filter: { $or: [{ subscriptionPlan: { $ne: "" } }, { "subscription.plan": { $ne: "" } }] },
  },
};

// =======================
// GET ALL USERS
// =======================
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });

    // Enrich employers with their Company verification data
    const enriched = await Promise.all(users.map(async (u) => {
      const obj = u.toObject();
      if (u.role === "employer" && u.companyId) {
        const company = await Company.findById(u.companyId)
          .select("verificationStatus verificationDocuments rejectionReason name");
        if (company) {
          obj.companyVerificationStatus = company.verificationStatus;
          obj.companyVerificationDocuments = (company.verificationDocuments || u.verificationDocuments || []).map((doc) =>
            typeof doc === "string" ? { url: doc, uploadedAt: null } : doc
          );
          obj.companyRejectionReason = company.rejectionReason || "";
          obj.companyName = obj.companyName || company.name;
        }
      }
      return obj;
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET BULK EMAIL RECIPIENT GROUP
// =======================
router.get("/users/recipient-groups/:group", auth, requireRole("admin"), async (req, res) => {
  try {
    const group = RECIPIENT_GROUPS[req.params.group];
    if (!group) {
      return res.status(400).json({ message: "Invalid recipient group." });
    }

    const users = await User.find(group.filter).select("_id");
    res.json({ group: req.params.group, label: group.label, userIds: users.map((user) => user._id) });
  } catch (err) {
    console.error("RECIPIENT GROUP ERROR:", err);
    res.status(500).json({ message: "Failed to load recipient group." });
  }
});

// =======================
// GET BULK EMAIL HISTORY
// =======================
router.get("/users/bulk-email-history", auth, requireRole("admin"), async (req, res) => {
  try {
    const { search = "", group = "", date = "" } = req.query;
    const filter = {};

    if (search.trim()) {
      filter.subject = { $regex: search.trim(), $options: "i" };
    }
    if (group.trim()) {
      filter.recipientGroup = group.trim();
    }
    if (date.trim()) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime())) {
        filter.createdAt = { $gte: start, $lte: end };
      }
    }

    const history = await BulkEmailHistory.find(filter)
      .populate("sentBy", "name email")
      .sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    console.error("BULK EMAIL HISTORY ERROR:", err);
    res.status(500).json({ message: "Failed to load email history." });
  }
});

// =======================
// BULK EMAIL SELECTED USERS
// =======================
router.post("/users/bulk-email", auth, requireRole("admin"), async (req, res) => {
  if (bulkEmailJobRunning) {
    return res.status(409).json({ message: "A bulk email job is already running. Please wait for it to finish." });
  }

  bulkEmailJobRunning = true;
  try {
    const { userIds, subject, message, recipientGroup = "Custom Selection" } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one user." });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: "Subject is required." });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const users = await User.find({ _id: { $in: userIds } }).select("email name");
    if (users.length === 0) {
      return res.status(404).json({ message: "No users found for the selected IDs." });
    }

    const escapeHtml = (value) =>
      value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]);
    const emailMessage = escapeHtml(message.trim()).replace(/\n/g, "<br/>");

    const results = await Promise.all(
      users.map(async (user) => ({
        user,
        delivery: await sendEmail({
          to: user.email,
          subject: subject.trim(),
          html: `
            <div style="font-family: Inter, sans-serif; line-height: 1.6; color: #1e293b;">
              <p>Hello ${escapeHtml(user.name || "there")},</p>
              <p>${emailMessage}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">
                This message was sent by the CraftBridge admin team.
              </p>
            </div>
          `,
        }),
      }))
    );

    const sent = results.filter(({ delivery }) => delivery).length;
    const failedRecipients = results
      .filter(({ delivery }) => !delivery)
      .map(({ user }) => ({ name: user.name || "Unknown user", email: user.email }));
    const failed = failedRecipients.length;

    const history = await BulkEmailHistory.create({
      subject: subject.trim(),
      message: message.trim(),
      recipientGroup,
      numberSelected: users.length,
      numberSent: sent,
      numberFailed: failed,
      failedRecipients,
      sentBy: req.user._id,
    });

    res.json({
      success: true,
      message: `Email sent to ${sent} user${sent === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
      sent,
      failed,
      failedRecipients,
      historyId: history._id,
    });
  } catch (err) {
    console.error("BULK EMAIL ERROR:", err);
    res.status(500).json({ message: "Failed to send bulk email." });
  } finally {
    bulkEmailJobRunning = false;
  }
});

// =======================
// GET SINGLE USER (profile + company)
// =======================
router.get("/users/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    const obj = user.toObject();
    if (user.companyId) {
      const company = await Company.findById(user.companyId)
        .select("name verificationStatus verificationDocuments rejectionReason subscriptionActive subscriptionPlan businessType");
      if (company) obj.company = company;
    }
    res.json(obj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET USER ACTIVITY
// =======================
router.get("/users/:id/activity", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const Application = require("../models/Application") || null;
    let jobsPosted = 0, applications = 0;

    if (user.companyId) {
      jobsPosted = await Job.countDocuments({ companyId: user.companyId });
    }
    if (Application) {
      applications = await Application.countDocuments({ user: user._id });
    }

    res.json({ jobsPosted, applications });
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
// GET SINGLE JOB (ADMIN VIEW)
// =======================
router.get("/jobs/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("companyId", "name logo");
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SUSPEND JOB (ADMIN)
// =======================
const suspendJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "suspended" },
      { returnDocument: "after" }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job suspended", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
router.put("/jobs/:id/suspend", auth, requireRole("admin"), suspendJob);
router.patch("/jobs/:id/suspend", auth, requireRole("admin"), suspendJob);

// =======================
// RESTORE SUSPENDED JOB (ADMIN)
// =======================
router.put("/jobs/:id/restore", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { returnDocument: "after" }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job restored", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// CLOSE JOB (ADMIN)
// =======================
router.put("/jobs/:id/close", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "closed" },
      { returnDocument: "after" }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job closed", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// REOPEN CLOSED JOB (ADMIN)
// =======================
router.put("/jobs/:id/reopen", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { returnDocument: "after" }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job reopened", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SOFT DELETE JOB (ADMIN)
// =======================
router.delete("/jobs/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      },
      { returnDocument: "after" }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job deleted (soft)", job });
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

          verificationStatus: "pending",

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

      await User.findByIdAndUpdate(req.params.id, { isCompanyVerified: true }, { runValidators: false });

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
// GRANT SUBSCRIPTION MANUALLY (admin use for confirmed payments)
// =======================
router.post("/grant-subscription", auth, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await activateSubscription(
      user.companyId,
      user._id,
      "premium",
      30
    );

    res.json({
      message: `Subscription activated for ${email}`,
      hasActiveSubscription: true,
      subscriptionPlan: "premium",
      subscriptionExpiry: expiry,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// REVOKE SUBSCRIPTION (admin)
// =======================
router.post("/revoke-subscription", auth, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "User not found" });

    await deactivateSubscription(user.companyId, user._id);

    res.json({
      message: `Subscription revoked for ${email}`,
      hasActiveSubscription: false,
      subscriptionPlan: "free",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// MIGRATE EMPLOYERS WITHOUT COMPANIES
// =======================
router.post("/migrate-employers-to-companies", auth, requireRole("admin"), async (req, res) => {
  try {
    const employers = await User.find({
      role: "employer",
      $or: [
        { companyId: { $exists: false } },
        { companyId: null },
      ],
    });

    const created = [];
    const skipped = [];

    for (const user of employers) {
      const company = await Company.create({
        name: user.name || "Unnamed Company",
        owner: user._id,
        createdBy: user._id,
        businessType: user.companyType || "",
        location: user.location || "",
        industry: user.industry || "",
        companySize: user.companySize || "",
        logo: user.profilePicture || "",
        website: user.website || "",
        verificationStatus: user.verificationStatus || "pending",
      });

      await User.findByIdAndUpdate(
        user._id,
        { companyId: company._id, companyRole: "owner" },
        { runValidators: false }
      );

      created.push({ email: user.email, companyId: company._id });
    }

    res.json({
      message: `Migration complete. ${created.length} companies created, ${skipped.length} skipped.`,
      created,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET ALL EMPLOYERS (admin view with company data)
// =======================
router.get("/employers", auth, requireRole("admin"), async (req, res) => {
  try {
    const employers = await User.find({ role: "employer" })
      .sort({ createdAt: -1 })
      .select("-password");

    // Enrich each employer with their Company record data
    const enriched = await Promise.all(
      employers.map(async (emp) => {
        const obj = emp.toObject();
        if (emp.companyId) {
          const company = await Company.findById(emp.companyId).select(
            "name verificationStatus documentsApproved verificationDocuments rejectionReason subscriptionActive subscriptionPlan"
          );
          if (company) {
            obj.companyName = obj.companyName || company.name;
            obj.verificationStatus = company.verificationStatus;
            obj.documentsApproved = company.documentsApproved;
            obj.verificationDocuments = (company.verificationDocuments || emp.verificationDocuments || []).map((doc) =>
              typeof doc === "string" ? { url: doc, uploadedAt: null } : doc
            );
            obj.rejectionReason = company.rejectionReason || "";
            obj.subscriptionActive = company.subscriptionActive;
            obj.subscriptionPlan = company.subscriptionPlan;
          }
        }
        return obj;
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE EMPLOYER STATUS (verify / reject / revoke / suspend / unsuspend)
// =======================
router.put("/employers/:id/status", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Employer not found" });

    const allowed = ["verified", "rejected", "revoked", "suspended", "unsuspend", "none"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }

    // Resolve company — prefer companyId, fall back to owner lookup
    const company = user.companyId
      ? await Company.findById(user.companyId)
      : await Company.findOne({ owner: user._id });

    const previousStatus = company?.verificationStatus || user.verificationStatus || "none";

    let userUpdate = {};
    let companyUpdate = null;

    if (status === "verified") {
      userUpdate = { isCompanyVerified: true, verificationStatus: "verified", documentsApproved: true, accountStatus: "active", rejectionReason: "", suspensionReason: "" };
      companyUpdate = { verificationStatus: "verified", documentsApproved: true, rejectionReason: "" };
    } else if (status === "rejected") {
      userUpdate = { isCompanyVerified: false, verificationStatus: "rejected", documentsApproved: false, accountStatus: "active", rejectionReason: reason || "" };
      companyUpdate = { verificationStatus: "rejected", documentsApproved: false, rejectionReason: reason || "" };
    } else if (status === "revoked") {
      userUpdate = { isCompanyVerified: false, verificationStatus: "revoked", documentsApproved: false, accountStatus: "active", rejectionReason: "", suspensionReason: "" };
      companyUpdate = { verificationStatus: "revoked", documentsApproved: false, rejectionReason: "" };
    } else if (status === "suspended") {
      userUpdate = { accountStatus: "suspended", suspensionReason: reason || "" };
    } else if (status === "unsuspend") {
      userUpdate = { accountStatus: "active", suspensionReason: "" };
    } else if (status === "none") {
      userUpdate = { isCompanyVerified: false, verificationStatus: "none", documentsApproved: false, accountStatus: "active", rejectionReason: "" };
      companyUpdate = { verificationStatus: "none", documentsApproved: false, rejectionReason: "" };
    }

    await User.findByIdAndUpdate(req.params.id, userUpdate, { runValidators: false });

    if (companyUpdate && company) {
      await Company.findByIdAndUpdate(company._id, companyUpdate, { runValidators: false });
    } else if (companyUpdate && !company) {
      console.warn(`employers/:id/status — no Company found for user ${req.params.id}`);
    }

    // Log verification status change
    if (["verified", "rejected", "revoked", "none"].includes(status)) {
      await VerificationLog.create({
        user: user._id,
        type: "business",
        action: "status_change",
        fromStatus: previousStatus,
        toStatus: status,
        reason: reason || "",
        admin: req.user._id,
      });
    }

    res.json({ message: `Employer ${status} successfully` });
  } catch (err) {
    console.error("employers/:id/status error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE BUSINESS TYPE (admin standardization)
// =======================
router.put("/employers/:id/business-type", auth, requireRole("admin"), async (req, res) => {
  try {
    const { businessType } = req.body;
    if (!businessType || !businessType.trim()) {
      return res.status(400).json({ message: "Business type is required" });
    }
    const normalized = businessType.trim();
    if (normalized.length < 3 || normalized.length > 100) {
      return res.status(400).json({ message: "Business type must be between 3 and 100 characters" });
    }
    if (!/^[a-zA-Z0-9\s&.'()-]+$/.test(normalized)) {
      return res.status(400).json({ message: "Business type contains invalid characters" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Employer not found" });

    const company = user.companyId
      ? await Company.findById(user.companyId)
      : await Company.findOne({ owner: user._id });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const companyUpdate = {
      businessType: normalized,
      // Admin standardization does not require approval and does not change verification status
      profileUpdatedAfterVerification: false,
      profileUpdatedAfterVerificationAt: null,
    };

    await Company.findByIdAndUpdate(company._id, companyUpdate, { runValidators: false });
    await User.findByIdAndUpdate(user._id, { companyType: normalized }, { runValidators: false });

    res.json({ message: "Business type updated successfully", businessType: normalized });
  } catch (err) {
    console.error("employers/:id/business-type error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE SERVICE BUSINESS PROFILE (admin edit)
// =======================
router.put("/employers/:id/profile", auth, requireRole("admin"), async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "description",
      "industry",
      "companySize",
      "location",
      "website",
      "linkedin",
      "cacNumber",
    ];

    const profileUpdates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        profileUpdates[field] = req.body[field];
      }
    }

    if (Object.keys(profileUpdates).length === 0) {
      return res.status(400).json({ message: "No valid profile fields provided" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Employer not found" });

    const company = user.companyId
      ? await Company.findById(user.companyId)
      : await Company.findOne({ owner: user._id });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Apply updates directly to the Company model (the public source of truth)
    Object.assign(company, profileUpdates);
    await company.save({ validateBeforeSave: false });

    // Keep the legacy User record in sync for backfilled directory listings
    const userUpdates = {};
    if (profileUpdates.name) userUpdates.name = profileUpdates.name;
    if (profileUpdates.location) userUpdates.location = profileUpdates.location;
    if (profileUpdates.website) userUpdates.website = profileUpdates.website;
    if (profileUpdates.linkedin) userUpdates.linkedin = profileUpdates.linkedin;
    if (profileUpdates.description) userUpdates.bio = profileUpdates.description;
    if (profileUpdates.companySize) userUpdates.companySize = profileUpdates.companySize;

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(user._id, userUpdates, { runValidators: false });
    }

    res.json({ message: "Service business profile updated successfully", company });
  } catch (err) {
    console.error("employers/:id/profile error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE SERVICE BUSINESS IDENTITY & CONTACT (admin edit)
// =======================
router.put("/employers/:id/identity-contact", auth, requireRole("admin"), async (req, res) => {
  try {
    const userFields = ["name", "email", "phone", "companyEmail", "linkedin"];
    const companyFields = ["name", "location", "website", "linkedin"];

    const userUpdates = {};
    const companyUpdates = {};

    for (const field of userFields) {
      if (req.body[field] !== undefined) userUpdates[field] = req.body[field];
    }
    for (const field of companyFields) {
      if (req.body[field] !== undefined) companyUpdates[field] = req.body[field];
    }

    if (Object.keys(userUpdates).length === 0 && Object.keys(companyUpdates).length === 0) {
      return res.status(400).json({ message: "No valid identity/contact fields provided" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Employer not found" });

    const company = user.companyId
      ? await Company.findById(user.companyId)
      : await Company.findOne({ owner: user._id });

    // Update the user identity/contact record
    if (Object.keys(userUpdates).length > 0) {
      Object.assign(user, userUpdates);
      await user.save({ validateBeforeSave: false });
    }

    // Update public-facing fields on the linked Company record
    if (company && Object.keys(companyUpdates).length > 0) {
      Object.assign(company, companyUpdates);
      await company.save({ validateBeforeSave: false });
    }

    res.json({ message: "Identity and contact updated successfully", user, company });
  } catch (err) {
    console.error("employers/:id/identity-contact error:", err.message);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Email already in use" });
    }
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SUSPEND USER
// =======================
router.put("/users/:id/suspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: "suspended", suspensionReason: reason || "" }, { returnDocument: "after", runValidators: false });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User suspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UNSUSPEND USER
// =======================
router.put("/users/:id/unsuspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: "active", suspensionReason: "" }, { returnDocument: "after", runValidators: false });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User unsuspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// DEACTIVATE USER (soft delete)
// =======================
router.put("/users/:id/deactivate", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: "deactivated" }, { returnDocument: "after", runValidators: false });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deactivated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// REACTIVATE USER
// =======================
router.put("/users/:id/reactivate", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: "active", suspensionReason: "" }, { returnDocument: "after", runValidators: false });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.companyId) {
      await Company.findByIdAndUpdate(
        user.companyId,
        { isActive: true, deactivatedAt: null, deactivatedBy: null },
        { runValidators: false }
      );
    }
    res.json({ message: "User reactivated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET WORKERS PENDING VERIFICATION
// =======================
router.get("/workers/pending", auth, requireRole("admin"), async (req, res) => {
  try {
    const workers = await User.find({
      role: "jobseeker",
      workerVerificationStatus: "pending",
    }).select("-password").sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET ALL WORKERS (for verification management)
// =======================
router.get("/workers", auth, requireRole("admin"), async (req, res) => {
  try {
    const workers = await User.find({ role: "jobseeker" })
      .select("-password")
      .sort({ createdAt: -1 });

    const enriched = workers.map((w) => {
      const obj = w.toObject();
      const profileCompletion = calculateWorkerCompletion(w);
      obj.profileCompletion = profileCompletion;
      obj.isPubliclyEligible = isPubliclyEligible(w);
      obj.publicDirectoryStatusReasons = getPublicDirectoryIneligibilityReasons(w);
      return obj;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE WORKER VERIFICATION STATUS
// =======================
router.put("/workers/:id/verify", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Worker not found" });

    const allowed = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }
    const previousStatus = user.workerVerificationStatus || "none";
    const updateFields = { workerVerificationStatus: status };
    if (status === "verified") {
      updateFields.workerRejectionReason = "";
      updateFields.isVerified = true;
    } else if (status === "rejected") {
      updateFields.workerRejectionReason = reason || "";
      // keep isVerified unchanged so rejected workers can still log in
    } else if (["revoked", "info_requested", "none"].includes(status)) {
      updateFields.workerRejectionReason = "";
      // keep isVerified unchanged
    }

    await User.findByIdAndUpdate(req.params.id, updateFields, { runValidators: false });

    await VerificationLog.create({
      user: user._id,
      type: "worker",
      action: "status_change",
      fromStatus: previousStatus,
      toStatus: status,
      reason: reason || "",
      admin: req.user._id,
    });

    // Notify the worker of verification status change (non-blocking)
    createNotification({
      recipientId: user._id,
      type: "verification_status_change",
      data: { status, previousStatus },
    }).catch((err) => console.error("WORKER VERIFICATION NOTIFICATION ERROR:", err));

    // If the status change made the profile publicly visible, notify the worker.
    if (status === "verified") {
      const updatedUser = await User.findById(user._id);
      notifyProfileVisible(updatedUser, user).catch((err) =>
        console.error("PROFILE VISIBLE NOTIFICATION ERROR:", err)
      );
    }

    res.json({ message: `Worker ${status} successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE WORKER PROFILE (admin edit)
// =======================
router.put("/workers/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Worker not found" });
    if (user.role !== "jobseeker") {
      return res.status(400).json({ message: "This endpoint is only for worker profiles" });
    }

    const allowedFields = [
      "name", "headline", "primaryTrade", "category", "skills", "experienceYears",
      "availability", "bio", "city", "state", "country", "location", "resumeUrl",
      "website", "linkedin", "github", "certifications", "languages"
    ];

    const update = {};
    for (const key of allowedFields) {
      if (req.body[key] === undefined) continue;

      let value = req.body[key];

      if (["skills", "certifications", "languages"].includes(key)) {
        if (typeof value === "string") {
          value = value.split(",").map((s) => s.trim()).filter(Boolean);
        } else if (!Array.isArray(value)) {
          value = [];
        }
      }

      if (key === "experienceYears") {
        value = Number(value) || 0;
      }

      if (key === "name") {
        value = String(value).trim();
        if (!value) return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (["bio", "headline", "primaryTrade", "category", "location", "city", "state", "country"].includes(key)) {
        value = String(value).trim();
      }

      if (["resumeUrl", "website", "linkedin", "github"].includes(key)) {
        value = String(value).trim();
      }

      update[key] = value;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    // Sync legacy location field if city/state/country provided
    if (update.city || update.state || update.country) {
      const locationParts = [update.city || user.city, update.state || user.state, update.country || user.country]
        .filter(Boolean);
      if (locationParts.length > 0) {
        update.location = locationParts.join(", ");
      }
    }

    // Sync socialLinks.linkedin so the UI stays consistent
    if (update.linkedin !== undefined) {
      update["socialLinks.linkedin"] = update.linkedin;
    }

    // Treat resumeUrl as the single source of truth; clear legacy resume fields when it changes
    if (update.resumeUrl !== undefined) {
      update.resume = "";
      update.resumeData = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: false }
    ).select("-password");

    res.json({ message: "Worker profile updated", user: updatedUser });
  } catch (err) {
    console.error("admin workers/:id update error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// =======================
// AUDIT VERIFICATION STATUS ENUMS
// Reports any documents that violate the current allowed enum values
// =======================
router.get("/audit/verification-status", auth, requireRole("admin"), async (req, res) => {
  try {
    const allowedWvs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
    const allowedVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
    const allowedCompanyVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];

    const invalidWorkerStatus = await User.find({
      role: "jobseeker",
      workerVerificationStatus: { $nin: allowedWvs },
    }).select("_id name email workerVerificationStatus");

    const invalidUserVerificationStatus = await User.find({
      verificationStatus: { $nin: allowedVs },
    }).select("_id name email role verificationStatus");

    const invalidCompanyStatus = await Company.find({
      verificationStatus: { $nin: allowedCompanyVs },
    }).select("_id name owner verificationStatus");

    res.json({
      allowed: {
        workerVerificationStatus: allowedWvs,
        userVerificationStatus: allowedVs,
        companyVerificationStatus: allowedCompanyVs,
      },
      invalid: {
        workerVerificationStatus: {
          count: invalidWorkerStatus.length,
          documents: invalidWorkerStatus,
        },
        userVerificationStatus: {
          count: invalidUserVerificationStatus.length,
          documents: invalidUserVerificationStatus,
        },
        companyVerificationStatus: {
          count: invalidCompanyStatus.length,
          documents: invalidCompanyStatus,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// ONE-TIME MIGRATION: rewrite legacy verification statuses to valid enum values
// unverified (worker) -> none
// unverified (user/company) -> pending
// Safe to call repeatedly (idempotent)
// =======================
router.post("/migrate/verification-status", auth, requireRole("admin"), async (req, res) => {
  try {
    const allowedWvs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
    const allowedVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
    const allowedCompanyVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];

    const wvsResult = await User.updateMany(
      { workerVerificationStatus: { $nin: allowedWvs } },
      { $set: { workerVerificationStatus: "none" } }
    );

    const vsResult = await User.updateMany(
      { verificationStatus: { $nin: allowedVs } },
      { $set: { verificationStatus: "pending" } }
    );

    const companyResult = await Company.updateMany(
      { verificationStatus: { $nin: allowedCompanyVs } },
      { $set: { verificationStatus: "pending" } }
    );

    // Backfill documentsApproved for existing accounts based on current status
    const userApprovedResult = await User.updateMany(
      { verificationStatus: "verified", documentsApproved: { $ne: true } },
      { $set: { documentsApproved: true } }
    );

    const userNotApprovedResult = await User.updateMany(
      { verificationStatus: { $ne: "verified" }, documentsApproved: { $ne: false } },
      { $set: { documentsApproved: false } }
    );

    const companyApprovedResult = await Company.updateMany(
      { verificationStatus: "verified", documentsApproved: { $ne: true } },
      { $set: { documentsApproved: true } }
    );

    const companyNotApprovedResult = await Company.updateMany(
      { verificationStatus: { $ne: "verified" }, documentsApproved: { $ne: false } },
      { $set: { documentsApproved: false } }
    );

    res.json({
      message: "Migration complete",
      workerVerificationStatusFixed: wvsResult.modifiedCount,
      userVerificationStatusFixed: vsResult.modifiedCount,
      companyVerificationStatusFixed: companyResult.modifiedCount,
      documentsApprovedBackfill: {
        usersApproved: userApprovedResult.modifiedCount,
        usersNotApproved: userNotApprovedResult.modifiedCount,
        companiesApproved: companyApprovedResult.modifiedCount,
        companiesNotApproved: companyNotApprovedResult.modifiedCount,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SYNC COMPANY DOCUMENTS WITH OWNER USER DATA
// Backfills existing Company records from their owner's User profile
// without requiring users to manually re-save their profiles.
// =======================
router.post("/sync-companies-from-owners", auth, requireRole("admin"), async (req, res) => {
  try {
    const companies = await Company.find({ owner: { $exists: true, $ne: null } }).lean();
    const ownerIds = companies.map((c) => c.owner.toString());
    const users = await User.find({ _id: { $in: ownerIds } }).lean();
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    let updated = 0;
    let skipped = 0;

    for (const company of companies) {
      const user = userById.get(company.owner.toString());
      if (!user) {
        skipped++;
        continue;
      }

      const updates = {};

      if (!company.name || company.name === "Unnamed Company") {
        updates.name = user.name || user.companyName || "Unnamed Company";
      }
      if (!company.logo) {
        updates.logo = user.profilePicture || "";
      }
      if (!company.industry) {
        updates.industry = user.industry || user.companyType || company.businessType || "";
      }
      if (!company.businessType) {
        updates.businessType = user.companyType || company.businessType || "";
      }
      if (!company.companySize) {
        updates.companySize = user.companySize || "";
      }
      if (!company.location) {
        updates.location = user.location || "";
      }
      if (!company.website) {
        updates.website = user.website || "";
      }
      if (!company.description) {
        updates.description = user.description || user.bio || user.professionalSummary || "";
      }
      if (!company.cacNumber) {
        updates.cacNumber = user.cacNumber || "";
      }
      if (!company.verificationStatus || company.verificationStatus === "pending") {
        updates.verificationStatus = user.verificationStatus || company.verificationStatus || "pending";
      }

      if (Object.keys(updates).length > 0) {
        await Company.findByIdAndUpdate(company._id, updates, { runValidators: false });
        updated++;
      } else {
        skipped++;
      }
    }

    res.json({
      message: `Sync complete. ${updated} companies updated, ${skipped} skipped.`,
      updated,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// PROFILE COMPLETION HELPERS
// =======================
function calculateWorkerCompletion(user) {
  const checks = [
    { key: "photo", label: "Photo", done: !!(user.profileImage || user.profilePicture) },
    { key: "phone", label: "Phone", done: !!user.phone },
    { key: "email", label: "Email", done: !!user.email },
    { key: "location", label: "Location", done: !!(user.location || user.city || user.state || user.country) },
    { key: "trade", label: "Trade", done: !!user.primaryTrade },
    { key: "description", label: "Description", done: !!(user.bio || user.professionalSummary) },
    { key: "skills", label: "Skills", done: Array.isArray(user.skills) && user.skills.length > 0 },
    { key: "experience", label: "Experience", done: !!(user.experienceYears && user.experienceYears > 0) },
    { key: "resume", label: "Resume", done: !!(user.resumeUrl || user.resume) },
    { key: "documents", label: "Verification Documents", done: (user.workerVerificationDocuments?.length || user.verificationEvidence?.length || 0) > 0 },
    { key: "linkedin", label: "LinkedIn", done: !!(user.socialLinks?.linkedin || user.linkedin) },
  ];
  const completed = checks.filter((c) => c.done).length;
  return {
    percentage: Math.round((completed / checks.length) * 100),
    checks,
  };
}

function calculateBusinessCompletion(user, company) {
  const checks = [
    { key: "logo", label: "Logo", done: !!((company && company.logo) || user.profilePicture) },
    { key: "phone", label: "Phone", done: !!user.phone },
    { key: "email", label: "Email", done: !!(user.companyEmail || user.email) },
    { key: "location", label: "Location", done: !!((company && company.location) || user.location) },
    { key: "description", label: "Description", done: !!((company && company.description) || user.description || user.bio) },
    { key: "industry", label: "Industry", done: !!((company && company.industry) || user.industry) },
    { key: "cacNumber", label: "CAC Number", done: !!((company && company.cacNumber) || user.cacNumber) },
    { key: "documents", label: "Documents", done: ((company && company.verificationDocuments?.length) || user.verificationDocuments?.length || 0) > 0 },
  ];
  const completed = checks.filter((c) => c.done).length;
  return {
    percentage: Math.round((completed / checks.length) * 100),
    checks,
  };
}

// =======================
// GET COMPREHENSIVE VERIFICATION DETAILS
// =======================
router.get("/verification/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isEmployer = user.role === "employer";
    let company = null;
    if (isEmployer && user.companyId) {
      company = await Company.findById(user.companyId).lean();
    }

    const profileCompletion = isEmployer
      ? calculateBusinessCompletion(user, company)
      : calculateWorkerCompletion(user);

    const documents = isEmployer
      ? (company?.verificationDocuments || user.verificationDocuments || []).map((doc) =>
          typeof doc === "string" ? { url: doc, uploadedAt: null, name: "Document" } : { ...doc, name: "Document" }
        )
      : (user.workerVerificationDocuments || user.verificationEvidence || []).map((doc, i) => {
          if (typeof doc === "string") return { url: doc, uploadedAt: null, name: `Document ${i + 1}` };
          return {
            url: doc.documentUrl || doc,
            uploadedAt: doc.createdAt || null,
            name: doc.documentName || `Document ${i + 1}`,
            category: doc.evidenceCategory,
            status: doc.status,
          };
        });

    const verificationHistory = await VerificationLog.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate("admin", "name email")
      .lean();

    const adminNotes = verificationHistory.filter(
      (log) => log.action === "note" && log.note
    );

    const statusLogs = verificationHistory.filter(
      (log) => log.action === "status_change" || log.action === "request_info"
    );

    const response = {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        location: user.location || "",
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin || null,
        accountStatus: user.accountStatus,
        reportsReceived: user.reportsReceived || 0,
        profileImage: user.profileImage || user.profilePicture || "",
        bio: user.bio || user.professionalSummary || "",
        headline: user.headline || "",
        skills: user.skills || [],
        primaryTrade: user.primaryTrade || "",
        category: user.category || "",
        experienceYears: user.experienceYears || 0,
        availability: user.availability || "available",
        certifications: user.certifications || [],
        languages: user.languages || [],
        socialLinks: user.socialLinks || {},
        linkedin: user.linkedin || "",
        github: user.github || "",
        website: user.website || "",
        city: user.city || "",
        state: user.state || "",
        country: user.country || "",
        workerVerificationStatus: user.workerVerificationStatus || "none",
        workerRejectionReason: user.workerRejectionReason || "",
        verificationStatus: user.verificationStatus || "none",
        rejectionReason: user.rejectionReason || "",
        isCompanyVerified: user.isCompanyVerified,
        documentsApproved: user.documentsApproved || false,
        portfolio: user.portfolio || [],
        resumeUrl: user.resumeUrl || "",
        resume: user.resume || "",
        resumeData: user.resumeData || null,
      },
      company: company
        ? {
            _id: company._id,
            name: company.name,
            email: company.companyEmail || user.companyEmail || user.email || "",
            phone: company.phone || user.phone || "",
            industry: company.industry || "",
            companySize: company.companySize || "",
            businessType: company.businessType || "",
            location: company.location || "",
            description: company.description || "",
            website: company.website || "",
            linkedin: company.linkedin || "",
            logo: company.logo || "",
            cacNumber: company.cacNumber || "",
            verificationStatus: company.verificationStatus || "none",
            rejectionReason: company.rejectionReason || "",
            documentsApproved: company.documentsApproved || false,
            profileUpdatedAfterVerification: company.profileUpdatedAfterVerification || false,
            profileUpdatedAfterVerificationAt: company.profileUpdatedAfterVerificationAt || null,
            isActive: company.isActive,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
          }
        : null,
      profileCompletion,
      isPubliclyEligible: !isEmployer ? isPubliclyEligible(user) : null,
      publicDirectoryStatusReasons: !isEmployer ? getPublicDirectoryIneligibilityReasons(user) : null,
      documents,
      verificationHistory: statusLogs,
      adminNotes,
      accountActivity: {
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin || null,
      },
      reports: {
        count: user.reportsReceived || 0,
        warnings: [],
      },
      verificationSummary: {
        type: isEmployer ? "business" : "worker",
        currentStatus: isEmployer
          ? company?.verificationStatus || user.verificationStatus || "none"
          : user.workerVerificationStatus || "none",
        documentsCount: documents.length,
        documentsApproved: isEmployer
          ? company?.documentsApproved || user.documentsApproved || false
          : user.workerVerificationStatus === "verified",
        submittedAt: verificationHistory.find((log) => log.action === "submit")?.createdAt || null,
        lastReviewedAt: statusLogs[0]?.createdAt || null,
        lastReviewedBy: statusLogs[0]?.admin?.name || null,
      },
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// REQUEST MORE INFORMATION
// =======================
router.post("/verification/:id/request-info", auth, requireRole("admin"), async (req, res) => {
  try {
    const { message } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isEmployer = user.role === "employer";
    const previousStatus = isEmployer
      ? (await Company.findById(user.companyId))?.verificationStatus || user.verificationStatus || "none"
      : user.workerVerificationStatus || "none";

    if (isEmployer) {
      await User.findByIdAndUpdate(user._id, { verificationStatus: "info_requested" }, { runValidators: false });
    } else {
      await User.findByIdAndUpdate(user._id, { workerVerificationStatus: "info_requested" }, { runValidators: false });
    }

    await VerificationLog.create({
      user: user._id,
      type: isEmployer ? "business" : "worker",
      action: "request_info",
      fromStatus: previousStatus,
      toStatus: "info_requested",
      requestedInfo: message || "",
      admin: req.user._id,
    });

    res.json({ message: "More information requested" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// ADD ADMIN NOTE
// =======================
router.post("/verification/:id/note", auth, requireRole("admin"), async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ message: "Note is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isEmployer = user.role === "employer";

    const log = await VerificationLog.create({
      user: user._id,
      type: isEmployer ? "business" : "worker",
      action: "note",
      note: note.trim(),
      admin: req.user._id,
    });

    res.json({ message: "Note added", log });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET VERIFICATION HISTORY
// =======================
router.get("/verification/:id/history", auth, requireRole("admin"), async (req, res) => {
  try {
    const history = await VerificationLog.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .populate("admin", "name email")
      .lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

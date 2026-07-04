const router = require("express").Router();
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");
const Company = require("../models/Company");
const Job = require("../models/Job");
const User = require("../models/User");
const TeamInvitation = require("../models/TeamInvitation");
const Application = require("../models/Application");
const { sendInvitationEmail } = require("../services/emailService");

// =========================
// OPTIONAL AUTH HELPER
// Attaches req.user if a valid token is provided, otherwise continues
// =========================
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select(
          "-password -emailVerificationToken -resetPasswordToken"
        );
        if (user) req.user = user;
      }
    }
  } catch (err) {
    // ignore invalid tokens for public routes
  }
  next();
};

// =========================
// GET COMPANY + ITS JOBS
// Public: only active, non-deleted jobs
// Company members: all jobs including deleted
// =========================
router.get("/:id/jobs", optionalAuth, async (req, res) => {
  try {
    const companyId = req.params.id;

    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    let query = { companyId: companyId, isDeleted: false };

    const isCompanyMember =
      req.user &&
      req.user.companyId &&
      req.user.companyId.toString() === companyId;

    if (!isCompanyMember) {
      query.status = "active";
    }

    const jobs = await Job.find(query).sort({ createdAt: -1 });

    res.json({
      company,
      jobs
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// GET COMPANY PROFILE
// =========================
router.get("/:id", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate("owner", "name email")
      .populate("teamMembers", "name email");

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    res.json(company);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// UPDATE COMPANY PROFILE
// =========================
router.put("/:id", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    // Check if user is owner or admin of the company
    const user = await User.findById(req.user.id);
    if (
      !user.companyId ||
      user.companyId.toString() !== company._id.toString() ||
      (user.companyRole !== "owner" && user.companyRole !== "admin")
    ) {
      return res.status(403).json({
        message: "Not authorized to update this company"
      });
    }

    const {
      name,
      description,
      logo,
      website,
      industry,
      companySize,
      location,
      cacNumber,
    } = req.body;

    if (name) company.name = name;
    if (description !== undefined) company.description = description;
    if (logo !== undefined) company.logo = logo;
    if (website !== undefined) company.website = website;
    if (industry !== undefined) company.industry = industry;
    if (companySize !== undefined) company.companySize = companySize;
    if (location !== undefined) company.location = location;
    if (cacNumber !== undefined) company.cacNumber = cacNumber;

    await company.save();

    res.json(company);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// GET COMPANY TEAM MEMBERS
// =========================
router.get("/:id/team", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate("teamMembers", "name email companyRole");

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const user = await User.findById(req.user.id);
    if (
      !user.companyId ||
      user.companyId.toString() !== company._id.toString()
    ) {
      return res.status(403).json({
        message: "Not authorized to view this company's team"
      });
    }

    res.json(company.teamMembers);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// INVITE TEAM MEMBER
// =========================
router.post("/:id/invite", auth, async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({
        message: "Email and role are required"
      });
    }

    if (!["admin", "recruiter"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role. Must be admin or recruiter"
      });
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const user = await User.findById(req.user.id);
    if (
      !user.companyId ||
      user.companyId.toString() !== company._id.toString() ||
      user.companyRole !== "owner"
    ) {
      return res.status(403).json({
        message: "Only company owners can invite team members"
      });
    }

    // Subscription required for team management
    if (!company.subscriptionActive) {
      return res.status(403).json({
        message: "An active subscription is required to invite team members. Please upgrade your plan."
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.companyId) {
        return res.status(400).json({
          message: "User already belongs to a company"
        });
      }
    }

    // Check if there's already a pending invitation
    const existingInvitation = await TeamInvitation.findOne({
      email,
      company: company._id,
      status: "pending"
    });

    if (existingInvitation) {
      return res.status(400).json({
        message: "A pending invitation already exists for this email"
      });
    }

    // Create invitation (expires in 7 days)
    const invitation = await TeamInvitation.create({
      company: company._id,
      email,
      role,
      invitedBy: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    // Send invitation email
    try {
      const emailResult = await sendInvitationEmail({
        to: email,
        companyName: company.name,
        inviterName: user.name,
        role: role,
        token: invitation.token,
        expiryDate: invitation.expiresAt.toLocaleDateString(),
      });

      if (emailResult.success) {
        console.log("Invitation email sent successfully to:", email);
      } else {
        console.error("Failed to send invitation email:", emailResult.error);
      }
    } catch (emailError) {
      console.error("Error sending invitation email:", emailError);
      // Do not fail the invitation creation if email sending fails
    }

    res.status(201).json({
      message: "Invitation sent successfully",
      invitation
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// GET INVITATION BY TOKEN (PUBLIC)
// =========================
router.get("/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const invitation = await TeamInvitation.findOne({ token })
      .populate("company", "name logo")
      .populate("invitedBy", "name");

    if (!invitation) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: `Invitation is ${invitation.status}`
      });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(400).json({
        message: "Invitation has expired"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: invitation.email });

    res.json({
      valid: true,
      invitation: {
        email: invitation.email,
        companyName: invitation.company.name,
        companyLogo: invitation.company.logo,
        role: invitation.role,
        invitedBy: invitation.invitedBy.name,
        expiresAt: invitation.expiresAt,
      },
      userExists: !!existingUser,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// ACCEPT TEAM INVITATION BY TOKEN
// =========================
router.post("/invite/:token/accept", auth, async (req, res) => {
  try {
    const { token } = req.params;

    const invitation = await TeamInvitation.findOne({ token });

    if (!invitation) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: "Invitation is no longer valid"
      });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(400).json({
        message: "Invitation has expired"
      });
    }

    const user = await User.findById(req.user.id);
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        message: "This invitation is not for your email"
      });
    }

    if (user.companyId) {
      return res.status(400).json({
        message: "You already belong to a company"
      });
    }

    // Update user
    await User.findByIdAndUpdate(
      req.user.id,
      { companyId: invitation.company, companyRole: invitation.role, role: "employer" },
      { runValidators: false }
    );

    // Update company team members
    const company = await Company.findById(invitation.company);
    if (!company.teamMembers.includes(user._id)) {
      company.teamMembers.push(user._id);
      await company.save();
    }

    // Update invitation
    invitation.status = "accepted";
    invitation.acceptedAt = new Date();
    await invitation.save();

    res.json({
      message: "Invitation accepted successfully",
      company
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// ACCEPT TEAM INVITATION (LEGACY - BY ID)
// =========================
router.post("/invitations/:id/accept", auth, async (req, res) => {
  try {
    const invitation = await TeamInvitation.findById(req.params.id);

    if (!invitation) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: "Invitation is no longer valid"
      });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(400).json({
        message: "Invitation has expired"
      });
    }

    const user = await User.findById(req.user.id);
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        message: "This invitation is not for your email"
      });
    }

    if (user.companyId) {
      return res.status(400).json({
        message: "You already belong to a company"
      });
    }

    // Update user
    await User.findByIdAndUpdate(
      req.user.id,
      { companyId: invitation.company, companyRole: invitation.role, role: "employer" },
      { runValidators: false }
    );

    // Update company team members
    const company = await Company.findById(invitation.company);
    if (!company.teamMembers.includes(user._id)) {
      company.teamMembers.push(user._id);
      await company.save();
    }

    // Update invitation
    invitation.status = "accepted";
    invitation.acceptedAt = new Date();
    await invitation.save();

    res.json({
      message: "Invitation accepted successfully",
      company
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// GET PENDING INVITATIONS FOR USER
// =========================
router.get("/invitations/pending", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const invitations = await TeamInvitation.find({
      email: user.email,
      status: "pending",
      expiresAt: { $gt: new Date() }
    })
    .populate("company", "name logo")
    .populate("invitedBy", "name");

    res.json(invitations);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// RESEND INVITATION EMAIL
// =========================
router.post("/:id/invitations/:invitationId/resend", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const user = await User.findById(req.user.id);
    if (
      !user.companyId ||
      user.companyId.toString() !== company._id.toString() ||
      user.companyRole !== "owner"
    ) {
      return res.status(403).json({
        message: "Only company owners can resend invitations"
      });
    }

    const invitation = await TeamInvitation.findById(req.params.invitationId);

    if (!invitation) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invitation.company.toString() !== company._id.toString()) {
      return res.status(403).json({
        message: "Invitation does not belong to this company"
      });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        message: "Can only resend pending invitations"
      });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({
        message: "Invitation has expired"
      });
    }

    // Resend invitation email
    try {
      const emailResult = await sendInvitationEmail({
        to: invitation.email,
        companyName: company.name,
        inviterName: user.name,
        role: invitation.role,
        token: invitation.token,
        expiryDate: invitation.expiresAt.toLocaleDateString(),
      });

      if (emailResult.success) {
        console.log("Invitation email resent successfully to:", invitation.email);
        res.json({
          message: "Invitation email resent successfully",
          messageId: emailResult.messageId
        });
      } else {
        console.error("Failed to resend invitation email:", emailResult.error);
        res.status(500).json({
          message: "Failed to resend invitation email",
          error: emailResult.error
        });
      }
    } catch (emailError) {
      console.error("Error resending invitation email:", emailError);
      res.status(500).json({
        message: "Error resending invitation email",
        error: emailError.message
      });
    }
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// REMOVE TEAM MEMBER
// =========================
router.delete("/:id/team/:userId", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const requestingUser = await User.findById(req.user.id);
    if (
      !requestingUser.companyId ||
      requestingUser.companyId.toString() !== company._id.toString() ||
      requestingUser.companyRole !== "owner"
    ) {
      return res.status(403).json({
        message: "Only company owners can remove team members"
      });
    }

    const memberToRemove = await User.findById(req.params.userId);
    if (!memberToRemove) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (memberToRemove.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({
        message: "User is not a member of this company"
      });
    }

    if (memberToRemove.companyRole === "owner") {
      return res.status(400).json({
        message: "Cannot remove the company owner"
      });
    }

    // Remove from company team members
    company.teamMembers = company.teamMembers.filter(
      id => id.toString() !== req.params.userId
    );
    await company.save();

    // Remove user's company association
    await User.findByIdAndUpdate(
      req.params.userId,
      { companyId: null, companyRole: null, role: "jobseeker" },
      { runValidators: false }
    );

    res.json({
      message: "Team member removed successfully"
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// GET COMPANY DASHBOARD STATS
// =========================
router.get("/:id/dashboard", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const user = await User.findById(req.user.id);
    if (
      !user.companyId ||
      user.companyId.toString() !== company._id.toString()
    ) {
      return res.status(403).json({
        message: "Not authorized to view this company's dashboard"
      });
    }

    // Get company jobs (exclude deleted from dashboard stats)
    const jobs = await Job.find({ companyId: company._id, isDeleted: false });
    const totalJobs = jobs.length;
    const activeJobs = jobs.filter(job => job.status === "active").length;

    // Get applicants for all company jobs
    const jobIds = jobs.map(job => job._id);
    const applications = await Application.find({
      job: { $in: jobIds }
    });
    const totalApplicants = applications.length;

    // Get pending invitations
    const pendingInvitations = await TeamInvitation.find({
      company: company._id,
      status: "pending",
      expiresAt: { $gt: new Date() }
    });

    // Get team members count
    const teamMembersCount = company.teamMembers.length;

    res.json({
      company: {
        name: company.name,
        subscriptionPlan: company.subscriptionPlan,
        jobsPosted: company.jobsPosted,
        subscriptionActive: company.subscriptionActive,
        verificationStatus: company.verificationStatus,
        businessType: company.businessType || "",
      },
      stats: {
        totalJobs,
        activeJobs,
        totalApplicants,
        teamMembersCount,
        pendingInvitations: pendingInvitations.length,
      },
      jobsRemaining: company.subscriptionActive 
        ? -1 // unlimited for active subscriptions
        : Math.max(0, 1 - company.jobsPosted), // free plan: 1 job
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

// =========================
// UPDATE TEAM MEMBER ROLE
// =========================
router.put("/:id/team/:userId/role", auth, async (req, res) => {
  try {
    const { role } = req.body;

    // Validate role
    if (!role || !["admin", "recruiter"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role. Must be admin or recruiter"
      });
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const requestingUser = await User.findById(req.user.id);
    if (
      !requestingUser.companyId ||
      requestingUser.companyId.toString() !== company._id.toString() ||
      requestingUser.companyRole !== "owner"
    ) {
      return res.status(403).json({
        message: "Only company owners can update team member roles"
      });
    }

    const memberToUpdate = await User.findById(req.params.userId);
    if (!memberToUpdate) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (memberToUpdate.companyId.toString() !== company._id.toString()) {
      return res.status(400).json({
        message: "User is not a member of this company"
      });
    }

    if (memberToUpdate.companyRole === "owner") {
      return res.status(400).json({
        message: "Cannot change the owner's role"
      });
    }

    // Update user's role
    await User.findByIdAndUpdate(
      req.params.userId,
      { companyRole: role },
      { runValidators: false }
    );

    res.json({
      message: "Team member role updated successfully",
      user: {
        _id: memberToUpdate._id,
        name: memberToUpdate.name,
        email: memberToUpdate.email,
        companyRole: role
      }
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

module.exports = router;

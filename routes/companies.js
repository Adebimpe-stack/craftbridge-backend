const router = require("express").Router();
const auth = require("../middleware/auth");
const Company = require("../models/Company");
const Job = require("../models/Job");
const User = require("../models/User");
const TeamInvitation = require("../models/TeamInvitation");
const { body, validationResult } = require("express-validator");

// =========================
// GET COMPANY + ITS JOBS
// =========================
router.get("/:id/jobs", async (req, res) => {
  try {
    const companyId = req.params.id;

    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    const jobs = await Job.find({
      companyId: companyId
    }).sort({ createdAt: -1 });

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
router.put(
  "/:id",
  auth,
  [
    body("name").optional().trim().notEmpty().withMessage("Company name cannot be empty."),
    body("website").optional().isURL().withMessage("Please provide a valid website URL."),
    body("industry").optional().trim(),
    body("companySize").optional().isIn(["1-10", "11-50", "51-200", "201-500", "500+"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Check if user is owner or admin of the company
    const user = await User.findById(req.user.id);
    const isMember = company.teamMembers.some(memberId => memberId.equals(user._id));
    const hasPermission = isMember && (user.companyRole === "owner" || user.companyRole === "admin");

    if (!hasPermission) {
      return res.status(403).json({ message: "Not authorized to update this company" });
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
  }
);

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

    // Authorization: Check if the requesting user is a member of the company.
    if (!company.teamMembers.some(memberId => memberId.equals(req.user.id))) {
      return res.status(403).json({ message: "Not authorized to view this company's team" });
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
router.post(
  "/:id/invite",
  auth,
  [
    body("email").isEmail().withMessage("Please provide a valid email."),
    body("role").isIn(["admin", "recruiter"]).withMessage("Invalid role. Must be admin or recruiter."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, role } = req.body;

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (!company.owner.equals(req.user.id)) {
      return res.status(403).json({ message: "Only company owners can invite team members" });
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
      invitedBy: req.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.status(201).json({
      message: "Invitation sent successfully",
      invitation
    });
  }
);

// =========================
// ACCEPT TEAM INVITATION
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
    user.companyId = invitation.company;
    user.companyRole = invitation.role;
    user.role = "employer";
    await user.save();

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

    if (!company.owner.equals(req.user.id)) {
      return res.status(403).json({ message: "Only company owners can remove team members" });
    }

    const memberToRemove = await User.findById(req.params.userId);
    if (!memberToRemove) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (!memberToRemove.companyId || !memberToRemove.companyId.equals(company._id)) {
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
    memberToRemove.companyId = null;
    memberToRemove.companyRole = null;
    memberToRemove.role = "jobseeker";
    await memberToRemove.save();

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
// UPDATE TEAM MEMBER ROLE
// =========================
router.put(
  "/:id/team/:userId/role",
  auth,
  [body("role").isIn(["admin", "recruiter"]).withMessage("Invalid role. Must be admin or recruiter.")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { role } = req.body;

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    if (!company.owner.equals(req.user.id)) {
      return res.status(403).json({ message: "Only company owners can update team member roles" });
    }

    const memberToUpdate = await User.findById(req.params.userId);
    if (!memberToUpdate) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (!memberToUpdate.companyId || !memberToUpdate.companyId.equals(company._id)) {
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
    memberToUpdate.companyRole = role;
    await memberToUpdate.save();

    res.json({
      message: "Team member role updated successfully",
      user: {
        _id: memberToUpdate._id,
        name: memberToUpdate.name,
        email: memberToUpdate.email,
        companyRole: memberToUpdate.companyRole
      }
    });
  }
);

// =========================
// REQUEST COMPANY STATUS CHANGE (DEACTIVATION/REACTIVATION)
// =========================
router.post(
  "/:id/request-status-change",
  auth,
  [
    body("requestType").isIn(["deactivation", "reactivation"]).withMessage("Invalid request type."),
    body("reason", "A reason for the request is required").not().isEmpty().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { requestType, reason } = req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Only the company owner can make this request" });
    }

    if (company.deactivationRequest && company.deactivationRequest.status === 'pending') {
      return res.status(400).json({ message: "You already have a pending status change request" });
    }

    if (requestType === 'deactivation' && !company.isActive) {
      return res.status(400).json({ message: "Company is already inactive." });
    }

    if (requestType === 'reactivation' && company.isActive) {
      return res.status(400).json({ message: "Company is already active." });
    }

    company.deactivationRequest = {
      requestType,
      reason,
      requestedBy: req.user.id,
      requestedAt: new Date(),
      status: 'pending'
    };
    await company.save();

    res.json({ message: "Your request has been submitted for admin review.", company });
  }
);

// =========================
// REQUEST ACCOUNT TYPE CHANGE
// =========================
router.post(
  "/:id/request-type-change",
  auth,
  [
    body("requestedType").isIn(["employer", "agency"]).withMessage("Invalid requested type."),
    body("reason", "Reason is required").not().isEmpty().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { requestedType, reason } = req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Only company owner can request type change" });
    }

    if (company.typeChangeRequest && company.typeChangeRequest.status === 'pending') {
      return res.status(400).json({ message: "You already have a pending type change request" });
    }

    company.typeChangeRequest = {
      requestedType,
      currentType: company.companyType,
      reason,
      requestedBy: req.user.id,
      requestedAt: new Date(),
      status: 'pending'
    };
    await company.save();

    res.json({
      message: "Account type change request submitted for admin review",
      typeChangeRequest: company.typeChangeRequest
    });
  }
);

// =========================
// REQUEST ACCOUNT DELETION (SOFT DELETE)
// =========================
router.post(
  "/:id/request-deletion",
  auth,
  async (req, res) => {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Only company owner can request deletion" });
    }

    company.deletionRequest = {
      requestedBy: req.user.id,
      requestedAt: new Date(),
      status: 'pending',
      scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days grace period
    };
    company.isActive = false;
    await company.save();

    await Job.updateMany(
      { companyId: company._id, status: "active" },
      { $set: { status: "closed", closedReason: "Company marked for deletion" } }
    );

    res.json({
      message: "Account deletion request submitted. Your account will be marked for deletion after the grace period.",
      company
    });
  }
);

module.exports = router;

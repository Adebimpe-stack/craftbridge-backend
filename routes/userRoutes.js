const express =
  require("express");

const router =
  express.Router();

const User =
  require("../models/User");

const Company =
  require("../models/Company");

const Job =
  require("../models/Job");

const VerificationLog =
  require("../models/VerificationLog");

const protect =
  require("../middleware/auth");

const upload =
  require("../middleware/upload");

// ==============================
// GET COMPANY PROFILE
// ==============================

router.get(
  "/company-profile",
  protect,
  async (req, res) => {

    try {

      const user =
        await User.findById(
          req.user.id
        ).select("-password");

      if (!user) {

        return res.status(404).json({
          message:
            "User not found",
        });

      }

      // Company is the authoritative source for employer subscription state.
      // Mirror its subscription fields into the response so the frontend has
      // a single, consistent source of truth.
      let subscriptionData = {
        hasActiveSubscription: false,
        subscriptionActive: false,
        subscriptionPlan: "free",
        subscriptionExpiry: null,
      };

      const now = new Date();

      if (user.companyId) {
        const company = await Company.findById(user.companyId).select(
          "subscriptionActive subscriptionPlan subscriptionExpiry"
        );

        if (company) {
          const isActive =
            company.subscriptionActive &&
            company.subscriptionExpiry &&
            new Date(company.subscriptionExpiry) > now;

          subscriptionData = {
            hasActiveSubscription: isActive,
            subscriptionActive: isActive,
            subscriptionPlan: company.subscriptionPlan || "free",
            subscriptionExpiry: company.subscriptionExpiry || null,
          };
        }
      } else {
        // Fallback to the user record when no company is linked
        const isActive =
          user.subscriptionActive &&
          user.subscriptionExpiry &&
          new Date(user.subscriptionExpiry) > now;

        subscriptionData = {
          hasActiveSubscription: isActive,
          subscriptionActive: isActive,
          subscriptionPlan: user.subscriptionPlan || "free",
          subscriptionExpiry: user.subscriptionExpiry || null,
        };
      }

      // Merge company profile data into the response
      let companyProfileData = {};
      if (user.companyId) {
        const company = await Company.findById(user.companyId).lean();
        if (company) {
          companyProfileData = {
            companyName: company.name,
            industry: company.industry || "",
            companySize: company.companySize || "",
            location: company.location || "",
            description: company.description || "",
            website: company.website || "",
            logo: company.logo || "",
            cacNumber: company.cacNumber || "",
            companyEmail: company.companyEmail || user.email || "",
            businessType: company.businessType || "",
            verificationStatus: company.verificationStatus || "none",
            isCompanyVerified: company.verificationStatus === "verified",
            documentsApproved: company.documentsApproved || false,
            rejectionReason: company.rejectionReason || "",
            verificationDocuments: (company.verificationDocuments || user.verificationDocuments || []).map((doc) =>
              typeof doc === "string" ? { url: doc, uploadedAt: null } : doc
            ),
          };
        }
      }

      res.json({
        ...user.toObject(),
        ...companyProfileData,
        ...subscriptionData,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

// ==============================
// GET CURRENT VERIFICATION STATUS & ADMIN MESSAGE
// ==============================

router.get("/verification-status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isEmployer = user.role === "employer";
    let company = null;
    if (isEmployer && user.companyId) {
      company = await Company.findById(user.companyId).lean();
    }

    const status = isEmployer
      ? (company?.verificationStatus || user.verificationStatus || "none")
      : (user.workerVerificationStatus || "none");

    const rejectionReason = isEmployer
      ? (company?.rejectionReason || user.rejectionReason || "")
      : (user.workerRejectionReason || "");

    const documentsApproved = isEmployer
      ? (company?.documentsApproved || user.documentsApproved || false)
      : (status === "verified");

    const documents = isEmployer
      ? (company?.verificationDocuments || user.verificationDocuments || [])
      : (user.workerVerificationDocuments || user.verificationEvidence || []);

    const latestRequest = await VerificationLog.findOne({
      user: user._id,
      action: "request_info",
    })
      .sort({ createdAt: -1 })
      .lean();

    const latestStatusChange = await VerificationLog.findOne({
      user: user._id,
      action: "status_change",
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      type: isEmployer ? "business" : "worker",
      status,
      statusLabel: status.replace("_", " "),
      rejectionReason,
      infoRequestedMessage: latestRequest?.requestedInfo || "",
      infoRequestedAt: latestRequest?.createdAt || null,
      documentsApproved,
      documentsCount: documents.length,
      lastAdminAction: latestStatusChange?.createdAt || null,
      canSubmit: ["none", "rejected", "info_requested"].includes(status),
      canUpload: !["pending", "verified"].includes(status),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// USER RESUBMITS AFTER INFO REQUEST
// =============================
router.post("/verification-resubmit", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isEmployer = user.role === "employer";
    let target = null;
    let status = "none";

    if (isEmployer && user.companyId) {
      target = await Company.findById(user.companyId);
      status = target?.verificationStatus || user.verificationStatus || "none";
    } else {
      status = user.workerVerificationStatus || "none";
    }

    if (status !== "info_requested") {
      return res.status(400).json({
        message: "You can only resubmit after an admin has requested more information.",
      });
    }

    const newStatus = "pending";

    if (target) {
      target.verificationStatus = newStatus;
      await target.save();
    } else {
      user.workerVerificationStatus = newStatus;
      await user.save();
    }

    await VerificationLog.create({
      user: user._id,
      type: isEmployer ? "business" : "worker",
      action: "resubmit",
      fromStatus: status,
      toStatus: newStatus,
      requestedInfo: "",
      note: "User provided the requested information and resubmitted.",
      admin: req.user.id,
    });

    res.json({
      message: "Resubmitted successfully. Your information is now pending review.",
      status: newStatus,
      statusLabel: newStatus.replace("_", " "),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ==============================
// UPDATE COMPANY PROFILE
// ==============================

router.put(

  "/company-profile",

  protect,

  upload.fields([
  {
    name: "verificationDocuments",
    maxCount: 10,
  },
  {
    name: "profilePicture",
    maxCount: 1,
  },
]),

  async (req, res) => {

    try {

      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {

        return res.status(404).json({
          message:
            "User not found",
        });

      }

      // =========================
      // UPDATE PROFILE FIELDS
      // =========================

      const incomingCompanyName =
        req.body.companyName ||
        user.companyName;

      user.companyEmail =
        req.body.companyEmail ||
        user.companyEmail ||
        user.email;

      user.phone =
        req.body.phone ||
        user.phone;

      user.website =
        req.body.website ||
        user.website;

      user.location =
        req.body.location ||
        user.location;

      user.cacNumber =
        req.body.cacNumber ||
        user.cacNumber;

      // =========================
      // HANDLE FILE UPLOAD
      // =========================

      if (req.files?.verificationDocuments) {
        const existingDocs = (user.verificationDocuments || []).map((doc) =>
          typeof doc === "string" ? { url: doc, uploadedAt: new Date() } : doc
        );
        const newDocs = req.files.verificationDocuments.map((file) => ({
          url: file.location,
          uploadedAt: new Date(),
        }));

        user.verificationDocuments = [...existingDocs, ...newDocs];
        user.isCompanyVerified = false;
        user.verificationStatus = "none";
        user.documentsApproved = false;
      }

      if (req.files?.profilePicture?.[0]) {
        user.profilePicture =
          req.files.profilePicture[0].location;
      }

      // =========================
      // PERSIST COMPANY DATA TO COMPANY MODEL
      // =========================
      const companyUpdateFields = {
        name: incomingCompanyName || user.name,
        website: req.body.website || user.website || "",
        industry: req.body.industry || "",
        companySize: req.body.companySize || "",
        location: req.body.location || user.location || "",
        description: req.body.description || "",
        cacNumber: req.body.cacNumber || user.cacNumber || "",
        companyEmail: req.body.companyEmail || user.companyEmail || user.email || "",
        businessType: req.body.companyType || user.companyType || "",
        verificationStatus: user.verificationStatus,
        documentsApproved: user.documentsApproved,
      };

      if (user.profilePicture) {
        companyUpdateFields.logo = user.profilePicture;
      }

      if (user.verificationDocuments?.length) {
        companyUpdateFields.verificationDocuments = user.verificationDocuments;
      }

      let company = null;
      if (user.companyId) {
        company = await Company.findByIdAndUpdate(
          user.companyId,
          companyUpdateFields,
          { returnDocument: "after", runValidators: false }
        );
      } else if (user.role === "employer") {
        company = await Company.create({
          ...companyUpdateFields,
          owner: user._id,
          createdBy: user._id,
        });
        await User.findByIdAndUpdate(
          user._id,
          { companyId: company._id, companyRole: "owner" },
          { runValidators: false }
        );
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        {
          phone: user.phone,
          website: user.website,
          location: user.location,
          cacNumber: user.cacNumber,
          companyEmail: user.companyEmail,
          verificationDocuments: user.verificationDocuments,
          isCompanyVerified: user.isCompanyVerified,
          documentsApproved: user.documentsApproved,
          profilePicture: user.profilePicture,
        },
        { returnDocument: "after", runValidators: false }
      );

      res.json({

        message:
          "Company profile updated successfully",

        user: updatedUser,
        company,

      });

    } catch (error) {

      console.log(
        "UPLOAD ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// DELETE VERIFICATION DOCUMENT
// ==============================

router.delete(

  "/company-profile/document",

  protect,

  async (req, res) => {

    try {

      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {

        return res.status(404).json({
          message:
            "User not found",
        });

      }

      const docUrl = req.body.docUrl;
      let updatedDocs = [];

      if (docUrl) {
        updatedDocs = (user.verificationDocuments || [])
          .filter((doc) => (typeof doc === "string" ? doc : doc.url) !== docUrl)
          .map((doc) =>
            typeof doc === "string" ? { url: doc, uploadedAt: new Date() } : doc
          );
      }

      await User.findByIdAndUpdate(
        req.user.id,
        { verificationDocuments: updatedDocs, isCompanyVerified: false, verificationStatus: "none", documentsApproved: false },
        { runValidators: false }
      );

      if (user.companyId) {
        await Company.findByIdAndUpdate(
          user.companyId,
          { verificationDocuments: updatedDocs, verificationStatus: "none", documentsApproved: false },
          { runValidators: false }
        );
      }

      res.json({

        message:
          "Verification document removed",

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// DELETE COMPANY LOGO
// ==============================

router.delete(

  "/company-profile/logo",

  protect,

  async (req, res) => {

    try {

      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {

        return res.status(404).json({
          message:
            "User not found",
        });

      }

      await User.findByIdAndUpdate(
        req.user.id,
        { profilePicture: "" },
        { runValidators: false }
      );

      res.json({

        message:
          "Logo removed",

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// GET ALL EMPLOYERS (ADMIN)
// ==============================

router.get(

  "/admin/employers",

  protect,

  async (req, res) => {

    try {

      if (
        req.user.role !==
        "admin"
      ) {

        return res.status(403).json({

          message:
            "Access denied",

        });

      }

      const employers =
  await User.find({
    role: "employer",
  })
  .sort({
    createdAt: -1,
  })
  .select("-password");
      res.json(
        employers
      );

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// VERIFY EMPLOYER (ADMIN)
// ==============================

router.put(
  "/admin/verify/:id",
  protect,
  async (req, res) => {
    try {

      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Access denied",
        });
      }

      const user = await User.findById(
        req.params.id
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const { status, reason } = req.body;
      let updateFields = {};

      if (status === "verified") {
        updateFields = { isCompanyVerified: true, verificationStatus: "verified", accountStatus: "active", rejectionReason: "", suspensionReason: "" };
      } else if (status === "rejected") {
        updateFields = { isCompanyVerified: false, verificationStatus: "rejected", accountStatus: "active", rejectionReason: reason || "" };
      } else if (status === "suspended") {
        updateFields = { accountStatus: "suspended", suspensionReason: reason || "" };
      } else if (status === "unsuspend") {
        updateFields = { accountStatus: "active", suspensionReason: "" };
      } else {
        updateFields = { isCompanyVerified: false, verificationStatus: "pending", accountStatus: "active" };
      }

      await User.findByIdAndUpdate(req.params.id, updateFields, { runValidators: false });
      res.json({ message: `Employer ${status} successfully` });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message: "Server error",
      });

    }
  }
);

// ==============================
// PUBLIC COMPANY PROFILE
// ==============================

router.get(

  "/company/:id",

  async (req, res) => {

    try {

      const company =
        await User.findById(
          req.params.id
        ).select("-password");

      if (!company) {

        return res.status(404).json({

          message:
            "Company not found",

        });

      }

      const Job =
        require("../models/Job");

      const jobs =
        await Job.find({

          companyId:
            company._id,

        });

      res.json({

        company,

        jobs,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// PUBLIC TALENT DIRECTORY
// ==============================

router.get(
  "/talent",
  async (req, res) => {

    try {

      const talent =
        await User.find({
          role: "jobseeker",
        })
        .select(
          "-password"
        )
        .sort({
          createdAt: -1,
        });

      res.json(talent);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

// ==============================
// SUBMIT VERIFICATION
// ==============================

router.put(
  "/company-profile/submit",
  protect,
  async (req, res) => {

    try {

      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {

        return res.status(404).json({
          message: "User not found",
        });

      }

      if (
        !user.verificationDocuments ||
        user.verificationDocuments.length === 0
      ) {

        return res.status(400).json({
          message:
            "Upload documents first",
        });

      }

      await User.findByIdAndUpdate(
        req.user.id,
        { verificationStatus: "pending", isCompanyVerified: false, documentsApproved: false },
        { runValidators: false }
      );

      if (user.companyId) {
        await Company.findByIdAndUpdate(
          user.companyId,
          { verificationStatus: "pending", documentsApproved: false },
          { runValidators: false }
        );
      }

      await VerificationLog.create({
        user: user._id,
        type: "business",
        action: "submit",
        fromStatus: "none",
        toStatus: "pending",
      });

      res.json({
        message:
          "Verification submitted",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message: "Server error",
      });

    }

  }
);
// ==============================
// SELF-DEACTIVATE ACCOUNT
// ==============================
router.put("/deactivate-account", protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { accountStatus: "deactivated" }, { runValidators: false });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Account deactivated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==============================
// DEACTIVATE COMPANY
// ==============================
router.put("/company-profile/deactivate", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const companyId = user.companyId;

    await User.findByIdAndUpdate(req.user.id, { accountStatus: "deactivated" }, { runValidators: false });

    if (companyId) {
      await Company.findByIdAndUpdate(
        companyId,
        { isActive: false, deactivatedAt: new Date(), deactivatedBy: user._id },
        { runValidators: false }
      );

      // Close all active job postings for this company
      await Job.updateMany(
        { $or: [{ company: companyId }, { companyId: companyId }], status: "active" },
        { status: "closed" }
      );

      // Deactivate all team members of this company so they cannot log in
      await User.updateMany(
        { companyId: companyId, _id: { $ne: user._id } },
        { accountStatus: "deactivated" }
      );
    }

    res.json({ message: "Company deactivated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==============================
// REQUEST COMPANY DELETION
// ==============================
router.post("/company-profile/request-deletion", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.companyId) {
      return res.status(400).json({ message: "No company associated with this account" });
    }

    await Company.findByIdAndUpdate(
      user.companyId,
      {
        isActive: false,
        deletionRequest: {
          status: "pending",
          requestedBy: user._id,
          requestedAt: new Date(),
        },
      },
      { runValidators: false }
    );

    res.json({ message: "Company deletion request submitted for admin review" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports =
  router;

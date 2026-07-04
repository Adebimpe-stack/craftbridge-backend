const express =
  require("express");

const router =
  express.Router();

const User =
  require("../models/User");

const Company =
  require("../models/Company");

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

      if (user.companyId) {
        const company = await Company.findById(user.companyId).select(
          "subscriptionActive subscriptionPlan subscriptionExpiry"
        );

        if (company) {
          const now = new Date();
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
      }

      res.json({
        ...user.toObject(),
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

      user.companyName =
        req.body.companyName ||
        user.companyName;

      user.email =
        req.body.email ||
        user.email;

      user.phone =
        req.body.phone ||
        user.phone;

      user.website =
        req.body.website ||
        user.website;

      user.industry =
        req.body.industry ||
        user.industry;

      user.companySize =
        req.body.companySize ||
        user.companySize;

      user.location =
        req.body.location ||
        user.location;

      user.description =
        req.body.description ||
        user.description;

      user.cacNumber =
        req.body.cacNumber ||
        user.cacNumber;

      // =========================
      // HANDLE FILE UPLOAD
      // =========================

if (
  req.files?.verificationDocuments
) {

console.log(
  "CURRENT DOCS:",
  user.verificationDocuments
);

console.log(
  "NEW DOCS:",
  req.files.verificationDocuments.map(
    file => file.location
  )
);

const newDocs =
  req.files.verificationDocuments.map(
    (file) => file.location
  );

user.verificationDocuments = [
  ...(user.verificationDocuments || []),
  ...newDocs,
];
  user.isCompanyVerified =
    false;

}
if (
  req.files?.profilePicture?.[0]
) {

  user.profilePicture =
    req.files
      .profilePicture[0]
      .location;

}

      const profileUpdateFields = {
        companyName: user.companyName,
        email: user.email,
        phone: user.phone,
        website: user.website,
        industry: user.industry,
        companySize: user.companySize,
        location: user.location,
        description: user.description,
        cacNumber: user.cacNumber,
        verificationDocuments: user.verificationDocuments,
        isCompanyVerified: user.isCompanyVerified,
        profilePicture: user.profilePicture,
      };
      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        profileUpdateFields,
        { new: true, runValidators: false }
      );

      res.json({

        message:
          "Company profile updated successfully",

        user: updatedUser,

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

      await User.findByIdAndUpdate(
        req.user.id,
        { verificationDocuments: [], isCompanyVerified: false },
        { runValidators: false }
      );

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
        { verificationStatus: "pending", isCompanyVerified: false },
        { runValidators: false }
      );

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

module.exports =
  router;

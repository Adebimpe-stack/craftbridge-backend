const express =
  require("express");
const Company =
  require("../models/Company");

const router =
  express.Router();

const User =
  require("../models/User");

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

      res.json(user);

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

if (req.body.companyName) {

  const existingUser =
    await User.findOne({
      _id: { $ne: user._id },
      companyName: {
        $regex:
          `^${req.body.companyName.trim()}$`,
        $options: "i"
      }
    });

  if (existingUser) {
    return res.status(400).json({
      message:
        "This company already exists on CraftBridge. Request access from the company administrator."
    });
  }

}
const companyName =
  req.body.companyName?.trim();

if (
  companyName &&
  companyName !== user.companyName
) {

  const existingCompany =
    await Company.findOne({
      name: {
        $regex: `^${companyName}$`,
        $options: "i",
      },
    });

  if (existingCompany) {

    return res.status(400).json({
      message:
        "This company already exists on CraftBridge. Request access from the company administrator.",
      companyId:
        existingCompany._id,
      accessRequest: true,
    });

  }

}      
user.companyName =
        req.body.companyName ||
        user.companyName;


      user.phone =
        req.body.phone ||
        user.phone;

      user.website =
        req.body.website ||
        user.website;

user.linkedin =
  req.body.linkedinPageName ||
  user.linkedin;

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

      await user.save();

      res.json({

        message:
          "Company profile updated successfully",

        user,

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
  "/company-profile/document/:index",
  protect,
  async (req, res) => {

    try {

      const user =
        await User.findById(req.user.id);

      const index =
        Number(req.params.index);

      if (
        isNaN(index) ||
        index < 0 ||
        index >= user.verificationDocuments.length
      ) {
        return res.status(400).json({
          message: "Invalid document",
        });
      }

      user.verificationDocuments.splice(
        index,
        1
      );

      await user.save();

      res.json({
        message:
          "Document deleted successfully",
      });

    } catch (err) {

      console.log(err);

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

      user.profilePicture = "";

      await user.save();

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

if (status === "verified") {

  user.isCompanyVerified = true;
  user.verificationStatus = "verified";
  user.accountStatus = "active";

  user.rejectionReason = "";
  user.suspensionReason = "";

} else if (status === "rejected") {

  user.isCompanyVerified = false;
  user.verificationStatus = "rejected";
  user.accountStatus = "active";

  user.rejectionReason = reason || "";

} else if (status === "suspended") {

  user.accountStatus = "suspended";

  user.suspensionReason = reason || "";

} else if (status === "unsuspend") {

  user.accountStatus = "active";

  user.suspensionReason = "";

} else {

  user.isCompanyVerified = false;
  user.verificationStatus = "pending";
  user.accountStatus = "active";

}

await user.save();
      res.json({
        message: `Employer ${status} successfully`,
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
// PUBLIC COMPANY PROFILE
// ==============================

router.get(
  "/company/:id",
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select("-password");

      if (!user) {
        return res.status(404).json({
          message: "Company not found",
        });
      }

      const company = await Company.findById(user.companyId);

      if (!company) {
        return res.status(404).json({
          message: "Company not found",
        });
      }

      const Job = require("../models/Job");

      const jobs = await Job.find({
        companyId: company._id,
      });

      res.json({
        company: {
          ...company.toObject(),
          email: user.email,
          location: user.location,
          description: user.description,
          profilePicture: user.profilePicture,
          verificationStatus: user.verificationStatus,
        },
        jobs,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Server error",
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

      user.verificationStatus =
        "pending";

      user.isCompanyVerified =
        false;

      await user.save();

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
module.exports =
  router;

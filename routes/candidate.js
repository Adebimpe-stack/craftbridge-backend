const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

const Job = require("../models/Job");
const User = require("../models/User");

const Application =
  require("../models/Application");

// GET ALL JOBS APPLIED BY USER

router.get(
  "/applications",
  auth,
  async (req, res) => {
    try {

      const applications =
        await Application.find({
          applicant: req.user._id,
        })
        .populate("job")
        .sort({
          createdAt: -1,
        });

      const result =
        applications.map(app => ({
          _id: app._id,
          title: app.job?.title,
          location: app.job?.location,
          description: app.job?.description,
          status: app.status,
        }));

      res.json(result);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }
  }
);

// GET CANDIDATE PROFILE
router.get("/profile", auth, async (req, res) => {
try {
const user = await User.findById(
req.user.id
).select("-password");

if (!user) {
  return res.status(404).json({
    message: "User not found",
  });
}

res.json(user);

} catch (err) {
res.status(500).json({
message: err.message,
});
}
});

// UPDATE CANDIDATE PROFILE
router.post(
"/profile",
auth,
upload.single("profilePicture"),
async (req, res) => {
try {
const user = await User.findById(
req.user.id
);


  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  user.headline =
    req.body.headline || user.headline;

  user.location =
    req.body.location || user.location;

  user.experienceYears =
    req.body.experienceYears ||
    user.experienceYears;

  user.bio =
    req.body.bio || user.bio;

  user.availability =
    req.body.availability ||
    user.availability;

  user.skills = req.body.skills
    ? req.body.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : user.skills;

  user.certifications =
    req.body.certifications
      ? req.body.certifications
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : user.certifications;

  if (req.file) {
    user.profilePicture =
      req.file.location;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    {
      headline: user.headline,
      location: user.location,
      experienceYears: user.experienceYears,
      bio: user.bio,
      availability: user.availability,
      skills: user.skills,
      certifications: user.certifications,
      profilePicture: user.profilePicture,
    },
    { returnDocument: "after", runValidators: false }
  );

  res.json({
    message: "Profile updated",
    user: updatedUser,
  });
} catch (err) {
  res.status(500).json({
    message: err.message,
  });
}


}
);


router.post("/resume-parsed", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    await User.findByIdAndUpdate(
      req.user.id,
      { resumeText: req.body.rawText, resumeData: req.body.parsedData },
      { runValidators: false }
    );

    res.json({
      message: "Resume saved successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.post(
  "/resume",
  auth,
  upload.single("resume"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "No resume uploaded",
        });
      }

      const resumeUrl = req.file.location;
      await User.findByIdAndUpdate(
        req.user.id,
        { resumeUrl },
        { runValidators: false }
      );

      res.json({
        message: "Resume uploaded successfully",
        resumeUrl,
      });
    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);
router.delete(
  "/resume",
  auth,
  async (req, res) => {
    try {
      const user = await User.findById(
        req.user.id
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      await User.findByIdAndUpdate(
        req.user.id,
        { resumeUrl: "" },
        { runValidators: false }
      );

      res.json({
        message: "Resume removed",
      });

    } catch (err) {
      res.status(500).json({
        message: err.message,
      });
    }
  }
);
// =========================
// SUBMIT WORKER VERIFICATION
// =========================
router.post(
  "/verify",
  auth,
  upload.fields([
    { name: "workerVerificationDocuments", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role !== "jobseeker") {
        return res.status(403).json({ message: "Only workers can submit worker verification" });
      }

      const newDocs = (req.files?.workerVerificationDocuments || []).map(
        (file) => file.location
      );

      if (newDocs.length === 0) {
        return res.status(400).json({ message: "Upload at least one verification document" });
      }

      const updatedDocs = [
        ...(user.workerVerificationDocuments || []),
        ...newDocs,
      ];

      await User.findByIdAndUpdate(
        req.user.id,
        {
          workerVerificationDocuments: updatedDocs,
          workerVerificationStatus: "pending",
          workerRejectionReason: "",
        },
        { runValidators: false }
      );

      res.json({ message: "Verification submitted for review" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// =========================
// GET PROFESSIONALS DIRECTORY
// Only verified workers are publicly visible
// =========================
router.get("/directory", async (req, res) => {
  try {
    const professionals = await User.find({
      role: "jobseeker",
      workerVerificationStatus: "verified",
      accountStatus: { $nin: ["suspended", "deactivated"] },
    })
      .select("-password -emailVerificationToken -resetPasswordToken")
      .sort({ createdAt: -1 });

    res.json(professionals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

const Job = require("../models/Job");
const User = require("../models/User");

// GET ALL JOBS APPLIED BY USER
router.get("/applications", auth, async (req, res) => {
try {
const jobs = await Job.find({
"applicants.userId": req.user.id,
});


const applications = jobs.map((job) => {
  const myApp = job.applicants.find(
    (a) => a.userId.toString() === req.user.id
  );

  return {
    jobId: job._id,
    title: job.title,
    location: job.location,
    description: job.description,
    status: myApp?.status || "pending",
  };
});

res.json(applications);


} catch (err) {
res.status(500).json({
message: err.message,
});
}
});

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

  await user.save();

  res.json({
    message: "Profile updated",
    user,
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

    user.resumeText = req.body.rawText;
    user.resumeData = req.body.parsedData;

    await user.save();

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

      user.resumeUrl = req.file.location;

      await user.save();

      res.json({
        message: "Resume uploaded successfully",
        resumeUrl: user.resumeUrl,
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

      user.resumeUrl = "";

      await user.save();

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
module.exports = router;

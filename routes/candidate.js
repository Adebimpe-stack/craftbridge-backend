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
upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "portfolioImages", maxCount: 10 }, // Allow up to 10 portfolio images
]),
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

  // Update new professional profile fields
  user.professionalSummary = req.body.professionalSummary || user.professionalSummary;
  user.primaryTrade = req.body.primaryTrade || user.primaryTrade;
  user.serviceDescription = req.body.serviceDescription || user.serviceDescription;
  user.emergencyService = req.body.emergencyService !== undefined ? req.body.emergencyService : user.emergencyService;
  user.startingPrice = req.body.startingPrice || user.startingPrice;
  user.phoneVisibility = req.body.phoneVisibility || user.phoneVisibility;
  
  if (req.body.availabilityFor) {
    user.availabilityFor = req.body.availabilityFor.split(',').map(s => s.trim()).filter(Boolean);
  }

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
    // This is for backward compatibility if only one file is sent
    user.profilePicture =
      req.file.location;
  }

  if (req.files) {
    if (req.files.profilePicture) {
      user.profilePicture = req.files.profilePicture[0].location;
    }
    if (req.files.portfolioImages) {
      const newPortfolioItems = req.files.portfolioImages.map((file, index) => {
        const portfolioData = req.body.portfolioData ? JSON.parse(req.body.portfolioData) : [];
        const itemData = portfolioData[index] || {};
        return { 
          url: file.location, 
          type: 'image',
          ...itemData
        };
      });
      user.portfolio.push(...newPortfolioItems);
    }
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

// DELETE PORTFOLIO ITEM
router.delete("/portfolio/:itemId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const itemId = req.params.itemId;

    // Find the item to be removed to potentially delete from S3 later
    const itemToRemove = user.portfolio.id(itemId);
    if (!itemToRemove) {
      return res.status(404).json({ message: "Portfolio item not found." });
    }

    // TODO: Add logic here to delete itemToRemove.url from S3 bucket

    // Pull the subdocument from the array
    user.portfolio.pull(itemId);

    await user.save();

    res.json({
      message: "Portfolio item removed successfully",
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

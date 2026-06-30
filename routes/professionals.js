const express = require("express");
const router = express.Router();

const User = require("../models/User");

// GET ALL PUBLIC PROFESSIONALS
router.get("/", async (req, res) => {
  try {
    const {
      search,
      trade,
      location,
      verified,
      emergency,
      page = 1,
      limit = 12,
    } = req.query;

    const query = {
      role: "jobseeker",
    };

    // Only show professionals with a trade selected
    query.primaryTrade = { $exists: true, $ne: "" };

    if (trade) {
      query.primaryTrade = trade;
    }

    if (location) {
      query.location = {
        $regex: location,
        $options: "i",
      };
    }

    if (verified === "true") {
      query.workerVerificationStatus = "verified";
    }

    if (emergency === "true") {
      query.emergencyService = true;
    }

    if (search) {
      query.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          primaryTrade: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }


    const professionals = await User.find(query)
      .select(
  "name \
  headline \
  primaryTrade \
  professionalSummary \
  location \
  profilePicture \
  experienceYears \
  workerVerificationStatus \
  emergencyService \
  profileVisibility \
  serviceLocations"
)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));


    const total = await User.countDocuments(query);

    res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      professionals,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Server error",
    });

  }
});

// GET SINGLE PROFESSIONAL
router.get("/:id", async (req, res) => {
  try {
    const professional = await User.findOne({
      _id: req.params.id,
      role: "jobseeker",
    }).select(
      "name \
headline \
primaryTrade \
professionalSummary \
serviceDescription \
location \
profilePicture \
experienceYears \
skills \
certifications \
languages \
serviceLocations \
workerVerificationStatus \
emergencyService \
portfolio \
bio"
    );

    if (!professional) {
      return res.status(404).json({
        message: "Professional not found",
      });
    }

    res.json(professional);

  } catch (err) {

    res.status(500).json({
      message: "Server error",
    });

  }
});
module.exports = router;

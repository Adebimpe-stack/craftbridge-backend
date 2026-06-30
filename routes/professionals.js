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

console.log("Professional query:", query);

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

console.log("Found:", professionals.length);
console.log(professionals);

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

module.exports = router;

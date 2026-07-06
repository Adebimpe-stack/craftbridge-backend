const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ServiceRequest = require("../models/ServiceRequest");

const LIST_FIELDS = "_id name profilePicture primaryTrade location city state country workerVerificationStatus";
const PUBLIC_FIELDS =
  "-password -emailVerificationToken -resetPasswordToken";

// =========================
// GET ALL PROFESSIONALS
// GET /api/professionals
// =========================
router.get("/", async (req, res) => {
  try {
    const professionals = await User.find({
      role: "jobseeker",
      accountStatus: { $nin: ["suspended", "deactivated"] },
      $or: [
        { workerVerificationStatus: "verified" },
        { workerVerificationStatus: { $in: [null, "", "none"] }, isVerified: true },
      ],
    })
      .select(LIST_FIELDS)
      .sort({ createdAt: -1 });

    res.json({ professionals });
  } catch (err) {
    console.error("PROFESSIONALS LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET SINGLE PROFESSIONAL
// GET /api/professionals/:id
// Contact info is only shown if the logged-in client has an accepted request
// =========================
router.get("/:id", async (req, res) => {
  try {
    const professional = await User.findById(req.params.id).select(
      PUBLIC_FIELDS
    );

    if (!professional) {
      return res.status(404).json({ message: "Professional not found" });
    }

    if (professional.role !== "jobseeker") {
      return res.status(404).json({ message: "Professional not found" });
    }

    const isVisible =
      professional.workerVerificationStatus === "verified" ||
      (!professional.workerVerificationStatus && professional.isVerified) ||
      (["none", ""].includes(professional.workerVerificationStatus) && professional.isVerified);

    if (!isVisible || ["suspended", "deactivated"].includes(professional.accountStatus)) {
      return res.status(404).json({ message: "Professional not found" });
    }

    const result = professional.toObject();

    let showContact = false;
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clientId = decoded.user?.id || decoded.id;

        const acceptedRequest = await ServiceRequest.findOne({
          professional: req.params.id,
          client: clientId,
          status: "accepted",
        });

        if (acceptedRequest) {
          showContact = true;
        }
      } catch (e) {
        // token invalid — keep showContact false
      }
    }

    if (!showContact) {
      delete result.phone;
      delete result.email;
      delete result.companyEmail;
    }

    res.json(result);
  } catch (err) {
    console.error("PROFESSIONAL DETAIL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

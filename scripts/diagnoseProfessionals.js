// Diagnostic script: report where professionals are being dropped.
// Run on the VPS with: node scripts/diagnoseProfessionals.js

const mongoose = require("mongoose");
const User = require("../models/User");
const {
  isPubliclyEligible,
  getPublicDirectoryIneligibilityReasons,
} = require("../utils/professionalRanking");

require("dotenv").config();

const CANDIDATE_ROLES = ["jobseeker", "user", "customer"];

const hasProfessionalFields = {
  $or: [
    { primaryTrade: { $exists: true, $nin: ["", null] } },
    { skills: { $exists: true, $not: { $size: 0 } } },
    { availability: { $exists: true, $nin: ["", null] } },
  ],
};

const currentPublicMatch = {
  role: { $in: CANDIDATE_ROLES },
  accountStatus: { $nin: ["suspended", "deactivated"] },
  workerVerificationStatus: { $nin: ["rejected"] },
};

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/craftbridge");
    console.log("Connected to MongoDB\n");

    const totalCandidates = await User.countDocuments({ role: { $in: CANDIDATE_ROLES } });
    console.log(`Total candidate accounts (role in ${JSON.stringify(CANDIDATE_ROLES)}): ${totalCandidates}`);

    const withRequiredFields = await User.countDocuments({
      role: { $in: CANDIDATE_ROLES },
      name: { $exists: true, $nin: ["", null] },
      primaryTrade: { $exists: true, $nin: ["", null] },
      availability: { $exists: true, $nin: ["", null] },
      $or: [
        { city: { $exists: true, $nin: ["", null] } },
        { country: { $exists: true, $nin: ["", null] } },
        { location: { $exists: true, $nin: ["", null] } },
      ],
    });
    console.log(`With required public directory fields (name, trade, availability, location): ${withRequiredFields}`);

    const publicMatchCount = await User.countDocuments(currentPublicMatch);
    console.log(`Matching current /api/professionals backend filters: ${publicMatchCount}`);

    const users = await User.find({ role: { $in: CANDIDATE_ROLES } })
      .select("name role accountStatus workerVerificationStatus primaryTrade availability city country location skills")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`\nPer-account report (${users.length} accounts):\n`);
    console.log("Name | Role | Account Status | Worker Verification | Included by backend? | Reason(s) if excluded");
    console.log("-".repeat(120));

    for (const u of users) {
      const eligible = isPubliclyEligible(u);
      const reasons = getPublicDirectoryIneligibilityReasons(u);
      const blockedByStatus = ["suspended", "deactivated"].includes(u.accountStatus);
      const rejected = u.workerVerificationStatus === "rejected";

      let backendReason = "Yes";
      if (rejected) backendReason = "No - worker verification rejected";
      else if (blockedByStatus) backendReason = `No - account status is ${u.accountStatus}`;

      const displayName = u.name || "(no name)";
      const displayRole = u.role || "(none)";
      const displayAccount = u.accountStatus || "(missing)";
      const displayVerification = u.workerVerificationStatus || "(missing)";

      let line = `${displayName} | ${displayRole} | ${displayAccount} | ${displayVerification} | ${backendReason}`;
      if (backendReason === "Yes" && !eligible) {
        line += ` | Missing required fields: ${reasons.join(", ")}`;
      } else if (backendReason === "Yes") {
        line += " | Included (meets required fields)";
      }
      console.log(line);
    }

    console.log("\nDiagnostic complete.");
    process.exit(0);
  } catch (error) {
    console.error("Diagnostic error:", error);
    process.exit(1);
  }
}

diagnose();

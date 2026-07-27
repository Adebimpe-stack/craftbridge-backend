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
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
    });
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
    console.log(`With required public directory fields (old strict rule - name, trade, availability, location): ${withRequiredFields}`);

    const publicMatchCount = await User.countDocuments(currentPublicMatch);
    console.log(`Matching current backend STATUS-ONLY filters (role + not suspended/deactivated/rejected): ${publicMatchCount}`);
    console.log(`\nNote: The difference between ${withRequiredFields} and ${publicMatchCount} is intentional. The new code no longer requires all public-directory fields, so accounts missing trade or location can still appear.\n`);

    const users = await User.find({ role: { $in: CANDIDATE_ROLES } })
      .select("name role accountStatus workerVerificationStatus primaryTrade availability city country location skills")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`\nPer-account report (${users.length} accounts):\n`);
    console.log("Name | Role | Account Status | Worker Verification | Blocked by status? | Would appear under new backend filters | Notes");
    console.log("-".repeat(140));

    for (const u of users) {
      const eligible = isPubliclyEligible(u);
      const reasons = getPublicDirectoryIneligibilityReasons(u);
      const blockedByStatus = ["suspended", "deactivated"].includes(u.accountStatus);
      const rejected = u.workerVerificationStatus === "rejected";

      let statusBlock = "No";
      if (rejected) statusBlock = "Yes - worker verification rejected";
      else if (blockedByStatus) statusBlock = `Yes - account status is ${u.accountStatus}`;

      const wouldAppear = !rejected && !blockedByStatus ? "Yes" : "No";

      const displayName = u.name || "(no name)";
      const displayRole = u.role || "(none)";
      const displayAccount = u.accountStatus || "(missing)";
      const displayVerification = u.workerVerificationStatus || "(missing)";

      let notes = "";
      if (wouldAppear === "Yes" && !eligible) {
        notes = `Visible despite missing fields: ${reasons.join(", ")}`;
      } else if (wouldAppear === "Yes") {
        notes = "Meets all required fields";
      }

      console.log(`${displayName} | ${displayRole} | ${displayAccount} | ${displayVerification} | ${statusBlock} | ${wouldAppear} | ${notes}`);
    }

    console.log("\nDiagnostic complete.");
    process.exit(0);
  } catch (error) {
    console.error("Diagnostic error:", error);
    process.exit(1);
  }
}

diagnose();

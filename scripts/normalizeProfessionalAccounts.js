// Migration Script: Normalize existing professional accounts for the new public directory rules
// - Sets missing accountStatus to "active"
// - Sets missing workerVerificationStatus to "none"
// - Converts legacy role "user" accounts with professional fields to "jobseeker"
// Run once on the VPS with: node scripts/normalizeProfessionalAccounts.js

const mongoose = require("mongoose");
const User = require("../models/User");

require("dotenv").config();

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/craftbridge");
    console.log("Connected to MongoDB");

    const statusResult = await User.updateMany(
      { role: { $in: ["jobseeker", "user"] }, $or: [{ accountStatus: { $exists: false } }, { accountStatus: null }, { accountStatus: "" }] },
      { $set: { accountStatus: "active" } }
    );
    console.log(`Updated ${statusResult.modifiedCount} accounts with missing accountStatus to active`);

    const verificationResult = await User.updateMany(
      { role: { $in: ["jobseeker", "user"] }, $or: [{ workerVerificationStatus: { $exists: false } }, { workerVerificationStatus: null }, { workerVerificationStatus: "" }] },
      { $set: { workerVerificationStatus: "none" } }
    );
    console.log(`Updated ${verificationResult.modifiedCount} worker accounts with missing workerVerificationStatus to none`);

    const roleResult = await User.updateMany(
      {
        role: "user",
        $or: [
          { primaryTrade: { $exists: true, $nin: ["", null] } },
          { skills: { $exists: true, $not: { $size: 0 } } },
          { availability: { $exists: true, $nin: ["", null] } },
        ],
      },
      { $set: { role: "jobseeker" } }
    );
    console.log(`Converted ${roleResult.modifiedCount} legacy user accounts with professional fields to jobseeker`);

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();

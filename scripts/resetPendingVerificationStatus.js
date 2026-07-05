// Migration Script: Reset pending verification status to none for existing accounts
// This unlocks accounts that were created while the old default was "pending".
// Accounts that were genuinely submitted for approval will also be reset,
// so only run this if you intend to let employers re-submit.

const mongoose = require("mongoose");
const User = require("../models/User");
const Company = require("../models/Company");

require("dotenv").config();

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/craftbridge");
    console.log("Connected to MongoDB");

    const userResult = await User.updateMany(
      { role: "employer", verificationStatus: "pending" },
      { $set: { verificationStatus: "none", isCompanyVerified: false } }
    );
    console.log(`Updated ${userResult.modifiedCount} employer users from pending to none`);

    const companyResult = await Company.updateMany(
      { verificationStatus: "pending" },
      { $set: { verificationStatus: "none" } }
    );
    console.log(`Updated ${companyResult.modifiedCount} companies from pending to none`);

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();

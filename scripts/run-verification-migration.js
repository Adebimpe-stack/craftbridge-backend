#!/usr/bin/env node

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const Company = require("../models/Company");

const allowedWvs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
const allowedVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
const allowedCompanyVs = ["none", "pending", "verified", "rejected", "revoked", "info_requested"];
const allowedCompanySizes = ["1-10", "11-50", "51-200", "201-500", "500+"];

async function audit() {
  const invalidWorkerStatus = await User.find({
    role: "jobseeker",
    workerVerificationStatus: { $nin: allowedWvs },
  }).select("_id name email workerVerificationStatus");

  const invalidUserVerificationStatus = await User.find({
    verificationStatus: { $nin: allowedVs },
  }).select("_id name email role verificationStatus");

  const invalidCompanyStatus = await Company.find({
    verificationStatus: { $nin: allowedCompanyVs },
  }).select("_id name owner verificationStatus");

  const invalidCompanySizes = await Company.find({
    companySize: { $nin: allowedCompanySizes },
  }).select("_id name owner companySize");

  return {
    workerVerificationStatus: {
      count: invalidWorkerStatus.length,
      documents: invalidWorkerStatus,
    },
    userVerificationStatus: {
      count: invalidUserVerificationStatus.length,
      documents: invalidUserVerificationStatus,
    },
    companyVerificationStatus: {
      count: invalidCompanyStatus.length,
      documents: invalidCompanyStatus,
    },
    companySize: {
      count: invalidCompanySizes.length,
      documents: invalidCompanySizes,
    },
  };
}

async function migrate() {
  const wvsResult = await User.updateMany(
    { workerVerificationStatus: { $nin: allowedWvs } },
    { $set: { workerVerificationStatus: "none" } }
  );

  const vsResult = await User.updateMany(
    { verificationStatus: { $nin: allowedVs } },
    { $set: { verificationStatus: "pending" } }
  );

  const companyResult = await Company.updateMany(
    { verificationStatus: { $nin: allowedCompanyVs } },
    { $set: { verificationStatus: "pending" } }
  );

  const userApprovedResult = await User.updateMany(
    { verificationStatus: "verified", documentsApproved: { $ne: true } },
    { $set: { documentsApproved: true } }
  );

  const userNotApprovedResult = await User.updateMany(
    { verificationStatus: { $ne: "verified" }, documentsApproved: { $ne: false } },
    { $set: { documentsApproved: false } }
  );

  const companyApprovedResult = await Company.updateMany(
    { verificationStatus: "verified", documentsApproved: { $ne: true } },
    { $set: { documentsApproved: true } }
  );

  const companyNotApprovedResult = await Company.updateMany(
    { verificationStatus: { $ne: "verified" }, documentsApproved: { $ne: false } },
    { $set: { documentsApproved: false } }
  );

  const companySizeResult = await Company.updateMany(
    { companySize: { $nin: allowedCompanySizes } },
    { $set: { companySize: "" } },
    { runValidators: false }
  );

  return {
    workerVerificationStatusFixed: wvsResult.modifiedCount,
    userVerificationStatusFixed: vsResult.modifiedCount,
    companyVerificationStatusFixed: companyResult.modifiedCount,
    documentsApprovedBackfill: {
      usersApproved: userApprovedResult.modifiedCount,
      usersNotApproved: userNotApprovedResult.modifiedCount,
      companiesApproved: companyApprovedResult.modifiedCount,
      companiesNotApproved: companyNotApprovedResult.modifiedCount,
    },
    companySizeFixed: companySizeResult.modifiedCount,
  };
}

async function run() {
  const args = process.argv.slice(2);
  const auditOnly = args.includes("--audit");
  const migrateOnly = args.includes("--migrate");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log("Usage:");
    console.log("  node scripts/run-verification-migration.js --audit    Run audit only");
    console.log("  node scripts/run-verification-migration.js --migrate   Run migration only");
    console.log("  node scripts/run-verification-migration.js --audit --migrate  Audit then migrate");
    process.exit(0);
  }

  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI is not set. Ensure .env exists in the backend root.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  try {
    if (auditOnly || (!auditOnly && !migrateOnly)) {
      const results = await audit();
      console.log("\n=== VERIFICATION STATUS AUDIT ===");
      console.log(`Invalid workerVerificationStatus: ${results.workerVerificationStatus.count}`);
      if (results.workerVerificationStatus.count > 0) {
        console.log(results.workerVerificationStatus.documents);
      }
      console.log(`Invalid user verificationStatus: ${results.userVerificationStatus.count}`);
      if (results.userVerificationStatus.count > 0) {
        console.log(results.userVerificationStatus.documents);
      }
      console.log(`Invalid company verificationStatus: ${results.companyVerificationStatus.count}`);
      if (results.companyVerificationStatus.count > 0) {
        console.log(results.companyVerificationStatus.documents);
      }
      console.log(`Invalid companySize: ${results.companySize.count}`);
      if (results.companySize.count > 0) {
        console.log(results.companySize.documents);
      }
    }

    if (migrateOnly || (!auditOnly && !migrateOnly)) {
      const results = await migrate();
      console.log("\n=== MIGRATION RESULTS ===");
      console.log(`workerVerificationStatus fixed: ${results.workerVerificationStatusFixed}`);
      console.log(`user verificationStatus fixed: ${results.userVerificationStatusFixed}`);
      console.log(`company verificationStatus fixed: ${results.companyVerificationStatusFixed}`);
      console.log(`companySize fixed: ${results.companySizeFixed}`);
    }

    if (auditOnly && migrateOnly) {
      const postResults = await audit();
      console.log("\n=== POST-MIGRATION AUDIT ===");
      console.log(`Remaining invalid workerVerificationStatus: ${postResults.workerVerificationStatus.count}`);
      console.log(`Remaining invalid user verificationStatus: ${postResults.userVerificationStatus.count}`);
      console.log(`Remaining invalid company verificationStatus: ${postResults.companyVerificationStatus.count}`);
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  }
}

run();

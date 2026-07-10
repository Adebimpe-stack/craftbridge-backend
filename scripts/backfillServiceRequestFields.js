// Migration: Backfill ServiceRequest fields for existing accounts
// - Sets companyId from the client's companyId where missing
// - Sets acceptedAt from updatedAt for accepted/completed requests where missing
//
// Run with: node scripts/backfillServiceRequestFields.js

const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");
const User = require("../models/User");

require("dotenv").config();

const migrate = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/craftbridge"
    );
    console.log("Connected to MongoDB");

    // Backfill companyId from client when missing
    const requestsMissingCompany = await ServiceRequest.find({
      companyId: { $in: [null, undefined] },
    }).populate("client", "companyId");

    let companyIdUpdated = 0;
    let companyIdSkipped = 0;

    for (const req of requestsMissingCompany) {
      const clientCompanyId = req.client?.companyId;
      if (clientCompanyId) {
        req.companyId = clientCompanyId;
        await req.save();
        companyIdUpdated++;
      } else {
        companyIdSkipped++;
      }
    }

    // Backfill acceptedAt for accepted/completed requests when missing
    const requestsMissingAcceptedAt = await ServiceRequest.find({
      status: { $in: ["accepted", "completed"] },
      acceptedAt: { $in: [null, undefined] },
    });

    let acceptedAtUpdated = 0;

    for (const req of requestsMissingAcceptedAt) {
      req.acceptedAt = req.updatedAt || req.createdAt;
      await req.save();
      acceptedAtUpdated++;
    }

    console.log("\n=== Migration Summary ===");
    console.log(`companyId missing requests scanned: ${requestsMissingCompany.length}`);
    console.log(`companyId set from client:          ${companyIdUpdated}`);
    console.log(`companyId skipped (client has none): ${companyIdSkipped}`);
    console.log(`acceptedAt set:                     ${acceptedAtUpdated}`);
    console.log("Migration completed successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();

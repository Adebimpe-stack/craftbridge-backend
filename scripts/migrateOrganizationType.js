// Migration: Backfill Company.organizationType from legacy Company.companyType
// This is reversible: companyType is left untouched and organizationType can be unset.
// Idempotent: records that already have organizationType are skipped.
// Usage:
//   node scripts/migrateOrganizationType.js --dry-run
//   node scripts/migrateOrganizationType.js

require("dotenv").config();
const mongoose = require("mongoose");
const Company = require("../models/Company");

const migrate = async () => {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("⚡ DRY RUN: no documents will be saved\n");
  }

  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/craftbridge"
    );
    console.log("Connected to MongoDB");

    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies to evaluate`);

    const counts = {
      service_business: 0,
      employer: 0,
      recruitment_agency: 0,
      skipped: 0,
    };

    for (const company of companies) {
      // Skip if already migrated
      if (company.organizationType) {
        counts.skipped++;
        continue;
      }

      let organizationType = "service_business";

      if (company.companyType === "agency") {
        organizationType = "recruitment_agency";
      } else if (company.companyType === "employer" || !company.companyType) {
        organizationType = "service_business";
      }

      company.organizationType = organizationType;
      counts[organizationType]++;

      if (!dryRun) {
        await company.save({ validateBeforeSave: false });
      }

      console.log(
        `${dryRun ? "  [DRY RUN] Would update" : "  Updated"} ${
          company.name || company._id
        }: companyType=${company.companyType || "(none)"} -> organizationType=${organizationType}`
      );
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total companies: ${companies.length}`);
    console.log(`service_business: ${counts.service_business}`);
    console.log(`employer: ${counts.employer}`);
    console.log(`recruitment_agency: ${counts.recruitment_agency}`);
    console.log(`Already set / skipped: ${counts.skipped}`);
    console.log(dryRun ? "Dry run completed" : "Migration completed successfully");

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();

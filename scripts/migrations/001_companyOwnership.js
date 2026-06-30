// Migration Script: Migrate existing employer jobs to company ownership
// This script migrates jobs from user ownership (createdBy) to company ownership (companyId)
// It also creates Company records for employers that don't have one

const mongoose = require("mongoose");
const User = require("../models/User");
const Company = require("../models/Company");
const Job = require("../models/Job");

require("dotenv").config();

const migrate = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/craftbridge");
    console.log("Connected to MongoDB");

    // Find all employers
    const employers = await User.find({ role: "employer" });
    console.log(`Found ${employers.length} employers`);

    let migratedJobs = 0;
    let skippedJobs = 0;
    let companiesCreated = 0;
    let employersSkipped = 0;

    for (const employer of employers) {
      // Check if employer has a companyId
      if (!employer.companyId) {
        console.log(`Employer ${employer.email} has no companyId, creating Company record...`);

        // Create Company record using employer's companyName
        const companyName = employer.companyName || employer.name + "'s Company";
        
        const company = await Company.create({
          name: companyName,
          owner: employer._id,
          teamMembers: [employer._id],
          createdBy: employer._id,
          description: employer.description || "",
          industry: employer.industry || "",
          companySize: employer.companySize || "1-10",
          location: employer.location || "",
          cacNumber: employer.cacNumber || "",
          website: employer.website || "",
          logo: employer.profilePicture || "",
          verificationStatus: employer.verificationStatus || "pending",
          verificationDocuments: employer.verificationDocuments || [],
          rejectionReason: employer.rejectionReason || "",
        });

        console.log(`  Created Company: ${company.name} (ID: ${company._id})`);

        // Update employer with companyId and companyRole
        employer.companyId = company._id;
        employer.companyRole = "owner";
        await employer.save();
        
        console.log(`  Updated employer ${employer.email} with companyId and companyRole`);
        companiesCreated++;
      }

      // Find all jobs created by this employer
      const jobs = await Job.find({ createdBy: employer._id });
      console.log(`Found ${jobs.length} jobs for employer ${employer.email}`);

      if (jobs.length === 0) {
        console.log(`  No jobs to migrate for this employer`);
        employersSkipped++;
        continue;
      }

      // Update each job to use companyId
      for (const job of jobs) {
        if (!job.companyId) {
          job.companyId = employer.companyId;
          await job.save();
          migratedJobs++;
          console.log(`  Migrated job: ${job.title}`);
        } else {
          skippedJobs++;
          console.log(`  Skipped job (already has companyId): ${job.title}`);
        }
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total employers processed: ${employers.length}`);
    console.log(`Companies created: ${companiesCreated}`);
    console.log(`Employers with no jobs: ${employersSkipped}`);
    console.log(`Jobs migrated: ${migratedJobs}`);
    console.log(`Jobs skipped (already had companyId): ${skippedJobs}`);
    console.log("Migration completed successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();

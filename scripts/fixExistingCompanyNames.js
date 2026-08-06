const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User");
const Company = require("../models/Company");

async function fixExistingCompanyNames() {
  try {
    console.log("Starting migration to fix existing company names...");

    // Connect to MongoDB - use command line arg or env var
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("MongoDB URI not provided. Usage: node scripts/fixExistingCompanyNames.js <mongodb-uri>");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    // 1. Fix company records that might have incorrect names
    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies to check`);

    let companiesUpdated = 0;

    for (const company of companies) {
      const updates = {};

      // If company name is missing or generic, try to get a better name
      if (!company.name || company.name === "Unnamed Company" || company.name.trim() === "") {
        if (company.owner) {
          const owner = await User.findById(company.owner);
          if (owner) {
            // Try to use companyName field from user, or fallback to name but with business suffix
            if (owner.companyName && owner.companyName.trim() !== "") {
              updates.name = owner.companyName;
            } else if (owner.name) {
              updates.name = `${owner.name}'s Business`;
            }
          }
        }
      }

      // Ensure company has proper organization type
      if (!company.organizationType) {
        updates.organizationType = "service_business";
      }

      // Sync logo from owner if missing
      if (!company.logo && company.owner) {
        const owner = await User.findById(company.owner);
        if (owner && owner.profilePicture) {
          updates.logo = owner.profilePicture;
        }
      }

      if (Object.keys(updates).length > 0) {
        await Company.findByIdAndUpdate(company._id, updates, { runValidators: false });
        companiesUpdated++;
        console.log(`Updated company ${company._id}:`, updates);
      }
    }

    console.log(`Updated ${companiesUpdated} companies`);

    // 2. Sync User records with their Company records
    const users = await User.find({ role: "employer" });
    console.log(`Found ${users.length} employer users to sync`);

    let usersUpdated = 0;

    for (const user of users) {
      const updates = {};
      const company = user.companyId 
        ? await Company.findById(user.companyId)
        : await Company.findOne({ owner: user._id });

      if (company) {
        // Sync user's companyId if missing
        if (!user.companyId) {
          updates.companyId = company._id;
        }

        // Sync profile picture from company if user has none
        if (!user.profilePicture && company.logo) {
          updates.profilePicture = company.logo;
          updates.profileImage = company.logo;
        }

        // Don't sync company name to user name - that was the problem
        // User name should remain personal, company name should be business
      }

      if (Object.keys(updates).length > 0) {
        await User.findByIdAndUpdate(user._id, updates, { runValidators: false });
        usersUpdated++;
        console.log(`Updated user ${user._id}:`, updates);
      }
    }

    console.log(`Updated ${usersUpdated} users`);

    // 3. Find and fix companies that might have duplicate owner references
    const duplicateOwnerCompanies = await Company.aggregate([
      {
        $group: {
          _id: "$owner",
          count: { $sum: 1 },
          companies: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicateOwnerCompanies.length > 0) {
      console.log(`Found ${duplicateOwnerCompanies.length} owners with multiple companies`);
      
      for (const duplicate of duplicateOwnerCompanies) {
        const ownerId = duplicate._id;
        const companyIds = duplicate.companies;
        
        // Keep the most recent company, deactivate others
        const companies = await Company.find({ _id: { $in: companyIds } }).sort({ createdAt: -1 });
        
        if (companies.length > 1) {
          const toKeep = companies[0];
          const toDeactivate = companies.slice(1);
          
          console.log(`Owner ${ownerId} has ${companies.length} companies. Keeping ${toKeep._id}, deactivating ${toDeactivate.map(c => c._id).join(", ")}`);
          
          for (const company of toDeactivate) {
            await Company.findByIdAndUpdate(company._id, { 
              isActive: false,
              isDeleted: true 
            }, { runValidators: false });
          }
          
          // Update user to point to the kept company
          await User.findByIdAndUpdate(ownerId, { companyId: toKeep._id }, { runValidators: false });
        }
      }
    }

    console.log("Migration completed successfully!");
    console.log(`Summary: ${companiesUpdated} companies updated, ${usersUpdated} users updated`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
fixExistingCompanyNames();
const mongoose = require("mongoose");
const { randomBytes } = require("crypto");
require("dotenv").config();

const User = require("../models/User");
const Company = require("../models/Company");

const generateUnique = async (prefix, model, field) => {
  let id;
  let exists = true;
  while (exists) {
    id = `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
    exists = await model.exists({ [field]: id });
  }
  return id;
};

async function assignUserFirmIds() {
  try {
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("MongoDB URI not provided. Usage: node scripts/assignUserFirmIds.js <mongodb-uri>");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const usersMissing = await User.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: "" },
      ],
    });
    console.log(`Found ${usersMissing.length} users without a userId`);

    let usersUpdated = 0;
    for (const user of usersMissing) {
      const userId = await generateUnique("CBP", User, "userId");
      await User.findByIdAndUpdate(user._id, { userId }, { runValidators: false });
      usersUpdated++;
      console.log(`Assigned ${userId} to user ${user._id}`);
    }

    const companiesMissing = await Company.find({
      $or: [
        { firmId: { $exists: false } },
        { firmId: null },
        { firmId: "" },
      ],
    });
    console.log(`Found ${companiesMissing.length} companies without a firmId`);

    let companiesUpdated = 0;
    for (const company of companiesMissing) {
      const firmId = await generateUnique("CBF", Company, "firmId");
      await Company.findByIdAndUpdate(company._id, { firmId }, { runValidators: false });
      companiesUpdated++;
      console.log(`Assigned ${firmId} to company ${company._id}`);
    }

    console.log("\nMigration completed successfully!");
    console.log(`Updated ${usersUpdated} users and ${companiesUpdated} companies.`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

assignUserFirmIds();

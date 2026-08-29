const { randomBytes } = require("crypto");
const User = require("../models/User");
const Company = require("../models/Company");

const generateUniqueId = async (prefix, model, field) => {
  let id;
  let exists = true;
  while (exists) {
    id = `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
    exists = await model.exists({ [field]: id });
  }
  return id;
};

async function assignMissingIds() {
  try {
    const usersMissing = await User.find({
      $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
    });
    const companiesMissing = await Company.find({
      $or: [{ firmId: { $exists: false } }, { firmId: null }, { firmId: "" }],
    });

    let usersUpdated = 0;
    for (const user of usersMissing) {
      const userId = await generateUniqueId("CBP", User, "userId");
      await User.findByIdAndUpdate(user._id, { userId }, { runValidators: false });
      usersUpdated++;
    }

    let companiesUpdated = 0;
    for (const company of companiesMissing) {
      const firmId = await generateUniqueId("CBF", Company, "firmId");
      await Company.findByIdAndUpdate(company._id, { firmId }, { runValidators: false });
      companiesUpdated++;
    }

    console.log(`ID backfill: ${usersUpdated} users, ${companiesUpdated} companies updated`);
    return { usersUpdated, companiesUpdated };
  } catch (error) {
    console.error("ID backfill failed:", error);
    return { usersUpdated: 0, companiesUpdated: 0, error: error.message };
  }
}

module.exports = assignMissingIds;

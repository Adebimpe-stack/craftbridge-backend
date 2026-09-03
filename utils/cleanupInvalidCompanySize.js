const Company = require("../models/Company");

const ALLOWED_COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

// Existing records were stored with companySize: "" (or another out-of-enum
// value), which makes every later save of that company fail validation.
async function cleanupInvalidCompanySize() {
  try {
    const result = await Company.updateMany(
      { companySize: { $nin: [...ALLOWED_COMPANY_SIZES, null] } },
      { $unset: { companySize: "" } },
      { runValidators: false }
    );
    console.log(`companySize cleanup: ${result.modifiedCount} companies updated`);
    return { companiesUpdated: result.modifiedCount };
  } catch (error) {
    console.error("companySize cleanup failed:", error);
    return { companiesUpdated: 0, error: error.message };
  }
}

module.exports = cleanupInvalidCompanySize;
module.exports.ALLOWED_COMPANY_SIZES = ALLOWED_COMPANY_SIZES;

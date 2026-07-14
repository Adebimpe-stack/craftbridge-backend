/**
 * Shared ranking utilities for the public professional directory.
 *
 * Profile completion scoring, public eligibility, and sort order are
 * centralized here so the directory always returns the highest-quality
 * professionals first and so future ranking boosts (premium, featured,
 * admin-promoted, etc.) can be added without rewriting the consumer routes.
 */

/**
 * Minimum fields a professional must have to appear in the public directory.
 * Professionals who fail this check remain in the database but are hidden
 * from public search results.
 */
const PUBLIC_DIRECTORY_REQUIRED_FIELDS = {
  hasPrimaryTrade: {
    label: "Primary Trade",
    check: (user) => !!(user.primaryTrade && String(user.primaryTrade).trim()),
  },
  hasAboutMe: {
    label: "About Me",
    check: (user) =>
      !!(
        (user.bio && String(user.bio).trim()) ||
        (user.professionalSummary && String(user.professionalSummary).trim()) ||
        (user.serviceDescription && String(user.serviceDescription).trim()) ||
        (user.headline && String(user.headline).trim())
      ),
  },
  hasSkills: {
    label: "Skills",
    check: (user) => Array.isArray(user.skills) && user.skills.length > 0,
  },
  hasLocation: {
    label: "Location",
    check: (user) =>
      !!(
        (user.city && String(user.city).trim()) ||
        (user.country && String(user.country).trim())
      ),
  },
  hasAvailability: {
    label: "Availability",
    check: (user) => !!(user.availability && String(user.availability).trim()),
  },
};

/**
 * Determine whether a professional's profile is complete enough to be listed
 * publicly. This is used by the dashboard banner and can be used anywhere a
 * user object is already in memory.
 */
function isPubliclyEligible(user) {
  return Object.values(PUBLIC_DIRECTORY_REQUIRED_FIELDS).every((field) =>
    field.check(user)
  );
}

/**
 * Return a list of human-readable reasons why a professional is not publicly
 * visible (e.g., ["Missing Primary Trade", "Missing Skills"]). Returns an empty
 * array when the profile is visible.
 */
function getPublicDirectoryIneligibilityReasons(user) {
  const reasons = [];
  for (const { label, check } of Object.values(PUBLIC_DIRECTORY_REQUIRED_FIELDS)) {
    if (!check(user)) {
      reasons.push(`Missing ${label}`);
    }
  }
  return reasons;
}

/**
 * MongoDB $match expression that enforces the same public-directory eligibility
 * rules at the database level. Use this to filter the aggregation pipeline so
 * incomplete profiles never leave the server.
 */
function buildPublicDirectoryEligibilityMatch() {
  const nonEmptyString = (field) => ({
    $gt: [{ $strLenCP: { $ifNull: [field, ""] } }, 0],
  });

  return {
    $expr: {
      $and: [
        nonEmptyString("$primaryTrade"),
        {
          $or: [
            nonEmptyString("$bio"),
            nonEmptyString("$professionalSummary"),
            nonEmptyString("$serviceDescription"),
            nonEmptyString("$headline"),
          ],
        },
        { $gt: [{ $size: { $ifNull: ["$skills", []] } }, 0] },
        {
          $or: [nonEmptyString("$city"), nonEmptyString("$country")],
        },
        nonEmptyString("$availability"),
      ],
    },
  };
}

/**
 * MongoDB aggregation pipeline stages that:
 *  1. Compute `isVerifiedProfile` from workerVerificationStatus or legacy isVerified
 *  2. Compute a 0-100 `profileCompletionScore` from existing profile fields
 *  3. Compute a `rankBoost` from future flags (isAdminPromoted, isPremium, isFeatured,
 *     featuredUntil)
 *  4. Sort by: rankBoost DESC, isVerifiedProfile DESC, profileCompletionScore DESC,
 *     lastLogin DESC, createdAt DESC
 *
 * Featured / premium / admin-promoted users automatically rank above regular
 * verified professionals once the corresponding fields are enabled.
 *
 * @param {Object} matchStage - MongoDB $match expression
 * @returns {Array<Object>} Aggregation pipeline stages (match, addFields, sort)
 */
function buildPublicDirectoryRankingPipeline(matchStage) {
  const isNonEmptyString = (field) => ({
    $gt: [{ $strLenCP: { $ifNull: [field, ""] } }, 0],
  });

  const hasAnyNonEmptyString = (fields) => ({
    $or: fields.map((field) => isNonEmptyString(field)),
  });

  const hasItems = (field) => ({
    $and: [{ $isArray: field }, { $gt: [{ $size: field }, 0] }],
  });

  return [
    { $match: matchStage },
    {
      $addFields: {
        isVerifiedProfile: {
          $cond: [
            {
              $or: [
                { $eq: ["$workerVerificationStatus", "verified"] },
                { $eq: ["$isVerified", true] },
              ],
            },
            1,
            0,
          ],
        },
        profileCompletionScore: {
          $add: [
            // Profile Picture / Avatar (+10)
            {
              $cond: [
                {
                  $or: [
                    isNonEmptyString("$profilePicture"),
                    isNonEmptyString("$profileImage"),
                  ],
                },
                10,
                0,
              ],
            },
            // Primary Trade (+20)
            {
              $cond: [isNonEmptyString("$primaryTrade"), 20, 0],
            },
            // About Me / Bio section (+15)
            {
              $cond: [
                hasAnyNonEmptyString([
                  "$bio",
                  "$professionalSummary",
                  "$serviceDescription",
                  "$headline",
                ]),
                15,
                0,
              ],
            },
            // Skills (+15)
            {
              $cond: [hasItems("$skills"), 15, 0],
            },
            // Experience (+10)
            {
              $cond: [
                {
                  $or: [
                    isNonEmptyString("$experience"),
                    { $gt: ["$experienceYears", 0] },
                  ],
                },
                10,
                0,
              ],
            },
            // Location (+10)
            {
              $cond: [
                hasAnyNonEmptyString([
                  "$location",
                  "$city",
                  "$state",
                  "$country",
                ]),
                10,
                0,
              ],
            },
            // Resume (+10)
            {
              $cond: [
                {
                  $or: [
                    isNonEmptyString("$resume"),
                    isNonEmptyString("$resumeUrl"),
                    { $ne: ["$resumeData", null] },
                    isNonEmptyString("$resumeText"),
                  ],
                },
                10,
                0,
              ],
            },
            // Phone (+5)
            {
              $cond: [
                hasAnyNonEmptyString([
                  "$phone",
                  "$socialLinks.phone",
                  "$socialLinks.whatsapp",
                ]),
                5,
                0,
              ],
            },
            // Certifications (+5)
            {
              $cond: [hasItems("$certifications"), 5, 0],
            },
            // Portfolio (+5)
            {
              $cond: [hasItems("$portfolio"), 5, 0],
            },
          ],
        },
        // Future boost hook. Increase weights or add new flags when these
        // features are implemented. Currently all users have a rankBoost of 0,
        // so today's priority order remains exactly: verified > completion >
        // recent activity > newest.
        // When enabled, Featured Professionals rank above verified professionals.
        rankBoost: {
          $add: [
            { $cond: [{ $eq: ["$isAdminPromoted", true] }, 100, 0] },
            { $cond: [{ $eq: ["$isPremium", true] }, 50, 0] },
            {
              $cond: [
                {
                  $or: [
                    { $eq: ["$isFeatured", true] },
                    {
                      $and: [
                        { $ne: ["$featuredUntil", null] },
                        { $gt: ["$featuredUntil", new Date()] },
                      ],
                    },
                  ],
                },
                25,
                0,
              ],
            },
          ],
        },
      },
    },
    {
      $sort: {
        rankBoost: -1,
        isVerifiedProfile: -1,
        profileCompletionScore: -1,
        lastLogin: -1,
        createdAt: -1,
      },
    },
  ];
}

module.exports = {
  buildPublicDirectoryRankingPipeline,
  isPubliclyEligible,
  buildPublicDirectoryEligibilityMatch,
  getPublicDirectoryIneligibilityReasons,
};

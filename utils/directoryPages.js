/**
 * The programmatic landing pages that currently exist.
 *
 * There is no page table: a URL like /plumbers-in-lekki-nigeria exists exactly
 * while at least one live, verified professional matches it. This module is the
 * single source of that list, shared by the Explore Trades index, the sitemap
 * and the Search Console submitter.
 */

const User = require("../models/User");
const {
  buildPublicDirectoryEligibilityMatch,
} = require("./professionalRanking");
const { slugify, deslugify, localSlug } = require("./localSeo");

const livePermutations = async () => {
  const rows = await User.aggregate([
    {
      $match: {
        $or: [
          { role: "jobseeker" },
          {
            role: { $in: ["user", "customer"] },
            primaryTrade: { $exists: true, $nin: ["", null] },
          },
        ],
        accountStatus: { $nin: ["suspended", "deactivated"] },
        $and: [
          {
            $or: [
              { workerVerificationStatus: "verified" },
              { isVerified: true },
            ],
          },
          buildPublicDirectoryEligibilityMatch(),
        ],
      },
    },
    {
      $group: {
        _id: {
          trade: { $toLower: "$primaryTrade" },
          location: { $toLower: { $ifNull: ["$city", "$location"] } },
          country: { $toLower: { $ifNull: ["$country", ""] } },
        },
        updatedAt: { $max: "$updatedAt" },
        count: { $sum: 1 },
      },
    },
  ]);

  const pages = new Map();
  for (const row of rows) {
    const slug = localSlug(row._id.trade, row._id.location, row._id.country);
    if (!slug) continue;

    const lastmod = (row.updatedAt || new Date()).toISOString().split("T")[0];
    const existing = pages.get(slug);
    if (existing) {
      existing.count += row.count;
      if (existing.lastmod < lastmod) existing.lastmod = lastmod;
      continue;
    }

    pages.set(slug, {
      slug,
      trade: deslugify(row._id.trade),
      tradeSlug: slugify(row._id.trade),
      location: deslugify(row._id.location),
      locationSlug: slugify(row._id.location),
      country: deslugify(row._id.country),
      count: row.count,
      lastmod,
    });
  }

  return [...pages.values()].sort((a, b) => a.slug.localeCompare(b.slug));
};

module.exports = { livePermutations };

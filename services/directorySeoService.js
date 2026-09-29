const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const { livePermutations } = require("../utils/directoryPages");
const { localSlug } = require("../utils/localSeo");
const { submitUrlToIndexing } = require("./indexingService");

/**
 * Keeps Google's copy of the directory current.
 *
 * The sitemap itself is generated on request from the database, so it is never
 * stale. What needs pushing is the *new* permutation: the moment an artisan
 * creates the first "plumbers in Lekki" page, that URL is submitted to Google
 * through the Indexing API instead of waiting for the next crawl.
 *
 * Submitted URLs are remembered on disk so a restart does not re-submit the
 * whole directory and burn the daily quota. Without
 * GOOGLE_SERVICE_ACCOUNT_KEY_FILE configured every submission is a no-op and
 * only the local record is kept.
 */

const STATE_FILE =
  process.env.DIRECTORY_INDEX_STATE_FILE ||
  path.join(__dirname, "..", "data", "submitted-directory-pages.json");

const baseUrl = () =>
  (process.env.FRONTEND_URL || "https://craftbridgejobs.com").replace(/\/+$/, "");

const readSubmitted = () => {
  try {
    return new Set(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
  } catch (err) {
    return new Set();
  }
};

const writeSubmitted = (slugs) => {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify([...slugs], null, 2));
  } catch (err) {
    console.error("DIRECTORY INDEX STATE WRITE ERROR:", err.message);
  }
};

const submitSlug = async (slug, submitted) => {
  if (!slug || submitted.has(slug)) return false;

  await submitUrlToIndexing(`${baseUrl()}/${slug}`, "URL_UPDATED");
  submitted.add(slug);
  return true;
};

/**
 * Webhook-style hook: called when an artisan saves their profile, so their
 * landing page is announced as soon as the permutation is populated.
 */
const submitProfessionalPage = async (user) => {
  try {
    if (!user) return;

    const slug = localSlug(
      user.primaryTrade,
      user.city || user.location,
      user.country
    );
    if (!slug) return;

    const submitted = readSubmitted();
    if (await submitSlug(slug, submitted)) writeSubmitted(submitted);
  } catch (err) {
    console.error("DIRECTORY PAGE SUBMIT ERROR:", err.message);
  }
};

/**
 * Sweep for permutations the hook missed (admin verifications, imports,
 * profiles edited while the key file was absent).
 */
const syncDirectoryPages = async () => {
  const submitted = readSubmitted();
  const pages = await livePermutations();

  let pushed = 0;
  for (const page of pages) {
    if (await submitSlug(page.slug, submitted)) {
      pushed += 1;
      // The Indexing API is rate limited; keep the sweep gentle.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (pushed) writeSubmitted(submitted);
  console.log(
    `Directory sitemap sync: ${pages.length} live pages, ${pushed} newly submitted.`
  );
  return { total: pages.length, submitted: pushed };
};

const startDirectorySeoCron = () => {
  // Nightly, well outside Nigerian business hours.
  cron.schedule("15 3 * * *", () => {
    syncDirectoryPages().catch((err) =>
      console.error("DIRECTORY SEO CRON ERROR:", err.message)
    );
  });
};

module.exports = {
  submitProfessionalPage,
  syncDirectoryPages,
  startDirectorySeoCron,
};

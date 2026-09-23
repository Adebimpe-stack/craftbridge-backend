/**
 * Helpers for the programmatic [trade]/[location] landing pages.
 *
 * The pages are generated from the professionals actually registered in the
 * database, so slugs have to round-trip between a URL segment and the stored
 * free-text trade / city values.
 */

const { normalisePhone } = require("./sendSms");

const WHATSAPP_TEMPLATE =
  "Hello! I found your verified profile on CraftBridge and would like to discuss a job.";

const slugify = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

// "fiber-optic-technicians" -> "Fiber Optic Technicians". Used for the <h1>,
// the title tag and the regex that finds matching professionals.
const deslugify = (slug) =>
  String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A wa.me deep link with the outreach message pre-filled. Returns null when the
 * professional has no usable number, so the button is simply not rendered.
 */
const whatsappLink = (phone, message = WHATSAPP_TEMPLATE) => {
  const e164 = normalisePhone(phone);
  if (!e164) return null;
  return `https://wa.me/${e164.replace("+", "")}?text=${encodeURIComponent(message)}`;
};

/**
 * Title tag targeting the local search query, e.g.
 * "Find Verified & Vetted Plumbers in Lekki, Lagos | CraftBridge".
 * The region is dropped when we don't know it rather than rendering ", ".
 */
const localPageTitle = (trade, location, region) =>
  `Find Verified & Vetted ${trade} in ${[location, region].filter(Boolean).join(", ")} | CraftBridge`;

const localPageDescription = (trade, location, region) =>
  `Hire verified and vetted ${trade.toLowerCase()} in ${[location, region]
    .filter(Boolean)
    .join(", ")}. CraftBridge screens every professional and connects you directly, with no agency fees.`;

module.exports = {
  WHATSAPP_TEMPLATE,
  slugify,
  deslugify,
  escapeRegex,
  whatsappLink,
  localPageTitle,
  localPageDescription,
};

/**
 * Helpers for the programmatic [trade]/[location] landing pages.
 *
 * The pages are generated from the professionals actually registered in the
 * database, so slugs have to round-trip between a URL segment and the stored
 * free-text trade / city values.
 */

const { normalisePhone } = require("./sendSms");
const { COUNTRIES } = require("./countries");

const WHATSAPP_TEMPLATE =
  "Hello! I found your profile on CraftBridge and would like to discuss a job.";

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
 * A `tel:` link for the native dialler. Same rule as the WhatsApp link: null
 * when the number is unusable, so the button is not rendered.
 */
const callLink = (phone) => {
  const e164 = normalisePhone(phone);
  return e164 ? `tel:${e164}` : null;
};

// The number an artisan is reached on: a dedicated WhatsApp number wins over
// the profile phone.
const contactSource = ({ phone, socialLinks } = {}) =>
  socialLinks?.whatsapp || phone || socialLinks?.phone;

// Public responses only say which buttons to show. The links themselves are
// handed out by POST /api/telemetry/contact once the client leaves a name and
// phone number, so every contact is traceable.
const contactChannels = (contact, reachable = true) => {
  const source = reachable ? contactSource(contact) : null;
  return {
    canWhatsapp: Boolean(whatsappLink(source)),
    canCall: Boolean(callLink(source)),
  };
};

const contactMessage = (clientName, refCode) =>
  `Hello! I'm ${clientName}. I found your profile on CraftBridge and would like to discuss a job. (Ref: ${refCode})`;

// Country slugs the URLs may end with. The short forms are what people
// actually type and link, so they resolve to the canonical country name.
const COUNTRY_ALIASES = {
  uk: "United Kingdom",
  gb: "United Kingdom",
  usa: "United States",
  us: "United States",
  uae: "United Arab Emirates",
  ng: "Nigeria",
};

const COUNTRY_BY_SLUG = new Map(
  COUNTRIES.map(({ name }) => [slugify(name), name])
);

/**
 * The canonical landing page path: /plumbers-in-lekki-nigeria.
 * Returns null when either half is missing, so the page is never generated
 * with a dangling "-in-".
 */
const localSlug = (trade, city, country) => {
  const tradeSlug = slugify(trade);
  const citySlug = slugify(city);
  const countrySlug = slugify(country);
  if (!tradeSlug || !citySlug) return null;
  return `${tradeSlug}-in-${[citySlug, countrySlug].filter(Boolean).join("-")}`;
};

/**
 * Inverse of `localSlug`. The country is matched from the end of the slug
 * against the known list, so multi-word cities and countries both survive the
 * round trip:
 *
 *   "graphic-designers-in-london-uk"     -> designers in London, United Kingdom
 *   "electricians-in-port-harcourt-nigeria" -> electricians in Port Harcourt, Nigeria
 *
 * Returns null when the slug is not a landing page URL at all.
 */
const parseLocalSlug = (slug) => {
  const value = String(slug || "").toLowerCase();
  const separator = value.lastIndexOf("-in-");
  if (separator <= 0) return null;

  const tradeSlug = value.slice(0, separator);
  let rest = value.slice(separator + 4);
  if (!tradeSlug || !rest) return null;

  let country = "";
  const parts = rest.split("-");
  for (let take = Math.min(parts.length - 1, 4); take >= 1; take -= 1) {
    const candidate = parts.slice(parts.length - take).join("-");
    const match = COUNTRY_BY_SLUG.get(candidate) || COUNTRY_ALIASES[candidate];
    if (match) {
      country = match;
      rest = parts.slice(0, parts.length - take).join("-");
      break;
    }
  }

  if (!rest) return null;

  return {
    trade: deslugify(tradeSlug),
    tradeSlug,
    location: deslugify(rest),
    locationSlug: rest,
    country,
  };
};

/**
 * Title tag targeting the local search query, e.g.
 * "Find Experienced Plumbers in Lekki, Lagos | CraftBridge".
 * The region is dropped when we don't know it rather than rendering ", ".
 */
const localPageTitle = (trade, location, region) =>
  `Find Experienced ${trade} in ${[location, region].filter(Boolean).join(", ")} | CraftBridge`;

const localPageDescription = (trade, location, region) =>
  `Hire experienced ${trade.toLowerCase()} in ${[location, region]
    .filter(Boolean)
    .join(", ")}. Compare profiles and past work on CraftBridge, then contact them directly with no agency fees.`;

module.exports = {
  WHATSAPP_TEMPLATE,
  slugify,
  deslugify,
  escapeRegex,
  whatsappLink,
  callLink,
  contactSource,
  contactChannels,
  contactMessage,
  localSlug,
  parseLocalSlug,
  localPageTitle,
  localPageDescription,
};

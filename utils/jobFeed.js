// =========================
// XML JOB FEED BUILDER
// One feed for every aggregator we distribute to (Jooble, Jobrapido, Adzuna,
// Talent.com, Careerjet, Jora and any other consumer of the widely supported
// <source>/<job> format). Each aggregator reads the subset of elements it
// understands and ignores the rest, so a superset feed removes the need for a
// per-partner export. Google for Jobs is the exception: it crawls JobPosting
// structured data on the job page rather than an XML feed, so the job page
// carries the same data as JSON-LD.
// =========================

const DEFAULT_COUNTRY = "Nigeria";
const DEFAULT_CURRENCY = "NGN";

// Aggregators expect plain text or HTML inside CDATA, never escaped markup, so
// only the CDATA terminator has to be neutralised.
const cdata = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `<![CDATA[${text.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
};

const escapeXml = (value) =>
  String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Empty elements are dropped instead of emitted blank: several aggregators
// reject a job when a recognised element is present but empty.
const tag = (name, value, { raw = false } = {}) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  return `      <${name}>${raw ? text : cdata(text)}</${name}>\n`;
};

// Aggregators want date-only or RFC-822 style stamps, not ISO 8601 with
// milliseconds.
const feedDate = (date) => {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
};

const isoDate = (date) => {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

// "Ikeja, Lagos, Nigeria" or "Lagos" — split into the city/state/country
// elements aggregators index on, keeping the whole string as a fallback.
const splitLocation = (location) => {
  const parts = String(location || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return { city: "", state: "", country: DEFAULT_COUNTRY };

  let country = DEFAULT_COUNTRY;
  if (parts.length > 2) country = parts.pop();

  const [city, state] = parts.length === 2 ? parts : [parts[0], parts[0]];
  return { city, state: state || "", country };
};

// Salary is stored as free text ("250,000 - 400,000 per month"), so the numeric
// range is recovered for the aggregators that want structured pay.
const parseSalary = (salary) => {
  const text = String(salary || "").trim();
  if (!text) return { text: "", min: "", max: "", period: "" };

  const numbers = (text.match(/\d[\d,.]*/g) || []).map((n) =>
    Number(n.replace(/,/g, ""))
  ).filter((n) => Number.isFinite(n) && n > 0);

  const lower = text.toLowerCase();
  const period = lower.includes("year") || lower.includes("annum")
    ? "yearly"
    : lower.includes("week")
      ? "weekly"
      : lower.includes("day")
        ? "daily"
        : lower.includes("hour")
          ? "hourly"
          : "monthly";

  return {
    text,
    min: numbers.length ? Math.min(...numbers) : "",
    max: numbers.length ? Math.max(...numbers) : "",
    period,
  };
};

// Google for Jobs and most aggregators expect the schema.org employment types.
const EMPLOYMENT_TYPES = {
  "full-time": "FULL_TIME",
  fulltime: "FULL_TIME",
  "part-time": "PART_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACTOR",
  contractor: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  intern: "INTERN",
  volunteer: "VOLUNTEER",
  apprenticeship: "OTHER",
  freelance: "CONTRACTOR",
};

const employmentType = (type) =>
  EMPLOYMENT_TYPES[String(type || "").toLowerCase().replace(/\s+/g, "-")] ||
  "FULL_TIME";

const isRemote = (job) => String(job.workMode || "").toLowerCase() === "remote";

// The description must be self-contained: aggregators show only what the feed
// carries, not the job page.
// The markup is not escaped because it is emitted inside CDATA, and JSON-LD
// encodes it on its own.
const buildDescription = (job) => {
  const sections = [`<p>${job.description || ""}</p>`];

  if (job.requirements) {
    sections.push(`<h3>Requirements</h3><p>${job.requirements}</p>`);
  }
  if (job.benefits) {
    sections.push(`<h3>Benefits</h3><p>${job.benefits}</p>`);
  }

  return sections.join("");
};

const buildJobElement = (job, { frontendUrl }) => {
  const company = job.companyId || job.company || {};
  const { city, state, country } = splitLocation(job.location);
  const salary = parseSalary(job.salary);
  const url = `${frontendUrl}/jobs/${job._id}`;

  return (
    "    <job>\n" +
    tag("title", job.title) +
    tag("date", feedDate(job.createdAt)) +
    tag("referencenumber", job._id) +
    tag("requisitionid", job._id) +
    tag("url", url) +
    tag("applyurl", url) +
    tag("company", company.name || "CraftBridge Employer") +
    tag("companylogo", company.logo) +
    tag("companyurl", company.website) +
    tag("sourcename", "CraftBridge Jobs") +
    tag("city", city) +
    tag("state", state) +
    tag("country", country) +
    tag("location", job.location) +
    tag("remote", isRemote(job) ? "Yes" : "No") +
    tag("telecommute", isRemote(job) ? "1" : "0") +
    tag("workmode", job.workMode) +
    tag("category", job.category) +
    tag("field", job.field) +
    tag("jobtype", job.type) +
    tag("employmenttype", employmentType(job.type)) +
    tag("experience", job.experienceLevel) +
    tag("vacancies", job.vacancies) +
    tag("salary", salary.text) +
    tag("salarymin", salary.min) +
    tag("salarymax", salary.max) +
    tag("salaryperiod", salary.text ? salary.period : "") +
    tag("currency", salary.text ? DEFAULT_CURRENCY : "") +
    tag("expirationdate", isoDate(job.applicationDeadline)) +
    tag("description", buildDescription(job)) +
    "    </job>\n"
  );
};

// =========================
// FEED
// =========================
const buildJobFeedXml = (jobs, { frontendUrl, publisherName = "CraftBridge Jobs" }) => {
  const body = jobs
    .map((job) => buildJobElement(job, { frontendUrl }))
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<source>\n" +
    `  <publisher>${escapeXml(publisherName)}</publisher>\n` +
    `  <publisherurl>${escapeXml(frontendUrl)}</publisherurl>\n` +
    `  <lastBuildDate>${escapeXml(feedDate(new Date()))}</lastBuildDate>\n` +
    `  <totaljobs>${jobs.length}</totaljobs>\n` +
    "  <jobs>\n" +
    body +
    "  </jobs>\n" +
    "</source>\n"
  );
};

// =========================
// GOOGLE FOR JOBS
// Google reads JobPosting structured data from the job page, so the same job
// data is exposed as JSON-LD for the frontend to embed.
// =========================
const buildJobPostingJsonLd = (job, { frontendUrl }) => {
  const company = job.companyId || job.company || {};
  const { city, state, country } = splitLocation(job.location);
  const salary = parseSalary(job.salary);

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: buildDescription(job),
    identifier: {
      "@type": "PropertyValue",
      name: company.name || "CraftBridge Jobs",
      value: String(job._id),
    },
    datePosted: isoDate(job.createdAt),
    employmentType: employmentType(job.type),
    hiringOrganization: {
      "@type": "Organization",
      name: company.name || "CraftBridge Employer",
      sameAs: company.website || frontendUrl,
      ...(company.logo ? { logo: company.logo } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressRegion: state,
        addressCountry: country,
      },
    },
    url: `${frontendUrl}/jobs/${job._id}`,
  };

  if (job.applicationDeadline) {
    jsonLd.validThrough = new Date(job.applicationDeadline).toISOString();
  }

  if (job.vacancies) {
    jsonLd.totalJobOpenings = job.vacancies;
  }

  // Remote roles must declare TELECOMMUTE, otherwise Google treats the office
  // address as the only location.
  if (isRemote(job)) {
    jsonLd.jobLocationType = "TELECOMMUTE";
    jsonLd.applicantLocationRequirements = {
      "@type": "Country",
      name: country,
    };
  }

  if (salary.min) {
    jsonLd.baseSalary = {
      "@type": "MonetaryAmount",
      currency: DEFAULT_CURRENCY,
      value: {
        "@type": "QuantitativeValue",
        minValue: salary.min,
        maxValue: salary.max || salary.min,
        unitText: salary.period.toUpperCase(),
      },
    };
  }

  return jsonLd;
};

module.exports = {
  buildJobFeedXml,
  buildJobPostingJsonLd,
  splitLocation,
  parseSalary,
  employmentType,
  feedDate,
  isoDate,
};

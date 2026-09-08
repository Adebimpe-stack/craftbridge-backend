// =========================
// JOB FEED TESTS
// Run with: npm test
// Builds the feed, the sitemap and the JobPosting JSON-LD from jobs whose text
// contains everything that normally breaks a hand-built XML feed — ampersands,
// angle brackets, quotes, a CDATA terminator, emoji and control characters —
// and asserts the output is well-formed and correctly mapped.
// =========================

const assert = require("assert");

const {
  buildJobFeedXml,
  buildJobSitemapXml,
  buildJobPostingJsonLd,
  splitLocation,
  parseSalary,
  employmentType,
} = require("../utils/jobFeed");
const { validateXml } = require("../utils/xmlValidate");

const frontendUrl = "https://craftbridgejobs.com";

const jobs = [
  {
    _id: "6650000000000000000000a1",
    title: 'Plumber & Pipefitter <urgent> "Lagos" — 50% bonus',
    description:
      "Fix & install pipes <b>fast</b>. Use of R&D tools. Read the ]]> manual. " +
      "Contains a vertical tab:\u000b and a form feed:\u000c and a NUL:\u0000.",
    requirements: "5+ years' experience; must know P&ID diagrams < 10 errors",
    benefits: "Health & dental — plus ₦50,000 transport 🚚",
    location: "Ikeja, Lagos, Nigeria",
    salary: "250,000 - 400,000 per month",
    type: "Full-time",
    workMode: "On-site",
    category: "Construction & Trades",
    experienceLevel: "Mid-level",
    vacancies: 3,
    createdAt: new Date("2026-07-01T09:30:00Z"),
    updatedAt: new Date("2026-07-20T11:00:00Z"),
    applicationDeadline: new Date("2026-12-31T00:00:00Z"),
    companyId: {
      name: 'Bright & Co "Builders"',
      logo: "https://cdn.example.com/logo.png?a=1&b=2",
      website: "https://bright.example.com/?utm=feed&x=1",
    },
  },
  {
    _id: "6650000000000000000000a2",
    title: "Remote Support Engineer",
    description: "Support customers remotely.",
    location: "Lagos",
    salary: "",
    type: "Part-time",
    workMode: "Remote",
    createdAt: new Date("2026-07-10T09:30:00Z"),
    updatedAt: new Date("2026-07-10T09:30:00Z"),
    companyId: { name: "CraftBridge Partner" },
  },
];

const run = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
};

console.log("job feed");

const xml = buildJobFeedXml(jobs, { frontendUrl, generatedAt: new Date("2026-07-20T11:00:00Z") });
const sitemap = buildJobSitemapXml(jobs, { frontendUrl });

run("feed XML is well-formed", () => {
  const result = validateXml(xml);
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.valid, true);
});

run("sitemap XML is well-formed", () => {
  assert.deepStrictEqual(validateXml(sitemap).errors, []);
});

run("XML-invalid control characters are stripped", () => {
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
});

run("CDATA terminator inside a description cannot close the section", () => {
  assert.ok(xml.includes("]]]]><![CDATA[>"));
  assert.strictEqual(validateXml(xml).valid, true);
});

run("special characters survive without corrupting the feed", () => {
  assert.ok(xml.includes('Plumber & Pipefitter <urgent> "Lagos"'));
  assert.ok(xml.includes("Health &amp; dental") === false);
  assert.ok(xml.includes("🚚"));
});

run("empty values are omitted instead of emitted blank", () => {
  assert.ok(!xml.includes("<salary></salary>"));
  assert.ok(!xml.includes("<category></category>"));
});

run("every aggregator's element aliases are present", () => {
  [
    "title",
    "name",
    "date",
    "pubdate",
    "posted",
    "referencenumber",
    "id",
    "ref",
    "url",
    "link",
    "applyurl",
    "company",
    "city",
    "state",
    "region",
    "country",
    "location",
    "locations",
    "jobtype",
    "employmenttype",
    "contract_type",
    "contract_time",
    "description",
  ].forEach((element) => {
    assert.ok(xml.includes(`<${element}>`), `missing <${element}>`);
  });
});

run("free-text location is split into city/state/country", () => {
  assert.deepStrictEqual(splitLocation("Ikeja, Lagos, Nigeria"), {
    city: "Ikeja",
    state: "Lagos",
    country: "Nigeria",
  });
});

run("free-text salary is parsed into a range and period", () => {
  const salary = parseSalary("250,000 - 400,000 per month");
  assert.strictEqual(salary.min, 250000);
  assert.strictEqual(salary.max, 400000);
  assert.strictEqual(salary.period, "monthly");
});

run("job types map to schema.org employment types", () => {
  assert.strictEqual(employmentType("Full-time"), "FULL_TIME");
  assert.strictEqual(employmentType("Contract"), "CONTRACTOR");
  assert.strictEqual(employmentType("Internship"), "INTERN");
});

run("remote jobs are flagged for aggregators and Google", () => {
  assert.ok(xml.includes("<telecommute><![CDATA[1]]></telecommute>"));
  const jsonLd = buildJobPostingJsonLd(jobs[1], { frontendUrl });
  assert.strictEqual(jsonLd.jobLocationType, "TELECOMMUTE");
});

run("JobPosting JSON-LD is serialisable and control-character free", () => {
  const jsonLd = buildJobPostingJsonLd(jobs[0], { frontendUrl });
  const serialised = JSON.stringify(jsonLd);
  assert.deepStrictEqual(JSON.parse(serialised).title, jobs[0].title);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(serialised));
  assert.strictEqual(jsonLd.baseSalary.value.minValue, 250000);
  assert.strictEqual(jsonLd.validThrough, "2026-12-31T00:00:00.000Z");
});

console.log("\nxml validator");

run("rejects unbalanced elements", () => {
  assert.strictEqual(validateXml("<a><b></a>").valid, false);
});

run("rejects unescaped ampersands", () => {
  assert.strictEqual(validateXml("<a>Bright & Co</a>").valid, false);
  assert.strictEqual(validateXml("<a>Bright &amp; Co</a>").valid, true);
});

run("rejects forbidden control characters", () => {
  assert.strictEqual(validateXml("<a>bad\u000bvalue</a>").valid, false);
});

run("accepts CDATA and entities", () => {
  assert.strictEqual(
    validateXml('<?xml version="1.0"?><a><b><![CDATA[a & b < c]]></b></a>').valid,
    true
  );
});

console.log("\nAll feed tests passed.");

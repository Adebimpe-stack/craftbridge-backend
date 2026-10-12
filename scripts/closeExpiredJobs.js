/**
 * Closes active jobs whose application deadline has passed.
 * Dry run (lists them): node scripts/closeExpiredJobs.js
 * Apply:                node scripts/closeExpiredJobs.js --apply
 */

const mongoose = require("mongoose");
const Job = require("../models/Job");

require("dotenv").config();

async function closeExpiredJobs() {
  const apply = process.argv.includes("--apply");
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const query = {
    status: "active",
    isDeleted: false,
    applicationDeadline: { $lt: new Date() },
  };

  const jobs = await Job.find(query).select("title companyName applicationDeadline").lean();
  jobs.forEach((job) => {
    console.log(
      `${job._id}  ${new Date(job.applicationDeadline).toISOString().slice(0, 10)}  ${job.title} (${job.companyName || "-"})`
    );
  });

  if (!apply) {
    console.log(`\n${jobs.length} expired job(s) found. Re-run with --apply to close them.`);
  } else {
    const result = await Job.updateMany(query, { $set: { status: "closed" } });
    console.log(`\nClosed ${result.modifiedCount} expired job(s).`);
  }

  await mongoose.disconnect();
}

closeExpiredJobs().catch(async (error) => {
  console.error("Failed to close expired jobs:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});

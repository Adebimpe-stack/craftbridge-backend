/**
 * Migration script to add slugs to existing jobs
 * Run: node scripts/addJobSlugs.js
 */

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { generateSlug } = require('../utils/slugGenerator');

require('dotenv').config();

async function addJobSlugs() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/craftbridge';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all jobs without slugs
    const jobsWithoutSlugs = await Job.find({ slug: { $exists: false } });
    console.log(`Found ${jobsWithoutSlugs.length} jobs without slugs`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const job of jobsWithoutSlugs) {
      try {
        const slug = generateSlug(job.title, job.location, job._id);
        job.slug = slug;
        await job.save();
        console.log(`✅ Added slug: ${slug} for job: ${job.title}`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Error adding slug for job ${job._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration complete: ${updatedCount} jobs updated, ${errorCount} errors`);
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

addJobSlugs();
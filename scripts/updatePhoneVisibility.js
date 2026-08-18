/**
 * Migration script to update phone visibility for existing users
 * Run: node scripts/updatePhoneVisibility.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');

require('dotenv').config();

async function updatePhoneVisibility() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/craftbridge';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all users with phoneVisibility set to "private"
    const usersWithPrivatePhone = await User.find({ phoneVisibility: 'private' });
    console.log(`Found ${usersWithPrivatePhone.length} users with private phone visibility`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const user of usersWithPrivatePhone) {
      try {
        user.phoneVisibility = 'on_request';
        await user.save();
        console.log(`✅ Updated phone visibility for user: ${user.name} (${user.email})`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Error updating phone visibility for user ${user._id}:`, error.message);
        errorCount++;
      }
    }

    // Also update users without phoneVisibility field
    const usersWithoutVisibility = await User.find({ phoneVisibility: { $exists: false } });
    console.log(`Found ${usersWithoutVisibility.length} users without phone visibility field`);

    for (const user of usersWithoutVisibility) {
      try {
        user.phoneVisibility = 'on_request';
        await user.save();
        console.log(`✅ Added phone visibility for user: ${user.name} (${user.email})`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Error adding phone visibility for user ${user._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration complete: ${updatedCount} users updated, ${errorCount} errors`);
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updatePhoneVisibility();
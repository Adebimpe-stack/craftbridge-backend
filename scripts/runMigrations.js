const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const Migration = require("../models/Migration");

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  console.log(
    DRY_RUN
      ? "\n=== DRY RUN ==="
      : "\n=== RUNNING MIGRATIONS ==="
  );

  await mongoose.connect(process.env.MONGO_URI);

  const migrationDir = path.join(
    __dirname,
    "migrations"
  );

  const files = fs
    .readdirSync(migrationDir)
    .filter(f => f.endsWith(".js"))
    .sort();

  for (const file of files) {

    const alreadyExecuted =
      await Migration.findOne({
        name: file,
      });

    if (alreadyExecuted) {

      console.log(`✓ ${file} already executed`);

      continue;
    }

    console.log(`\nRunning ${file}`);

    const migration =
      require(path.join(
        migrationDir,
        file
      ));

    if (DRY_RUN) {

      console.log(
        "Dry run - not executing."
      );

      continue;

    }

    const session =
      await mongoose.startSession();

    try {

      session.startTransaction();

      await migration(session);

      await Migration.create(
        [
          {
            name: file,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      console.log(
        `✓ ${file} completed`
      );

    } catch (err) {

      await session.abortTransaction();

      console.error(
        `✗ ${file} failed`
      );

      throw err;

    } finally {

      session.endSession();

    }

  }

  console.log(
    "\nAll migrations finished."
  );

  process.exit(0);

}

run().catch(err => {

  console.error(err);

  process.exit(1);

});

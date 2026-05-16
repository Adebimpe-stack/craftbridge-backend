const mongoose = require("mongoose");
const User = require("./models/User");

require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

async function run() {
  try {
    const result = await User.updateOne(
      { email: "fasemoyinadebimpe@gmail.com" },
      { $set: { role: "admin" } }
    );

    console.log("Updated:", result);
  } catch (err) {
    console.log(err);
  } finally {
    process.exit();
  }
}

run();

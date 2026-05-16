require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// =====================
// ROUTES
// =====================
app.use("/api/auth", require("./routes/auth"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/employer", require("./routes/employer"));
app.use("/api/admin", require("./routes/admin"));
// =====================
// HOME
// =====================
app.get("/", (req, res) => {
  res.send("Craftbridge API is running 🚀");
});

// =====================
// DATABASE
// =====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.log(err.message));

// =====================
// START SERVER
// =====================
app.listen(5000, "0.0.0.0", () =>
  console.log("Server running on port 5000 🚀")
);

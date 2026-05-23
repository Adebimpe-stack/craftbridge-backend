const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

// =========================
// MIDDLEWARE
// =========================
app.use(express.json());

app.use(
  cors({
    origin: [
      "https://craftbridge-frontend.vercel.app",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);

// =========================
// ROUTES
// =========================
app.use("/api/auth", require("./routes/auth"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/employer", require("./routes/employer"));

// =========================
// TEST ROUTE
// =========================
app.get("/", (req, res) => {
  res.send("CraftBridge API running...");
});

// =========================
// DB CONNECT
// =========================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    app.listen(process.env.PORT || 5000, () => {
      console.log(
        `Server running on port ${process.env.PORT || 5000}`
      );
    });
  })
  .catch((err) => {
    console.log(err);
  });

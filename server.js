const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

// ==============================
// CORS FIX (PRODUCTION SAFE)
// ==============================
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://craftbridge-frontend.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// handle preflight requests
app.options(/.*/, cors());

// ==============================
// MIDDLEWARE
// ==============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==============================
// DB CONNECTION
// ==============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ DB Error:", err.message));

// ==============================
// ROUTES (SAFE LOADING)
// ==============================
try {
  const authRoutes = require("./routes/auth");
  app.use("/api/auth", authRoutes);
} catch (err) {
  console.log("⚠️ auth routes missing");
}

try {
  const jobRoutes = require("./routes/jobs");
  app.use("/api/jobs", jobRoutes);
} catch (err) {
  console.log("⚠️ jobs routes missing");
}

try {
  const companyRoutes = require("./routes/companies");
  app.use("/api/companies", companyRoutes);
} catch (err) {
  console.log("⚠️ company routes missing");
}

try {
  const employerRoutes = require("./routes/employer.routes");
  app.use("/api/employer", employerRoutes);
} catch (err) {
  console.log("⚠️ employer routes missing");
}

// ==============================
// TEST ROUTE
// ==============================
app.get("/", (req, res) => {
  res.json({
    message: "CraftBridge API Running 🚀",
  });
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

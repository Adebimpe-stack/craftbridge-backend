require("dotenv").config();

const express =
  require("express");

const cors =
  require("cors");

const mongoose =
  require("mongoose");

const app =
  express();

const adminRoutes =
  require("./routes/admin");

const partnershipRoutes =
  require("./partnership.routes");
// ==============================
// IMPORT ROUTES
// ==============================

const authRoutes =
  require("./routes/auth");

const userRoutes =
  require("./routes/userRoutes");

const jobRoutes =
  require("./routes/jobs");

const candidateRoutes =
  require("./routes/candidate");

const employerRoutes =
  require("./routes/employer");

const companiesRoutes =
  require("./routes/companies");

const paymentRoutes =
  require("./payment.routes");

const serviceRequestRoutes =
  require("./routes/serviceRequests");

// ==============================
// MIDDLEWARE
// ==============================

app.use(express.json());

app.use(

  cors({

    origin: [

      "http://localhost:3000",

      "http://localhost:5173",

      "https://craftbridge-frontend.vercel.app",

      "https://craftbridgejobs.com",

      "https://www.craftbridgejobs.com",

    ],

    credentials: true,

  })

);

app.use("/api", partnershipRoutes);

app.use(
  "/api/admin",
  adminRoutes
);

// ==============================
// DATABASE CONNECTION STATE
// ==============================

let dbReady = false;

// Mongoose connection event listeners
mongoose.connection.on("connected", () => {
  dbReady = true;
  console.log("MongoDB Connected ✅");
});

mongoose.connection.on("disconnected", () => {
  dbReady = false;
  console.log("MongoDB Disconnected ⚠️ — will retry...");
});

mongoose.connection.on("error", (err) => {
  dbReady = false;
  console.log("MongoDB connection error:", err.message);
});

// Retry connect with exponential backoff
async function connectWithRetry(attempt = 1) {
  const maxAttempts = 10;
  const baseDelay = 3000;

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      family: 4, // Force IPv4 — avoids EAI_AGAIN on some VPS DNS configs
    });
  } catch (err) {
    console.log(`MongoDB connect attempt ${attempt} failed: ${err.message}`);
    if (attempt < maxAttempts) {
      const delay = Math.min(baseDelay * attempt, 30000);
      console.log(`Retrying in ${delay / 1000}s...`);
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    } else {
      console.log("MongoDB: max retry attempts reached. Server will respond with 503 until DB reconnects.");
    }
  }
}

connectWithRetry();

// ==============================
// DB READINESS MIDDLEWARE
// Immediately return 503 if MongoDB is not connected
// so requests never hang waiting for a dead DB
// ==============================

const DB_EXEMPT = ["/", "/api/health"];

app.use((req, res, next) => {
  if (DB_EXEMPT.includes(req.path)) return next();
  if (!dbReady) {
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again in a moment.",
    });
  }
  next();
});

// ==============================
// API ROUTES
// ==============================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/jobs",
  jobRoutes
);

app.use(
  "/api/candidate",
  candidateRoutes
);

app.use(
  "/api/employer",
  employerRoutes
);

app.use(
  "/api/companies",
  companiesRoutes
);

app.use("/api", paymentRoutes);

app.use("/api/service-requests", serviceRequestRoutes);

// ==============================
// ROOT / HEALTH ROUTES
// ==============================

app.get("/", (req, res) => {
  res.json({
    message: "CraftBridge API Running 🚀",
    db: dbReady ? "connected" : "disconnected",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", db: dbReady ? "connected" : "disconnected" });
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

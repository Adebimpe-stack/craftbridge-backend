require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const candidateRoutes = require("./routes/candidate");
const companyRoutes = require("./routes/companies");
const employerRoutes = require("./routes/employer");
const jobRoutes = require("./routes/jobs");
const partnershipReviewRoutes = require("./routes/partnership.routes");
const partnershipRoutes = require("./partnership.routes");
const paymentRoutes = require("./payment.routes");
const paystackWebhookRoutes = require("./routes/paystackWebhook");
const reportRoutes = require("./routes/reports");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(helmet());
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

app.use("/api/paystack/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CraftBridge API Running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "OK",
    data: {
      uptime: process.uptime(),
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    },
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/employer", employerRoutes);
app.use("/api/employer", companyRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api", partnershipRoutes);
app.use("/api/partnerships", partnershipReviewRoutes);
app.use("/api", paymentRoutes);
app.use("/api", paystackWebhookRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server error",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("MongoDB connected");
    } else {
      console.warn("MONGO_URI is not set. Server starting without a database connection.");
    }

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down.`);
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("Startup error:", err.message);
    process.exit(1);
  }
};

startServer();

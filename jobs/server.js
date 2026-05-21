require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const app = express();

/* =========================
   SECURITY
========================= */
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

/* =========================
   CORS CONFIG
========================= */
app.use(
  cors({
    origin: "https://craftbridge-frontend.vercel.app",
    credentials: true,
  })
);

/* =========================
   MAIN ROUTES
========================= */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/employer", require("./routes/employer"));

/* =========================
   PAYMENT (PAYSTACK)
========================= */
app.use("/api/paystack", require("./routes/paystackWebhook"));

/* =========================
   ADMIN ROUTES
========================= */
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin/users", require("./routes/admin/users"));
app.use("/api/admin/jobs", require("./routes/admin/jobs"));
app.use("/api/admin/applications", require("./routes/admin/applications"));

/* =========================
   HOME ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("CraftBridge API running 🚀");
});

/* =========================
   DATABASE
========================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

/* =========================
   CRON JOB (SUBSCRIPTION REMINDERS + AUTO DISABLE)
========================= */
const subscriptionReminderJob = require("./jobs/subscriptionReminderJob");
subscriptionReminderJob();

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} 🚀`)
);

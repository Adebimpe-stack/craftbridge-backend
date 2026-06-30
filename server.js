require("dotenv").config();

const express =
  require("express");

const companyRoutes = require("./routes/companies");

const cors =
  require("cors");

const mongoose =
  require("mongoose");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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

const reportRoutes =
  require("./routes/reports");

// ==============================
// MIDDLEWARE
// ==============================

// Security Headers
app.use(helmet());

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

// Rate Limiting for Auth Routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

const authRouter = express.Router();
authRouter.use(cors()); // Apply CORS before the rate limiter for this router
authRouter.use(authLimiter);
authRouter.use(authRoutes);

app.use("/api", partnershipRoutes);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/companies",
  companyRoutes
);

// ==============================
// DATABASE CONNECTION
// ==============================

mongoose.connect(

  process.env.MONGO_URI

)

.then(() => {

  console.log(
    "MongoDB Connected ✅"
  );

})

.catch((err) => {

  console.log(
    "MongoDB Error:",
    err
  );

});

// ==============================
// API ROUTES
// ==============================

app.use("/api/auth", authRouter);

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
  "/api/reports",
  reportRoutes
);

// ==============================
// ROOT ROUTE
// ==============================

app.get(
  "/",

  (req, res) => {

    res.json({

      message:
        "CraftBridge API Running 🚀",

    });

  }

);

// ==============================
// START SERVER
// ==============================

const PORT =
  process.env.PORT || 5000;

app.listen(

  PORT,

  () => {

    console.log(

      `Server running on port ${PORT}`

    );

  }

);

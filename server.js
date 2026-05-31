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

// ==============================
// IMPORT ROUTES
// ==============================

const authRoutes =
  require("./routes/auth");

const userRoutes =
  require("./routes/userRoutes");

const jobRoutes =
  require("./routes/jobs");

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

app.use(
  "/api/admin",
  adminRoutes
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

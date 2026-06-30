const express =
  require("express");

const router =
  express.Router();

const User =
  require("../models/User");

const protect =
  require("../middleware/auth");

const upload =
  require("../middleware/upload");

// GET ALL EMPLOYERS (ADMIN)
// ==============================

router.get(

  "/admin/employers",

  protect,

  async (req, res) => {

    try {

      if (
        req.user.role !==
        "admin"
      ) {

        return res.status(403).json({

          message:
            "Access denied",

        });

      }

      const employers =
  await User.find({
    role: "employer",
  })
  .sort({
    createdAt: -1,
  })
  .select("-password");
      res.json(
        employers
      );

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Server error",

      });

    }

  }

);

// ==============================
// PUBLIC TALENT DIRECTORY
// ==============================

router.get(
  "/talent",
  async (req, res) => {

    try {

      const talent =
        await User.find({
          role: "jobseeker",
        })
        .select(
          "-password"
        )
        .sort({
          createdAt: -1,
        });

      res.json(talent);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Server error",
      });

    }

  }
);

module.exports =
  router;

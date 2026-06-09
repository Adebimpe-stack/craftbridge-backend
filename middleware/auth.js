const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

module.exports =
  async (req, res, next) => {

    try {

      // GET AUTH HEADER
      const authHeader =
        req.headers.authorization;

      // CHECK HEADER EXISTS
      if (!authHeader) {

        return res.status(401).json({
          message:
            "No token provided",
        });

      }

      // FORMAT:
      // Bearer TOKEN
      const token =
        authHeader.split(" ")[1];

      // VERIFY TOKEN
      const decoded =
        jwt.verify(

          token,

          process.env.JWT_SECRET
        );

      // FIND USER
const user =
  await User.findById(
    decoded.id
  );

// USER REMOVED
if (!user) {

  return res.status(403).json({
    message:
      "Account no longer exists. Contact admin.",
  });

}

// ACCOUNT SUSPENDED
if (
  user.accountStatus ===
  "suspended"
) {

  return res.status(403).json({
    message:
      "Your account has been suspended.",
  });

}
      // ATTACH USER
      req.user = user;

      next();

    } catch (error) {

      return res.status(401).json({
        message:
          "Invalid token",
      });

    }

  };

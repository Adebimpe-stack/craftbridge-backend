const jwt =
  require("jsonwebtoken");

module.exports =
  async (req, res, next) => {

    try {

      const authHeader =
        req.headers.authorization;

      // CHECK HEADER
      if (!authHeader) {

        return res.status(401).json({
          message:
            "No authorization header",
        });

      }

      // TOKEN FORMAT:
      // Bearer TOKEN
      const token =
        authHeader.split(" ")[1];

      if (!token) {

        return res.status(401).json({
          message:
            "No token found",
        });

      }

      // VERIFY TOKEN
      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      // SAVE USER
      req.user = decoded;

      next();

    } catch (error) {

      console.error("AUTH ERROR:", error);

      return res.status(401).json({
        message:
          "Authentication failed",
      });

    }

  };

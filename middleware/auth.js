const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "No token, access denied" });
  }

  try {
    // remove Bearer if exists
    const realToken = token.replace("Bearer ", "");

    const decoded = jwt.verify(realToken, process.env.JWT_SECRET);

    req.user = decoded; // { id, role }

    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

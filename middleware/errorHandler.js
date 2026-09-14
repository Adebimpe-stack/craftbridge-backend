const multer = require("multer");

// Upload failures (bad file type, oversized file, unexpected field) are raised
// by multer inside the middleware chain, where a route's try/catch can't see
// them. Without this they fall through to Express' default handler and reach
// the browser as an opaque HTML 500.
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "That file is too large. The maximum upload size is 50MB.",
      LIMIT_FILE_COUNT: "Too many files were uploaded at once.",
      LIMIT_UNEXPECTED_FILE: `Unexpected file field "${err.field}".`,
    };

    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      success: false,
      message: messages[err.code] || `Upload failed: ${err.message}`,
    });
  }

  if (err && err.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({ success: false, message: err.message });
  }

  console.error("UNHANDLED ERROR:", err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.status && err.message ? err.message : "Server error",
  });
};

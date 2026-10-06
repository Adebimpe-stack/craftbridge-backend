const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const {
  getStorage,
  missingStorageConfig,
  publicUrlForKey,
} = require("../config/storage");

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
];

const allowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
];

const missingConfig = missingStorageConfig;

// The S3 API endpoint of providers like R2 is private, so stored file URLs
// must use the bucket's public domain instead of the upload response URL.
const withPublicUrls = (storage, publicUrl) => ({
  _handleFile(req, file, cb) {
    storage._handleFile(req, file, (err, info) => {
      if (err || !info) return cb(err, info);
      cb(null, { ...info, location: publicUrlForKey(publicUrl, info.key) });
    });
  },
  _removeFile(req, file, cb) {
    storage._removeFile(req, file, cb);
  },
});

const fileFilter = (req, file, cb) => {
  const mimetype = String(file.mimetype || "").toLowerCase();
  const extension = path.extname(file.originalname || "").toLowerCase();

  // Browsers and phones often send a generic or missing mimetype (notably for
  // HEIC photos), so fall back to the extension before rejecting the file.
  const genericMimetype =
    !mimetype ||
    mimetype === "application/octet-stream" ||
    mimetype === "binary/octet-stream";

  if (
    allowedMimeTypes.includes(mimetype) ||
    (genericMimetype && allowedExtensions.includes(extension))
  ) {
    return cb(null, true);
  }

  const error = new Error(
    `"${file.originalname}" is not a supported file type. Upload a JPG, PNG, WEBP, HEIC or GIF image, a PDF/Word document, or an MP4/WEBM/MOV video.`
  );
  error.code = "INVALID_FILE_TYPE";
  error.status = 400;
  cb(error, false);
};

const buildUpload = () => {
  const missing = missingConfig();
  if (missing.length) {
    return null;
  }

  const { client, bucket, publicUrl } = getStorage();

  const storage = multerS3({
    s3: client,
    bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata(req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
      });
    },
    key(req, file, cb) {
      let folder = "uploads";

      if (file.fieldname === "verificationDocuments") {
        folder = "verification-documents";
      }

      if (file.fieldname === "profilePicture") {
        folder = "profile-pictures";
      }

      if (file.fieldname === "companyLogo") {
        folder = "company-logos";
      }

      if (file.fieldname === "resume") {
        folder = "resumes";
      }

      if (file.fieldname === "portfolioImages" || file.fieldname === "portfolioVideos") {
        folder = "portfolio";
      }

      const uniqueName = `${folder}/${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${path.extname(file.originalname)}`;

      cb(null, uniqueName);
    },
  });

  return multer({
    storage: publicUrl ? withPublicUrls(storage, publicUrl) : storage,
    limits: {
      fileSize: 50 * 1024 * 1024, // Increased to 50MB for videos
    },
    fileFilter,
  });
};

const requireUpload = () => {
  const upload = buildUpload();
  if (upload) {
    return upload;
  }

  const missing = missingConfig();
  const handler = (req, res) =>
    res.status(500).json({
      success: false,
      message: `File uploads are not configured. Missing: ${missing.join(", ")}`,
    });

  return {
    single: () => handler,
    array: () => handler,
    fields: () => handler,
  };
};

module.exports = {
  allowedMimeTypes,
  allowedExtensions,
  fileFilter,
  single: (...args) => requireUpload().single(...args),
  array: (...args) => requireUpload().array(...args),
  fields: (...args) => requireUpload().fields(...args),
};

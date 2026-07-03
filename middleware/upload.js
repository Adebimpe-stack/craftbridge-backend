const multer = require("multer");
const path = require("path");

// ==============================
// ALLOWED FILE TYPES
// ==============================

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

// ==============================
// FILE FILTER
// ==============================

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"), false);
  }
};

// ==============================
// MULTER CONFIG (CONDITIONAL S3)
// ==============================

let upload;

if (
  process.env.AWS_BUCKET_NAME &&
  process.env.AWS_ACCESS_KEY &&
  process.env.AWS_SECRET_KEY &&
  process.env.AWS_REGION
) {
  // Use S3 storage if AWS credentials are available
  const { S3Client } = require("@aws-sdk/client-s3");
  const multerS3 = require("multer-s3");

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
    },
  });

  upload = multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
      },
      key: function (req, file, cb) {
        let folder = "uploads";
        if (file.fieldname === "verificationDocument") {
          folder = "verification-documents";
        }
        if (file.fieldname === "profilePicture") {
          folder = "company-logos";
        }
        if (file.fieldname === "resume") {
          folder = "resumes";
        }
        const uniqueName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    }),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter,
  });
} else {
  // Use memory storage if AWS credentials are not available
  upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter,
  });
}

// ==============================
// EXPORT
// ==============================

module.exports = upload;

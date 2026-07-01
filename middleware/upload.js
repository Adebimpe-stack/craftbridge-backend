const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

const requiredConfig = [
  "AWS_REGION",
  "AWS_ACCESS_KEY",
  "AWS_SECRET_KEY",
  "AWS_BUCKET_NAME",
];

const missingConfig = () =>
  requiredConfig.filter((key) => !process.env[key]);

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error("Invalid file type"), false);
};

const buildUpload = () => {
  const missing = missingConfig();
  if (missing.length) {
    return null;
  }

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
    },
  });

  return multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata(req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
        });
      },
      key(req, file, cb) {
        let folder = "uploads";

        if (file.fieldname === "verificationDocument") {
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

        const uniqueName = `${folder}/${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${path.extname(file.originalname)}`;

        cb(null, uniqueName);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024,
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
  single: (...args) => requireUpload().single(...args),
  array: (...args) => requireUpload().array(...args),
  fields: (...args) => requireUpload().fields(...args),
};

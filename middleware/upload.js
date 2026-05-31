const multer =
  require("multer");

const {
  S3Client,
} = require("@aws-sdk/client-s3");

const multerS3 =
  require("multer-s3");

const path =
  require("path");

// ==============================
// AWS S3 CLIENT
// ==============================

const s3 =
  new S3Client({

    region:
      process.env.AWS_REGION,

    credentials: {

      accessKeyId:
        process.env.AWS_ACCESS_KEY,

      secretAccessKey:
        process.env.AWS_SECRET_KEY,

    },

  });

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

const fileFilter =
  (req, file, cb) => {

    if (
      allowedMimeTypes.includes(
        file.mimetype
      )
    ) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "Invalid file type"
        ),
        false
      );

    }

  };

// ==============================
// MULTER S3 CONFIG
// ==============================

const upload =
  multer({

    storage:
      multerS3({

        s3,

        bucket:
          process.env.AWS_BUCKET_NAME,

        metadata:
          function (
            req,
            file,
            cb
          ) {

            cb(null, {
              fieldName:
                file.fieldname,
            });

          },

        key:
          function (
            req,
            file,
            cb
          ) {

            const uniqueName =

              `verification-documents/${Date.now()}-${Math.round(
                Math.random() * 1e9
              )}${path.extname(
                file.originalname
              )}`;

            cb(
              null,
              uniqueName
            );

          },

      }),

    limits: {

      fileSize:
        10 * 1024 * 1024,

    },

    fileFilter,

  });

// ==============================
// EXPORT
// ==============================

module.exports =
  upload;

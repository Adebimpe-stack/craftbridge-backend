const { S3Client } = require("@aws-sdk/client-s3");

// STORAGE_ENDPOINT switches uploads to an S3-compatible provider such as
// Cloudflare R2; without it the AWS_* settings are used.
const AWS_KEYS = ["AWS_REGION", "AWS_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_BUCKET_NAME"];
const COMPATIBLE_KEYS = [
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
  "STORAGE_BUCKET",
  "STORAGE_PUBLIC_URL",
];

const trimSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

const usesCompatibleStorage = () => Boolean(process.env.STORAGE_ENDPOINT);

const missingStorageConfig = () =>
  (usesCompatibleStorage() ? COMPATIBLE_KEYS : AWS_KEYS).filter(
    (key) => !process.env[key]
  );

const createCompatibleClient = ({ endpoint, region, accessKeyId, secretAccessKey }) =>
  new S3Client({
    endpoint,
    region: region || "auto",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

const getStorage = () => {
  if (usesCompatibleStorage()) {
    return {
      client: createCompatibleClient({
        endpoint: trimSlash(process.env.STORAGE_ENDPOINT),
        region: process.env.STORAGE_REGION,
        accessKeyId: process.env.STORAGE_ACCESS_KEY,
        secretAccessKey: process.env.STORAGE_SECRET_KEY,
      }),
      bucket: process.env.STORAGE_BUCKET,
      publicUrl: trimSlash(process.env.STORAGE_PUBLIC_URL),
    };
  }

  return {
    client: new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
      },
    }),
    bucket: process.env.AWS_BUCKET_NAME,
    publicUrl: "",
  };
};

const publicUrlForKey = (publicUrl, key) =>
  `${trimSlash(publicUrl)}/${String(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

module.exports = {
  createCompatibleClient,
  getStorage,
  missingStorageConfig,
  publicUrlForKey,
  trimSlash,
  usesCompatibleStorage,
};

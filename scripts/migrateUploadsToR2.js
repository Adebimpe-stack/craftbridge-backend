// Moves uploaded files from the AWS S3 bucket to the S3-compatible bucket set by
// STORAGE_* (Cloudflare R2) and points stored file URLs at STORAGE_PUBLIC_URL.
// See docs/R2_STORAGE_MIGRATION.md. Run on the VPS:
//   node scripts/migrateUploadsToR2.js copy
//   node scripts/migrateUploadsToR2.js rewrite           (dry run)
//   node scripts/migrateUploadsToR2.js rewrite --apply
//   node scripts/migrateUploadsToR2.js verify

require("dotenv").config();

const mongoose = require("mongoose");
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { createCompatibleClient, trimSlash } = require("../config/storage");

const CONCURRENCY = 5;
const PUBLIC_CHECK_SAMPLE = 5;

const required = (keys) => {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sourceConfig = () => {
  required(["AWS_REGION", "AWS_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_BUCKET_NAME"]);
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  };
  // MIGRATION_SOURCE_ENDPOINT / MIGRATION_SOURCE_URL_PREFIX are only needed
  // when the source is not AWS itself (e.g. a local S3 emulator).
  const endpoint = trimSlash(process.env.MIGRATION_SOURCE_ENDPOINT);
  return {
    client: endpoint
      ? createCompatibleClient({ endpoint, region: process.env.AWS_REGION, ...credentials })
      : new S3Client({ region: process.env.AWS_REGION, credentials }),
    bucket: process.env.AWS_BUCKET_NAME,
  };
};

const targetConfig = () => {
  required([
    "STORAGE_ENDPOINT",
    "STORAGE_ACCESS_KEY",
    "STORAGE_SECRET_KEY",
    "STORAGE_BUCKET",
    "STORAGE_PUBLIC_URL",
  ]);
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
};

// Matches every URL form S3 hands out for the bucket, capturing the object key.
const sourceUrlPattern = () => {
  const bucket = escapeRegExp(process.env.AWS_BUCKET_NAME || "");
  const hosts = [
    `${bucket}\\.s3[.-](?:[a-z0-9-]+\\.)?amazonaws\\.com`,
    `s3[.-](?:[a-z0-9-]+\\.)?amazonaws\\.com/${bucket}`,
  ];
  const prefix = trimSlash(process.env.MIGRATION_SOURCE_URL_PREFIX);
  if (prefix) hosts.push(escapeRegExp(prefix.replace(/^https?:\/\//, "")));
  return new RegExp(`https?://(?:${hosts.join("|")})/([^\\s"'<>?#)]+)`, "g");
};

const decodeKey = (encoded) => {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

const runPool = async (items, worker) => {
  let index = 0;
  const next = async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
};

const listKeys = async ({ client, bucket }) => {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken })
    );
    (page.Contents || []).forEach((obj) => objects.push({ key: obj.Key, size: obj.Size }));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
};

const headObject = async ({ client, bucket }, key) => {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") return null;
    throw err;
  }
};

const copy = async () => {
  const source = sourceConfig();
  const target = targetConfig();
  const objects = await listKeys(source);
  const totalBytes = objects.reduce((sum, obj) => sum + (obj.size || 0), 0);
  console.log(
    `Source bucket ${source.bucket}: ${objects.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
  );

  let copied = 0;
  let skipped = 0;
  const failed = [];

  await runPool(objects, async ({ key, size }) => {
    try {
      const existing = await headObject(target, key);
      if (existing && existing.ContentLength === size) {
        skipped += 1;
        return;
      }
      const obj = await source.client.send(
        new GetObjectCommand({ Bucket: source.bucket, Key: key })
      );
      const body = await obj.Body.transformToByteArray();
      await target.client.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: body,
          ContentType: obj.ContentType,
          ContentDisposition: obj.ContentDisposition,
          CacheControl: obj.CacheControl,
          Metadata: obj.Metadata,
        })
      );
      copied += 1;
      if (copied % 50 === 0) console.log(`  copied ${copied}...`);
    } catch (err) {
      failed.push(key);
      console.error(`  FAILED ${key}: ${err.message}`);
    }
  });

  console.log(`Copied ${copied}, already present ${skipped}, failed ${failed.length}`);
  if (failed.length) process.exitCode = 1;
};

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

// Returns the value with every match of `pattern` replaced, recursing into
// plain objects and arrays; BSON types (ObjectId, Date, ...) are left alone.
const replaceDeep = (value, replace) => {
  if (typeof value === "string") return replace(value);
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, replace));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceDeep(v, replace)])
    );
  }
  return value;
};

const connect = async () => {
  required(["MONGO_URI"]);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  return mongoose.connection.db;
};

const forEachDocument = async (db, visit) => {
  const collections = await db.listCollections({ type: "collection" }).toArray();
  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    const collection = db.collection(name);
    for await (const doc of collection.find({})) {
      await visit(collection, doc);
    }
  }
};

const rewrite = async (apply) => {
  const target = targetConfig();
  const pattern = sourceUrlPattern();
  const db = await connect();

  const keys = new Set();
  const pending = [];
  const perCollection = {};

  await forEachDocument(db, async (collection, doc) => {
    const changes = {};
    for (const [field, value] of Object.entries(doc)) {
      if (field === "_id") continue;
      const next = replaceDeep(value, (text) =>
        text.replace(pattern, (match, encodedKey) => {
          keys.add(decodeKey(encodedKey));
          return `${target.publicUrl}/${encodedKey}`;
        })
      );
      if (JSON.stringify(next) !== JSON.stringify(value)) changes[field] = next;
    }
    if (Object.keys(changes).length) {
      pending.push({ collection, _id: doc._id, changes });
      perCollection[collection.collectionName] =
        (perCollection[collection.collectionName] || 0) + 1;
    }
  });

  console.log(`Documents with S3 links: ${pending.length}`);
  Object.entries(perCollection).forEach(([name, count]) =>
    console.log(`  ${name}: ${count}`)
  );
  console.log(`Distinct files referenced: ${keys.size}`);

  const missing = [];
  await runPool([...keys], async (key) => {
    if (!(await headObject(target, key))) missing.push(key);
  });
  if (missing.length) {
    console.log(`Files referenced in the database but not in ${target.bucket}: ${missing.length}`);
    missing.slice(0, 20).forEach((key) => console.log(`  ${key}`));
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update the database.");
  } else if (missing.length && !process.argv.includes("--force")) {
    console.log("Not updating: copy the missing files first (or pass --force to rewrite anyway).");
    process.exitCode = 1;
  } else {
    for (const { collection, _id, changes } of pending) {
      await collection.updateOne({ _id }, { $set: changes });
    }
    console.log(`Updated ${pending.length} documents.`);
  }

  await mongoose.disconnect();
};

const verify = async () => {
  const target = targetConfig();
  const pattern = sourceUrlPattern();
  const publicPattern = new RegExp(
    `${escapeRegExp(target.publicUrl)}/([^\\s"'<>?#)]+)`,
    "g"
  );
  const db = await connect();

  let remainingS3 = 0;
  const targetUrls = new Map();

  await forEachDocument(db, async (collection, doc) => {
    replaceDeep(doc, (text) => {
      remainingS3 += (text.match(pattern) || []).length;
      for (const match of text.matchAll(publicPattern)) {
        targetUrls.set(decodeKey(match[1]), match[0]);
      }
      return text;
    });
  });
  await mongoose.disconnect();

  const missing = [];
  await runPool([...targetUrls.keys()], async (key) => {
    if (!(await headObject(target, key))) missing.push(key);
  });

  const unreachable = [];
  for (const url of [...targetUrls.values()].slice(0, PUBLIC_CHECK_SAMPLE)) {
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
      await res.body?.cancel();
      if (!res.ok) unreachable.push(`${url} (HTTP ${res.status})`);
    } catch (err) {
      unreachable.push(`${url} (${err.message})`);
    }
  }

  console.log(`S3 links still in the database: ${remainingS3}`);
  console.log(`Links to ${target.publicUrl}: ${targetUrls.size}, missing files: ${missing.length}`);
  missing.slice(0, 20).forEach((key) => console.log(`  missing ${key}`));
  console.log(
    `Public URL check (${Math.min(PUBLIC_CHECK_SAMPLE, targetUrls.size)} sampled): ${unreachable.length} failed`
  );
  unreachable.forEach((line) => console.log(`  ${line}`));

  if (remainingS3 || missing.length || unreachable.length) {
    process.exitCode = 1;
  } else {
    console.log("All good: every stored file link points at the new storage and resolves.");
  }
};

const main = async () => {
  const command = process.argv[2];
  if (command === "copy") return copy();
  if (command === "rewrite") return rewrite(process.argv.includes("--apply"));
  if (command === "verify") return verify();
  console.log("Usage: node scripts/migrateUploadsToR2.js <copy|rewrite [--apply]|verify>");
  process.exitCode = 1;
};

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

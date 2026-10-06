# Moving file uploads from AWS S3 to Cloudflare R2

Uploads (profile pictures, portfolio, verification documents, logos, resumes, blog
images) are stored with `middleware/upload.js`. Setting `STORAGE_ENDPOINT` switches
it from AWS S3 to any S3-compatible provider; stored file links then use
`STORAGE_PUBLIC_URL`. Without `STORAGE_ENDPOINT` the existing `AWS_*` settings are used.

Nothing is deleted from AWS by this process. Keep the AWS account active until step 4.

## 1. Cloudflare setup

1. Cloudflare dashboard → **R2 object storage** → **Create bucket**, e.g. `craftbridgejobs-files`
   (leave the location on Automatic, no jurisdiction).
2. Bucket → **Settings** → **Custom Domains** → **Add** → `files.craftbridgejobs.com` →
   **Connect Domain**. Wait until the status is **Active**. Leave the `r2.dev` URL disabled.
3. R2 **Overview** → **API Tokens** → **Manage** → **Create Account API token** with
   **Object Read & Write**, scoped to the new bucket. Copy the **Access Key ID** and
   **Secret Access Key** (the secret is shown once).
4. Note your **Account ID** (shown on the R2 overview page).

## 2. Server `.env`

Add these on the API server, keeping the existing `AWS_*` lines (the copy step reads from AWS):

```
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=<Access Key ID>
STORAGE_SECRET_KEY=<Secret Access Key>
STORAGE_BUCKET=craftbridgejobs-files
STORAGE_PUBLIC_URL=https://files.craftbridgejobs.com
```

## 3. Migrate

Run from the backend folder on the server:

```
git pull
mongodump --uri "$MONGO_URI" --out ~/backup-before-r2     # database backup, if mongodump is installed

node scripts/migrateUploadsToR2.js copy        # copies every file; safe to re-run
pm2 restart 0                                  # new uploads now go to R2
node scripts/migrateUploadsToR2.js copy        # picks up anything uploaded in between
node scripts/migrateUploadsToR2.js rewrite     # dry run: shows what would change
node scripts/migrateUploadsToR2.js rewrite --apply
node scripts/migrateUploadsToR2.js verify
```

- `copy` keeps the same file paths and content types and skips files already in R2.
- `rewrite` replaces every stored S3 link (any collection, any field, including links
  inside blog HTML) with the same path on `STORAGE_PUBLIC_URL`. It refuses to apply if a
  linked file is missing from R2; copy it first.
- `verify` should end with "All good". It checks that no S3 links remain, that every
  linked file exists in R2, and that a sample of public links opens.

Old S3 links keep working while AWS is active, so the site does not break at any point.

## 4. Check, then close AWS

Open a few profiles, local trade pages and an admin verification page and confirm photos
and documents load. After about a week with no problems, empty and delete the S3 bucket
and close the AWS account (this step), then remove the `AWS_*` lines from `.env`.

## Rollback

Before `rewrite --apply`: remove the `STORAGE_*` lines and `pm2 restart 0`.
After it: restore the backup with `mongorestore --drop ~/backup-before-r2`, remove the
`STORAGE_*` lines and restart. Files uploaded to R2 in the meantime would need copying back.

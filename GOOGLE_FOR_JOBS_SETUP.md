# Google for Jobs Implementation Guide

## Overview
This implementation adds Schema.org JobPosting structured data to CraftBridge job pages to make them eligible for Google for Jobs.

## Files Changed

### Frontend Changes
1. **src/pages/JobDetails.jsx**
   - Added `generateJobPostingSchema()` function to dynamically create JSON-LD structured data
   - Injects JSON-LD script into page head when job data loads
   - Includes job title, description, location, salary, employment type, and other relevant fields

### Backend Changes
1. **routes/jobs.js**
   - Added `/sitemap.xml` endpoint to generate XML sitemap for all active jobs
   - Integrated Google Indexing API calls for job creation, updates, and deletions
   - Added automatic URL submission to Google when jobs are created/updated/closed/deleted

2. **services/indexingService.js** (NEW)
   - Service for Google Indexing API integration
   - Functions for single and batch URL submissions
   - Non-blocking calls to avoid slowing down job operations

3. **package.json**
   - Added `googleapis` dependency for Indexing API

### Static Files
1. **public/robots.txt** (NEW)
   - Allows search engine crawling of public job pages
   - Disallows crawling of authenticated routes
   - References the job sitemap

## JSON-LD Schema Example

Here's an example of the generated JSON-LD for a real job:

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Senior Software Engineer",
  "description": "We are looking for an experienced software engineer to join our team...",
  "datePosted": "2026-08-14",
  "validThrough": "2026-09-30",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "Tech Company Nigeria"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Lagos",
      "addressCountry": "NG"
    }
  },
  "applicantLocationRequirements": {
    "@type": "Country",
    "name": "NG"
  },
  "jobLocationType": "TELECOMMUTE",
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "NGN",
    "value": {
      "@type": "QuantitativeValue",
      "minValue": 150000,
      "maxValue": 250000,
      "unitText": "MONTH"
    }
  },
  "experienceRequirements": {
    "@type": "OccupationalExperienceRequirements",
    "monthsOfExperience": "3-5_years"
  },
  "directApply": true
}
```

## Schema Validation

The schema is designed to match Google's JobPosting requirements:
- ✅ Required fields: title, description, datePosted, hiringOrganization, jobLocation
- ✅ Employment type mapped to Schema.org values
- ✅ Location formatted as PostalAddress
- ✅ Salary in proper currency format (NGN)
- ✅ Only includes optional fields when data exists
- ✅ Expired jobs (closed/deleted) are not shown as active
- ✅ Non-active companies are excluded from job listings

## Google Search Console Setup Steps

### 1. Verify Property Ownership
- Go to [Google Search Console](https://search.google.com/search-console)
- Add your domain property: `craftbridgejobs.com`
- Verify ownership via DNS record or HTML file upload

### 2. Submit Sitemap
- Navigate to "Sitemaps" in Search Console
- Submit your sitemap URL: `https://craftbridgejobs.com/api/jobs/sitemap.xml`
- Wait for Google to process the sitemap (usually 24-48 hours)

### 3. Configure Google Indexing API (Optional but Recommended)
1. Create a Google Cloud Project
2. Enable the Indexing API
3. Create a service account
4. Download the service account key JSON file
5. Add the following environment variable to your backend:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/path/to/service-account-key.json
   FRONTEND_URL=https://craftbridgejobs.com
   ```
6. Verify the service account has Indexing API permissions

### 4. Monitor Performance
- Use the "Job Posting" report in Search Console to monitor:
  - Number of job postings indexed
  - Any validation errors
  - Search performance metrics

### 5. Request Indexing for Existing Jobs
- Use the "URL Inspection" tool in Search Console
- Submit important job URLs for immediate indexing
- This helps Google discover your structured data faster

## Testing the Implementation

### 1. Test JSON-LD Schema
- Navigate to any public job page
- View page source (Ctrl+U or Cmd+Option+U)
- Search for "application/ld+json"
- Copy the JSON-LD and validate at [Google's Structured Data Testing Tool](https://search.google.com/test/rich-results)

### 2. Test Sitemap
- Visit `https://craftbridgejobs.com/api/jobs/sitemap.xml`
- Verify it returns valid XML with all active job URLs
- Check that jobs from inactive companies are excluded

### 3. Test Robots.txt
- Visit `https://craftbridgejobs.com/robots.txt`
- Verify it allows crawling of job pages
- Confirm the sitemap reference is correct

## Important Notes

1. **Expired Jobs**: Jobs with status "closed" or "suspended" are excluded from the sitemap and not submitted to Google
2. **Inactive Companies**: Jobs from companies with `isActive: false` are excluded
3. **Salary Format**: Only salary ranges in format "₦50,000 - ₦100,000" will be parsed for structured data
4. **Work Mode**: Jobs marked as "Remote" will include `jobLocationType: "TELECOMMUTE"`
5. **CraftBridge Recruitment**: Jobs from this company show as "Recruiting through CraftBridge" in hiring organization

## Troubleshooting

### Jobs Not Appearing in Google for Jobs
1. Check Search Console for validation errors
2. Ensure job status is "active" and company is verified
3. Verify the JSON-LD is present on the page
4. Check that the sitemap is being processed

### Schema Validation Errors
1. Review the JSON-LD output in browser DevTools
2. Test with Google's Structured Data Testing Tool
3. Ensure all required fields are present
4. Check for date format issues (must be ISO format)

### Indexing API Not Working
1. Verify GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set
2. Check that the service account has Indexing API permissions
3. Review backend logs for API errors
4. Ensure the service account key file exists and is readable

## Rate Limits

Google Indexing API has rate limits:
- 600 requests per minute
- 100,000 requests per day

The implementation includes rate limiting by:
- Making non-blocking calls
- Adding 100ms delays between batch submissions
- Gracefully handling API failures

## Future Enhancements

1. Add rich snippets for salary ranges in search results
2. Implement job application tracking via structured data
3. Add job posting expiration warnings
4. Create dedicated job category pages with structured data
5. Implement Google Job Posting markup for job aggregators
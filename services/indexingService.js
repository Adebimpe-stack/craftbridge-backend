const { google } = require('googleapis');

/**
 * Google Indexing API Service
 * This service provides functionality to submit URLs to Google's Indexing API
 * for faster indexing of job postings.
 */

// Initialize Google Indexing API client
const getIndexingClient = () => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    return google.indexing({
      version: 'v3',
      auth: auth
    });
  } catch (error) {
    console.error('Error initializing Google Indexing client:', error);
    return null;
  }
};

/**
 * Submit a URL to Google Indexing API
 * @param {string} url - The URL to submit
 * @param {string} type - 'URL_UPDATED' or 'URL_DELETED'
 */
const submitUrlToIndexing = async (url, type = 'URL_UPDATED') => {
  try {
    const indexing = getIndexingClient();
    if (!indexing) {
      console.log('Google Indexing client not initialized. Skipping URL submission.');
      return false;
    }

    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: type
      }
    });

    console.log(`Successfully submitted ${type} for URL: ${url}`, response.data);
    return true;
  } catch (error) {
    console.error(`Error submitting URL to Google Indexing API: ${url}`, error);
    return false;
  }
};

/**
 * Submit a job posting URL for indexing
 * @param {string} jobId - The job ID
 * @param {string} type - 'URL_UPDATED' or 'URL_DELETED'
 */
const submitJobForIndexing = async (jobId, type = 'URL_UPDATED') => {
  const baseUrl = process.env.FRONTEND_URL || 'https://craftbridgejobs.com';
  const jobUrl = `${baseUrl}/jobs/${jobId}`;
  
  return await submitUrlToIndexing(jobUrl, type);
};

/**
 * Batch submit multiple job URLs for indexing
 * @param {Array<string>} jobIds - Array of job IDs
 * @param {string} type - 'URL_UPDATED' or 'URL_DELETED'
 */
const batchSubmitJobsForIndexing = async (jobIds, type = 'URL_UPDATED') => {
  const results = [];
  
  for (const jobId of jobIds) {
    const result = await submitJobForIndexing(jobId, type);
    results.push({ jobId, success: result });
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};

module.exports = {
  submitUrlToIndexing,
  submitJobForIndexing,
  batchSubmitJobsForIndexing
};
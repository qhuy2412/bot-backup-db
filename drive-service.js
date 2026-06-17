const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  config.drive.clientId,
  config.drive.clientSecret,
  'https://developers.google.com/oauthplayground' // Redirect URL
);

oauth2Client.setCredentials({
  refresh_token: config.drive.refreshToken
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Upload a local backup file to Google Drive.
 * @param {string} localPath Path to the local backup file
 * @returns {Promise<{ id: string, name: string }>} Resolves with the created file metadata
 */
async function uploadToDrive(localPath) {
  const fileName = path.basename(localPath);
  logger.info(`Uploading file to Google Drive: ${fileName}...`);

  const fileMetadata = {
    name: fileName,
    parents: [config.drive.folderId]
  };

  const media = {
    mimeType: 'application/gzip',
    body: fs.createReadStream(localPath)
  };

  try {
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });

    logger.info(`Successfully uploaded to Google Drive. File ID: ${response.data.id} | Name: ${response.data.name}`);
    return {
      id: response.data.id,
      name: response.data.name
    };
  } catch (error) {
    logger.error(`Failed to upload to Google Drive: ${error.message}`);
    throw error;
  }
}

module.exports = { uploadToDrive };

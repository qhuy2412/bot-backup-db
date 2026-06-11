const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { exec } = require('child_process');
const cron = require('node-cron');
const { google } = require('googleapis');
const { cleanOldBackups } = require('./utils');

// Init Google Drive API via OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // Redirect URL
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function startBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${process.env.DB_NAME}-backup-${timestamp}.gz`;
    const localPath = path.join(__dirname, fileName);

    console.log(`[${new Date().toLocaleString()}] Starting connect to DB host....`);

    try {
        // Dump database command (using ProxySQL port and flags)
        const dumpPort = process.env.DB_PORT || 6033;

        const dumpCommand = `mysqldump -h ${process.env.DB_HOST} -P ${dumpPort} -u ${process.env.DB_USER} -p${process.env.DB_PASS} --set-gtid-purged=OFF --column-statistics=0 ${process.env.DB_NAME} | gzip > ${localPath}`;

        // Call tool to backup database
        await new Promise((resolve, reject) => {
            exec(dumpCommand, (error) => (error ? reject(error) : resolve()));
        });

        console.log(`Created temp compressed file in: ${fileName}`);

        //Stream file to Google Drive
        console.log('Uploading to Google Drive...');
        const fileMetadata = { name: fileName, parents: [process.env.DRIVE_FOLDER_ID] };
        const media = { mimeType: 'application/gzip', body: fs.createReadStream(localPath) };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name',
        });

        console.log(`Uploaded file ID: ${response.data.id} | Name: ${response.data.name}`);
    } catch (error) {
        console.error(`Error when backing up DB`, error.message);
        throw error;
    } finally {
        console.log(`Backup file saved locally at: ${localPath}`);

        // Deleting old backup over 7 days
        try {
            cleanOldBackups(__dirname, process.env.DB_NAME, 7);
        } catch (cleanErr) {
            console.error('Failed to clean old backups:', cleanErr.message);
        }
    }
};

// CRON JOB

console.log(`Starting backup scheduler (every day)`);

cron.schedule(process.env.CRON_SCHEDULE || '0 * * * *', () => {
    console.log(`
    ----------------------------------------
    CRON TRIGGERED: Starting backup process
    ----------------------------------------`);

    startBackup().catch(error => {
        console.error('Backup failed:', error.message);
    });
});

// Chạy test lập tức
console.log("Triggering manual test run...");
startBackup().catch(console.error);


const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { exec } = require('child_process');
const mysql = require('mysql2/promise');
const { google } = require('googleapis');
const { cleanOldBackups } = require('./utils');
const logger = require('./logger');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  ssl: process.env.DB_SSL === 'true' ? {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  } : null,
};

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
    const fileName = `${process.env.DB_NAME}-backup-${timestamp}.sql.gz`;
    const localPath = path.join(__dirname, fileName);

    logger.info(`Starting connect to DB host....`);

    try {
        // Dump database command (using ProxySQL port and flags)
        const dumpPort = process.env.DB_PORT || 6033;

        const dumpCommand = `mysqldump -h ${process.env.DB_HOST} -P ${dumpPort} -u ${process.env.DB_USER} -p${process.env.DB_PASS} --single-transaction --set-gtid-purged=OFF --column-statistics=0 ${process.env.DB_NAME} | gzip > ${localPath}`;

        // Call tool to backup database
        await new Promise((resolve, reject) => {
            exec(dumpCommand, (error) => (error ? reject(error) : resolve()));
        });

        logger.info(`Created temp compressed file in: ${fileName}`);

        //Stream file to Google Drive
        logger.info('Uploading to Google Drive...');
        const fileMetadata = { name: fileName, parents: [process.env.DRIVE_FOLDER_ID] };
        const media = { mimeType: 'application/gzip', body: fs.createReadStream(localPath) };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name',
        });

        logger.info(`Uploaded file ID: ${response.data.id} | Name: ${response.data.name}`);
    } catch (error) {
        logger.error(`Error when backing up DB: ${error.message}`);
        throw error;
    } finally {
        logger.info(`Backup file saved locally at: ${localPath}`);

        // Deleting old backup over 7 days
        try {
            cleanOldBackups(__dirname, process.env.DB_NAME, 7);
        } catch (cleanErr) {
            logger.error(`Failed to clean old backups: ${cleanErr.message}`);
        }

        logger.info("Backup workflow completed successfully.");
    }
}

const pollAndExecuteBackup = async () => {
  let conn;
  let jobId = null;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id FROM job_queue
       WHERE job_type = 'db_backup' AND status = 'PENDING' AND run_at <= NOW()
       LIMIT 1 FOR UPDATE SKIP LOCKED`
    );
    if (rows.length === 0) {
      await conn.commit();
      return;
    }

    jobId = rows[0].id;
    await conn.execute(
      `UPDATE job_queue SET status = 'RUNNING', started_at = NOW() WHERE id = ?`, [jobId]
    );
    await conn.commit();

    logger.info(`[Queue] Claimed backup job ID: ${jobId}. Starting backup execution.`);
    // Execute actual backup
    await startBackup();

    await conn.execute(
      `UPDATE job_queue SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?`, [jobId]
    );
    logger.info(`[Queue] Backup job ID: ${jobId} completed successfully.`);
  } catch (err) {
    logger.error(`[Queue] Backup job failed: ${err.message}`);
    if (jobId && conn) {
      try {
        await conn.execute(
          `UPDATE job_queue SET status = 'FAILED', error_message = ?, completed_at = NOW() WHERE id = ?`,
          [err.message, jobId]
        );
      } catch (dbErr) {
        logger.error(`[Queue] Failed to update job status to FAILED in DB: ${dbErr.message}`);
      }
    }
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch (_) {}
    }
  }
};

logger.info(`Starting backup queue worker (polling every 60s)`);
setInterval(pollAndExecuteBackup, 60 * 1000);
pollAndExecuteBackup(); // Run immediately on startup

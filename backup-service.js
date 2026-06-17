const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const { dumpDatabase } = require('./db-service');
const { uploadToDrive } = require('./drive-service');
const { startQueueWorker } = require('./queue-service');
const { cleanOldBackups } = require('./utils');

/**
 * Main database backup workflow:
 * 1. Dumps the database into a gzipped file.
 * 2. Uploads the file to Google Drive.
 * 3. Removes failed files if any errors occur.
 * 4. Runs utility to clean up older local backups.
 */
async function runBackupWorkflow() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${config.db.database}-backup-${timestamp}.sql.gz`;
  const localPath = path.join(__dirname, fileName);

  try {
    // 1. Dump Database
    await dumpDatabase(localPath);

    // 2. Upload to Google Drive
    await uploadToDrive(localPath);

    logger.info(`Backup workflow completed successfully for file: ${fileName}`);
  } catch (error) {
    logger.error(`Backup workflow failed: ${error.message}`);
    
    // Clean up the incomplete/corrupt local file on failure
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        logger.info(`Removed failed/incomplete local backup file: ${fileName}`);
      }
    } catch (cleanupErr) {
      logger.error(`Failed to clean up corrupt backup file: ${cleanupErr.message}`);
    }
    
    // Re-throw so the queue service can mark the job as FAILED
    throw error;
  } finally {
    // 3. Clean up local backups older than retention days
    try {
      cleanOldBackups(__dirname, config.db.database, config.backup.retentionDays);
    } catch (cleanErr) {
      logger.error(`Failed to clean old backups: ${cleanErr.message}`);
    }
  }
}

// Bootstrap the queue worker
startQueueWorker(runBackupWorkflow);

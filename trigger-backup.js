const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const { dumpDatabase } = require('./db-service');
const { uploadToDrive } = require('./drive-service');
const { cleanOldBackups } = require('./utils');

/**
 * Manually trigger the backup process immediately and exit the script on completion/failure.
 */
async function triggerDirectBackup() {
  logger.info("Manual backup trigger initiated directly on server...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${config.db.database}-backup-${timestamp}.sql.gz`;
  const localPath = path.join(__dirname, fileName);

  try {
    // 1. Dump Database
    await dumpDatabase(localPath);

    // 2. Upload to Google Drive
    await uploadToDrive(localPath);

    logger.info(`Manual backup completed successfully for file: ${fileName}`);
    process.exit(0);
  } catch (error) {
    logger.error(`Manual backup failed: ${error.message}`);
    
    // Clean up partial local files
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        logger.info(`Removed failed/incomplete local backup file: ${fileName}`);
      }
    } catch (cleanupErr) {
      logger.error(`Failed to clean up corrupt backup file: ${cleanupErr.message}`);
    }
    process.exit(1);
  } finally {
    // 3. Clean up local backups older than retention days
    try {
      cleanOldBackups(__dirname, config.db.database, config.backup.retentionDays);
    } catch (cleanErr) {
      logger.error(`Failed to clean old backups: ${cleanErr.message}`);
    }
  }
}

// Execute backup directly
triggerDirectBackup();

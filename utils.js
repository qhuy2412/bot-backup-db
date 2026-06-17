const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Clean up local backup files older than a specified number of days.
 * @param {string} backupDir The directory containing backup files
 * @param {string} dbName Name of the database to identify backup files
 * @param {number} retentionDays Number of days to keep backup files
 */
function cleanOldBackups(backupDir, dbName, retentionDays = 7) {
  logger.info(`Checking for local backups older than ${retentionDays} days in: ${backupDir}...`);
  
  try {
    if (!fs.existsSync(backupDir)) {
      logger.warn(`Backup directory does not exist: ${backupDir}`);
      return;
    }

    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      // Look for files matching the database backup pattern
      if (file.startsWith(dbName) && file.endsWith('.gz')) {
        const filePath = path.join(backupDir, file);
        try {
          const stats = fs.statSync(filePath);
          const ageInDays = (now - stats.mtimeMs) / msInDay;

          if (ageInDays > retentionDays) {
            fs.unlinkSync(filePath);
            logger.info(`Deleted old local backup file: ${file}`);
            deletedCount++;
          }
        } catch (fileErr) {
          logger.error(`Error processing file ${file} during cleanup: ${fileErr.message}`);
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleanup complete. Removed ${deletedCount} old backup(s) from server.`);
    } else {
      logger.info(`Cleanup complete. No old backups found to remove.`);
    }
  } catch (err) {
    logger.error(`Failed to clean old backups: ${err.message}`);
  }
}

module.exports = { cleanOldBackups };

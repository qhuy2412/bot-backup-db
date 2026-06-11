const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function cleanOldBackups(backupDir, dbName, retentionDays = 7) {
    logger.info(`Checking for local backups older than ${retentionDays} days...`);
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    for (const file of files) {
        if (file.startsWith(dbName) && file.endsWith('.gz')) {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            const ageInDays = (now - stats.mtimeMs) / msInDay;

            if (ageInDays > retentionDays) {
                fs.unlinkSync(filePath);
                logger.info(`Deleted old local backup file: ${file}`);
                deletedCount++;
            }
        }
    }
    if (deletedCount > 0) {
        logger.info(`Cleanup complete. Removed ${deletedCount} old backup(s) from server.`);
    }
}

module.exports = { cleanOldBackups };

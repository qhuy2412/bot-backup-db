const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

/**
 * Dump database schema and data using mysqldump and pipe to gzip.
 * Securely passes the DB password via the MYSQL_PWD environment variable.
 * @param {string} localPath Destination file path (.sql.gz)
 * @returns {Promise<void>}
 */
function dumpDatabase(localPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Starting database dump to ${path.basename(localPath)}...`);

    const dumpPort = config.db.port;
    const dumpHost = config.db.host;
    const dumpUser = config.db.user;
    const dumpDb = config.db.database;

    // Use environment variable MYSQL_PWD to avoid exposing password in CLI args
    const dumpCommand = `mysqldump -h ${dumpHost} -P ${dumpPort} -u ${dumpUser} --single-transaction --set-gtid-purged=OFF --column-statistics=0 ${dumpDb} | gzip > "${localPath}"`;

    // Clone env and inject MYSQL_PWD
    const childEnv = { ...process.env, MYSQL_PWD: config.db.password };

    exec(dumpCommand, { env: childEnv }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Database dump execution failed: ${error.message}`);
        if (stderr) {
          logger.error(`mysqldump stderr: ${stderr}`);
        }
        return reject(error);
      }

      // Verify file exists and is not empty
      try {
        if (!fs.existsSync(localPath)) {
          return reject(new Error(`Backup file was not created: ${localPath}`));
        }
        const stats = fs.statSync(localPath);
        if (stats.size === 0) {
          return reject(new Error(`Backup file is empty (0 bytes): ${localPath}`));
        }
        logger.info(`Successfully created database dump (Size: ${stats.size} bytes)`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { dumpDatabase };

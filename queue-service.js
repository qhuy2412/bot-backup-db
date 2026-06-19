const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('./logger');

const queueDbConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  ssl: config.db.ssl,
  user: config.queue.user,
  password: config.queue.password,
};

async function pollAndExecuteJob(executeBackupCallback) {
  let conn;
  let jobId = null;
  try {
    conn = await mysql.createConnection(queueDbConfig);
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
      `UPDATE job_queue SET status = 'RUNNING', started_at = NOW() WHERE id = ?`,
      [jobId]
    );
    await conn.commit();

    logger.info(`[Queue] Claimed backup job ID: ${jobId}. Starting backup execution.`);

    // Execute the actual backup workflow passed from orchestrator
    await executeBackupCallback();

    // Mark job as completed
    await conn.execute(
      `UPDATE job_queue SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?`,
      [jobId]
    );
    logger.info(`[Queue] Backup job ID: ${jobId} completed successfully.`);
  } catch (err) {
    if (jobId) {
      logger.error(`[Queue] Backup job ID: ${jobId} failed: ${err.message}`);
      if (conn) {
        try {
          await conn.execute(
            `UPDATE job_queue SET status = 'FAILED', error_message = ?, completed_at = NOW() WHERE id = ?`,
            [err.message.substring(0, 500), jobId] // Limit error message length
          );
        } catch (dbErr) {
          logger.error(`[Queue] Failed to update job status to FAILED in DB: ${dbErr.message}`);
        }
      }
    } else {
      if (err.message && err.message.includes('--read-only')) {
        logger.info(`[Queue] Polling skipped: MySQL server is read-only.`);
      } else {
        logger.error(`[Queue] Polling error: ${err.message}`);
      }
    }
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch (_) {}
    }
  }
}

function startQueueWorker(executeBackupCallback) {
  logger.info(`Starting backup queue worker (polling every ${config.queue.pollIntervalMs / 1000}s)`);
  
  const poll = async () => {
    try {
      await pollAndExecuteJob(executeBackupCallback);
    } catch (err) {
      logger.error(`[Queue] Polling cycle error: ${err.message}`);
    }
  };

  // Run immediately on startup
  poll();

  // Run on interval
  return setInterval(poll, config.queue.pollIntervalMs);
}

module.exports = { startQueueWorker };

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const requiredEnv = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'DRIVE_FOLDER_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN'
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

module.exports = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 6033,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    } : null,
  },
  queue: {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 60000,
  },
  drive: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    folderId: process.env.DRIVE_FOLDER_ID,
  },
  backup: {
    retentionDays: parseInt(process.env.RETENTION_DAYS, 10) || 7,
  }
};

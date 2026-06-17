const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  console.error(`Failed to create log directory ${logDir}:`, err.message);
}

const logFile = path.join(logDir, 'backup.log');

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
}

function writeLog(level, message) {
  const formattedMessage = formatMessage(level, message);
  
  if (level === 'error') {
    console.error(formattedMessage.trim());
  } else {
    console.log(formattedMessage.trim());
  }

  try {
    fs.appendFileSync(logFile, formattedMessage);
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

const logger = {
  info: (message) => writeLog('info', message),
  error: (message) => writeLog('error', message),
  warn: (message) => writeLog('warn', message),
};

module.exports = logger;

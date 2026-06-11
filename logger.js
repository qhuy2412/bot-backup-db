const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, 'backup.log');

function formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
}

function writeLog(level, message) {
    const formattedMessage = formatMessage(level, message);
    
    // In ra màn hình console (để dễ theo dõi trực tiếp)
    if (level === 'error') {
        console.error(formattedMessage.trim());
    } else {
        console.log(formattedMessage.trim());
    }

    // Ghi lưu vào file
    fs.appendFileSync(logFile, formattedMessage);
}

const logger = {
    info: (message) => writeLog('info', message),
    error: (message) => writeLog('error', message),
    warn: (message) => writeLog('warn', message),
};

module.exports = logger;

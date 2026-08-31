// In-Memory Live Logs Buffer
const MAX_LOGS = 200;
let liveLogs = [];

function addLog(level, message, details = null) {
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const entry = {
    id: Date.now() + Math.random(),
    timestamp,
    level, // 'info', 'success', 'warning', 'error'
    message,
    details
  };
  liveLogs.push(entry);
  if (liveLogs.length > MAX_LOGS) {
    liveLogs.shift();
  }
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  return entry;
}

function getLogs() {
  return liveLogs;
}

function clearLogs() {
  liveLogs = [];
  addLog('info', 'Log aktivitas telah dikosongkan.');
}

module.exports = {
  addLog,
  getLogs,
  clearLogs
};

const EventEmitter = require('events');
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(100);

// In-Memory Live Logs Buffers
const MAX_LOGS = 200;
let stokpoinLogs = [];
let iasLogs = [];

// 1. Logs khusus CMS StokPoin (Marmin Guard, DB PostgreSQL, Jadwal Harian)
function addLog(level, message, details = null) {
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const entry = {
    id: Date.now() + Math.random(),
    timestamp,
    level, // 'info', 'success', 'warning', 'error'
    message,
    details
  };
  stokpoinLogs.push(entry);
  if (stokpoinLogs.length > MAX_LOGS) {
    stokpoinLogs.shift();
  }
  console.log(`[${timestamp}] [STOKPOIN] [${level.toUpperCase()}] ${message}`);
  logEmitter.emit('stokpoin-log', entry);
  return entry;
}

function getLogs() {
  return stokpoinLogs;
}

function clearLogs() {
  stokpoinLogs = [];
  logEmitter.emit('stokpoin-clear');
  addLog('info', 'Log aktivitas CMS StokPoin telah dibersihkan.');
}

// 2. Logs khusus Otomasi Web IAS (Login, Hitstok, LPP)
function addIasLog(level, message, details = null) {
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const entry = {
    id: Date.now() + Math.random(),
    timestamp,
    level, // 'info', 'success', 'warning', 'error'
    message,
    details
  };
  iasLogs.push(entry);
  if (iasLogs.length > MAX_LOGS) {
    iasLogs.shift();
  }
  console.log(`[${timestamp}] [WEB IAS] [${level.toUpperCase()}] ${message}`);
  logEmitter.emit('ias-log', entry);
  return entry;
}

function getIasLogs() {
  return iasLogs;
}

function clearIasLogs() {
  iasLogs = [];
  logEmitter.emit('ias-clear');
  addIasLog('info', 'Log aktivitas Web IAS telah dibersihkan.');
}

module.exports = {
  addLog,
  getLogs,
  clearLogs,
  addIasLog,
  getIasLogs,
  clearIasLogs,
  logEmitter
};


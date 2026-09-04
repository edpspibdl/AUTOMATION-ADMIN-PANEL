const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { logEmitter } = require('../utils/logger');

const SERVICES_FILE = path.join(__dirname, '../../services.json');
const SERVICES_EXAMPLE_FILE = path.join(__dirname, '../../services.example.json');

// In-memory runtime state for services
// Map<serviceId, { child, pid, startTime, status: 'RUNNING'|'STOPPED'|'CRASHED', logs: [], manualStop: boolean, restartCount: number }>
const activeProcesses = new Map();
const MAX_SERVICE_LOGS = 300;

// Format duration helper (e.g. "2j 15m 30d")
function formatUptime(ms) {
  if (!ms || ms < 0) return '0d';
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0 || days > 0) parts.push(`${hours}j`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}d`);
  return parts.join(' ');
}

// 1. Data Persistence
function loadServices() {
  try {
    if (fs.existsSync(SERVICES_FILE)) {
      const data = fs.readFileSync(SERVICES_FILE, 'utf-8');
      return JSON.parse(data);
    } else if (fs.existsSync(SERVICES_EXAMPLE_FILE)) {
      const exampleData = fs.readFileSync(SERVICES_EXAMPLE_FILE, 'utf-8');
      fs.writeFileSync(SERVICES_FILE, exampleData, 'utf-8');
      return JSON.parse(exampleData);
    }
  } catch (err) {
    console.error('Gagal membaca services.json:', err.message);
  }
  return [];
}

function saveServices(services) {
  try {
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Gagal menyimpan services.json:', err.message);
    return false;
  }
}

// 2. Service CRUD
function getServices() {
  const list = loadServices();
  return list.map(srv => {
    const runtime = activeProcesses.get(srv.id);
    const isRunning = runtime && runtime.status === 'RUNNING';
    const uptimeMs = isRunning && runtime.startTime ? Date.now() - runtime.startTime : 0;

    return {
      ...srv,
      status: runtime ? runtime.status : 'STOPPED',
      pid: runtime && runtime.pid ? runtime.pid : null,
      startTime: runtime ? runtime.startTime : null,
      uptime: uptimeMs,
      uptimeFormatted: isRunning ? formatUptime(uptimeMs) : '-',
      logCount: runtime ? runtime.logs.length : 0
    };
  });
}

function getServiceById(id) {
  const services = loadServices();
  const srv = services.find(s => s.id === id);
  if (!srv) return null;

  const runtime = activeProcesses.get(id);
  const isRunning = runtime && runtime.status === 'RUNNING';
  const uptimeMs = isRunning && runtime.startTime ? Date.now() - runtime.startTime : 0;

  return {
    ...srv,
    status: runtime ? runtime.status : 'STOPPED',
    pid: runtime && runtime.pid ? runtime.pid : null,
    startTime: runtime ? runtime.startTime : null,
    uptime: uptimeMs,
    uptimeFormatted: isRunning ? formatUptime(uptimeMs) : '-',
    logs: runtime ? runtime.logs : []
  };
}

function addService(data) {
  const services = loadServices();
  const newService = {
    id: 'srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    name: (data.name || 'Unnamed Service').trim(),
    description: (data.description || '').trim(),
    command: (data.command || '').trim(),
    cwd: (data.cwd || '').trim(),
    autoStart: Boolean(data.autoStart),
    autoRestart: data.autoRestart !== undefined ? Boolean(data.autoRestart) : true,
    createdAt: new Date().toISOString()
  };

  services.push(newService);
  saveServices(services);
  return newService;
}

function updateService(id, data) {
  const services = loadServices();
  const idx = services.findIndex(s => s.id === id);
  if (idx === -1) return null;

  services[idx] = {
    ...services[idx],
    name: data.name !== undefined ? data.name.trim() : services[idx].name,
    description: data.description !== undefined ? data.description.trim() : services[idx].description,
    command: data.command !== undefined ? data.command.trim() : services[idx].command,
    cwd: data.cwd !== undefined ? data.cwd.trim() : services[idx].cwd,
    autoStart: data.autoStart !== undefined ? Boolean(data.autoStart) : services[idx].autoStart,
    autoRestart: data.autoRestart !== undefined ? Boolean(data.autoRestart) : services[idx].autoRestart
  };

  saveServices(services);
  return services[idx];
}

function deleteService(id) {
  stopService(id);
  const services = loadServices();
  const filtered = services.filter(s => s.id !== id);
  saveServices(filtered);
  activeProcesses.delete(id);
  return true;
}

// 3. Process Execution & Management
function appendLog(serviceId, text, type = 'info') {
  let runtime = activeProcesses.get(serviceId);
  if (!runtime) {
    runtime = { status: 'STOPPED', logs: [] };
    activeProcesses.set(serviceId, runtime);
  }

  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const entry = {
    time,
    type, // 'info', 'stdout', 'stderr', 'system', 'error'
    text: text.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  };

  runtime.logs.push(entry);
  if (runtime.logs.length > MAX_SERVICE_LOGS) {
    runtime.logs.shift();
  }

  // Emit realtime event
  logEmitter.emit('service-log', {
    serviceId,
    log: entry
  });
}

function startService(id) {
  const services = loadServices();
  const srv = services.find(s => s.id === id);
  if (!srv) {
    return { success: false, error: 'Service tidak ditemukan.' };
  }

  const existing = activeProcesses.get(id);
  if (existing && existing.status === 'RUNNING') {
    return { success: false, error: 'Service sudah berjalan.' };
  }

  const workingDir = srv.cwd && srv.cwd.trim() !== ''
    ? path.resolve(srv.cwd)
    : path.resolve(__dirname, '../../');

  appendLog(id, `🚀 Memulai service: "${srv.name}" (Perintah: ${srv.command})...`, 'system');

  try {
    const child = spawn(srv.command, {
      shell: true,
      cwd: workingDir,
      env: { ...process.env },
      windowsHide: true
    });

    const runtime = {
      child,
      pid: child.pid,
      startTime: Date.now(),
      status: 'RUNNING',
      manualStop: false,
      restartCount: existing ? (existing.restartCount || 0) : 0,
      logs: existing ? existing.logs : []
    };

    activeProcesses.set(id, runtime);
    appendLog(id, `🟢 Service aktif dengan PID: ${child.pid} di folder: ${workingDir}`, 'system');
    logEmitter.emit('service-status', { serviceId: id, status: 'RUNNING', pid: child.pid });

    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trimEnd();
        if (trimmed) appendLog(id, trimmed, 'stdout');
      });
    });

    child.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trimEnd();
        if (trimmed) appendLog(id, trimmed, 'stderr');
      });
    });

    child.on('error', (err) => {
      appendLog(id, `❌ Error proses: ${err.message}`, 'error');
      runtime.status = 'CRASHED';
      logEmitter.emit('service-status', { serviceId: id, status: 'CRASHED' });
    });

    child.on('exit', (code, signal) => {
      const exitMsg = `⏹️ Service berhenti (Exit Code: ${code !== null ? code : 'null'}, Signal: ${signal || 'none'}).`;
      appendLog(id, exitMsg, 'system');

      const isManual = runtime.manualStop;
      runtime.status = isManual || code === 0 ? 'STOPPED' : 'CRASHED';
      runtime.pid = null;

      logEmitter.emit('service-status', { serviceId: id, status: runtime.status });

      // Auto-restart handling if enabled and not stopped manually
      if (!isManual && srv.autoRestart && code !== 0) {
        if (runtime.restartCount < 5) {
          runtime.restartCount++;
          appendLog(id, `⚠️ Auto-restart aktif! Mencoba menjalankan ulang dalam 3 detik (Percobaan ${runtime.restartCount}/5)...`, 'system');
          setTimeout(() => {
            if (activeProcesses.has(id) && activeProcesses.get(id).status !== 'RUNNING') {
              startService(id);
            }
          }, 3000);
        } else {
          appendLog(id, `🛑 Auto-restart dibatalkan: telah mencapai batas maksimum kegagalan (5 kali).`, 'error');
        }
      } else {
        runtime.restartCount = 0;
      }
    });

    return { success: true, pid: child.pid };
  } catch (err) {
    appendLog(id, `❌ Gagal menjalankan service: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

function stopService(id) {
  const runtime = activeProcesses.get(id);
  if (!runtime || runtime.status !== 'RUNNING' || !runtime.pid) {
    if (runtime) runtime.status = 'STOPPED';
    return { success: true, message: 'Service sudah berhenti.' };
  }

  runtime.manualStop = true;
  const pid = runtime.pid;
  appendLog(id, `🛑 Menghentikan service (PID: ${pid})...`, 'system');

  try {
    if (os.platform() === 'win32') {
      // Di Windows, gunakan taskkill tree-kill untuk membersihkan proses anak & zombie
      exec(`taskkill /pid ${pid} /T /F`, (err) => {
        if (err) {
          // Fallback ke child.kill jika taskkill gagal
          try { runtime.child.kill('SIGKILL'); } catch (_) {}
        }
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (_) {
        try { runtime.child.kill('SIGTERM'); } catch (_) {}
      }
    }

    runtime.status = 'STOPPED';
    runtime.pid = null;
    logEmitter.emit('service-status', { serviceId: id, status: 'STOPPED' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function restartService(id) {
  stopService(id);
  return new Promise((resolve) => {
    setTimeout(() => {
      const res = startService(id);
      resolve(res);
    }, 1500);
  });
}

function clearServiceLogs(id) {
  const runtime = activeProcesses.get(id);
  if (runtime) {
    runtime.logs = [];
    appendLog(id, 'Log service telah dibersihkan.', 'system');
  }
  return true;
}

function startAllServices() {
  const services = loadServices();
  const results = [];
  services.forEach(srv => {
    results.push({ id: srv.id, result: startService(srv.id) });
  });
  return results;
}

function stopAllServices() {
  const services = loadServices();
  const results = [];
  services.forEach(srv => {
    results.push({ id: srv.id, result: stopService(srv.id) });
  });
  return results;
}

// Inisialisasi service yang memiliki konfigurasi autoStart: true saat server dinyalakan
function initAutoStartServices() {
  const services = loadServices();
  const autoStarts = services.filter(s => s.autoStart);
  if (autoStarts.length === 0) return;

  console.log(`[PROCESS MANAGER] Menjalankan ${autoStarts.length} service auto-start...`);
  autoStarts.forEach(s => {
    setTimeout(() => {
      startService(s.id);
    }, 2000);
  });
}

module.exports = {
  getServices,
  getServiceById,
  addService,
  updateService,
  deleteService,
  startService,
  stopService,
  restartService,
  clearServiceLogs,
  startAllServices,
  stopAllServices,
  initAutoStartServices
};

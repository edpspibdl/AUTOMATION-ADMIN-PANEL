const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { searchStockApi, toggleStockApi, ensureValidSession } = require('./automation_stock');
const { testDbConnection, fetchMarginMinusData, DEFAULT_MARGIN_QUERY } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Live Logs Buffer
const MAX_LOGS = 150;
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

// Config Helpers
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return {
        // Auto-Guard Margin Minus (Setiap 5 Menit Langsung Nonaktifkan jika ada)
        marminGuardEnabled: cfg.marminGuardEnabled ?? true,
        marminIntervalMinutes: parseInt(cfg.marminIntervalMinutes || 5, 10),
        
        // Jadwal Harian Manual (misal Jam 22:00 WIB)
        dailyScheduleEnabled: cfg.dailyScheduleEnabled ?? true,
        dailyScheduleTime: cfg.dailyScheduleTime || '22:00',
        dailyAction: cfg.dailyAction || 'nonaktif',
        
        // Sumber PLU Manual
        plus: cfg.plus || ['0013500'],
        
        // Query & DB Config
        customQuery: cfg.customQuery || DEFAULT_MARGIN_QUERY,
        dbConfig: cfg.dbConfig || {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432', 10),
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
          database: process.env.PG_DATABASE || 'postgres'
        },
        
        lastRun: cfg.lastRun || null,
        lastMarminRun: cfg.lastMarminRun || null
      };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return {
    marminGuardEnabled: true,
    marminIntervalMinutes: 5,
    dailyScheduleEnabled: true,
    dailyScheduleTime: '22:00',
    dailyAction: 'nonaktif',
    plus: ['0013500'],
    customQuery: DEFAULT_MARGIN_QUERY,
    dbConfig: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'postgres'
    },
    lastRun: null,
    lastMarminRun: null
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// Schedulers (Marmin Guard & Daily Manual)
let marminTask = null;
let dailyTask = null;

function setupSchedulers() {
  // Stop existing tasks
  if (marminTask) {
    marminTask.stop();
    marminTask = null;
  }
  if (dailyTask) {
    dailyTask.stop();
    dailyTask = null;
  }

  const config = loadConfig();

  // 1. Setup Auto-Guard Margin Minus (Tiap X Menit)
  if (config.marminGuardEnabled) {
    const mins = config.marminIntervalMinutes || 5;
    const marminCron = `*/${mins} * * * *`;
    addLog('info', `🛡️ [MARMIN GUARD] Aktif! Pengecekan rutin setiap ${mins} menit sekali (Cron: ${marminCron}) -> Langsung nonaktifkan jika terdeteksi.`);

    marminTask = cron.schedule(marminCron, async () => {
      await executeMarminGuard(`Auto-Guard (${mins} Menit)`);
    });
  } else {
    addLog('info', '⏸️ [MARMIN GUARD] Status: NONAKTIF.');
  }

  // 2. Setup Jadwal Harian Manual (misal Jam 22:00 WIB)
  if (config.dailyScheduleEnabled && config.dailyScheduleTime) {
    const [hour, minute] = config.dailyScheduleTime.split(':');
    const dailyCron = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
    addLog('info', `⏰ [JADWAL HARIAN MANUAL] Aktif! Memproses PLU manual setiap hari pukul ${config.dailyScheduleTime} WIB (Cron: ${dailyCron})`);

    dailyTask = cron.schedule(dailyCron, async () => {
      addLog('info', `🚀 [CRON TRIGGER] Memulai eksekusi jadwal harian PLU manual pada pukul ${config.dailyScheduleTime}...`);
      await executeManualAutomation(`Jadwal Harian (${config.dailyScheduleTime} WIB)`);
    });
  } else {
    addLog('info', '⏸️ [JADWAL HARIAN MANUAL] Status: NONAKTIF.');
  }
}

// State
let isRunning = false;

/**
 * 1. EKSEKUSI MARMIN GUARD:
 * Mengecek DB PostgreSQL setiap 5 menit.
 * JIKA ADA DATA -> LANGSUNG DINONAKTIFKAN DI CMS STOKPOIN!
 */
async function executeMarminGuard(triggerSource = 'Auto-Guard') {
  if (isRunning) {
    addLog('warning', `⚠️ [MARMIN GUARD] Sistem sedang sibuk, pengecekan ${triggerSource} ditunda.`);
    return { success: false, message: 'Sistem sedang sibuk.' };
  }

  isRunning = true;
  const config = loadConfig();

  try {
    addLog('info', `🛡️ [MARMIN GUARD] Menjalankan pengecekan margin minus ke database PostgreSQL...`);
    const dbRes = await fetchMarginMinusData(config.dbConfig, config.customQuery);

    if (!dbRes.success) {
      addLog('error', `❌ [MARMIN GUARD] Gagal query ke database: ${dbRes.error}`);
      return { success: false, error: dbRes.error };
    }

    const items = dbRes.items || [];
    const plus = dbRes.plus || [];

    if (items.length === 0) {
      addLog('info', `🛡️ [MARMIN GUARD] Pengecekan selesai: 0 item Margin Minus ditemukan (Kondisi Aman).`);
      config.lastMarminRun = {
        time: new Date().toLocaleString('id-ID'),
        triggerSource,
        foundCount: 0,
        deactivatedCount: 0
      };
      saveConfig(config);
      return { success: true, count: 0 };
    }

    // ADA ITEM MARMIN -> LANGSUNG NONAKTIFKAN DI CMS!
    addLog('warning', `🚨 [MARMIN GUARD] TERDETEKSI ${items.length} ITEM MARGIN MINUS! Memulai proses penonaktifan instan ke CMS StokPoin...`);

    let deactivatedCount = 0;
    for (const item of items) {
      const plu = item.plu;
      addLog('info', `🔍 [MARMIN] Mencari PLU: ${plu} (${item.deskripsi})...`);
      const stockItems = await searchStockApi({ plu });

      if (!stockItems || stockItems.length === 0) {
        addLog('warning', `⚠️ [MARMIN] PLU ${plu} tidak ditemukan di database CMS.`);
        continue;
      }

      for (const s of stockItems) {
        const flag = (s.flag || '').toLowerCase().trim();
        const desc = s.long_description || s.name || item.deskripsi;

        if (flag.includes('aktif') && !flag.includes('non')) {
          addLog('info', `⚡ [MARMIN] Menonaktifkan ID ${s.id} (${plu} - ${desc})...`);
          await toggleStockApi(s.id);
          addLog('success', `✅ [MARMIN] BERHASIL DINONAKTIFKAN: PLU ${plu} (${desc})`);
          deactivatedCount++;
        } else {
          addLog('info', `⏭️ [MARMIN] PLU ${plu} sudah dalam status [${flag.toUpperCase()}].`);
        }
      }
    }

    config.lastMarminRun = {
      time: new Date().toLocaleString('id-ID'),
      triggerSource,
      foundCount: items.length,
      deactivatedCount
    };
    saveConfig(config);

    addLog('success', `🎉 [MARMIN GUARD] Selesai! Berhasil mematikan ${deactivatedCount} dari ${items.length} item margin minus.`);
    return { success: true, items, deactivatedCount };

  } catch (err) {
    addLog('error', `❌ [MARMIN GUARD] Kesalahan: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * 2. EKSEKUSI JADWAL HARIAN MANUAL:
 * Memproses PLU yang diinput manual sesuai jam jadwal (misal jam 22:00 WIB).
 */
async function executeManualAutomation(triggerSource = 'Manual') {
  if (isRunning) {
    addLog('warning', `⚠️ [JADWAL MANUAL] Sistem sedang sibuk, permintaan (${triggerSource}) diabaikan.`);
    return { success: false, message: 'Sistem sedang sibuk.' };
  }

  isRunning = true;
  const config = loadConfig();
  const action = config.dailyAction || 'nonaktif';
  const targetPlus = (config.plus || []).map(p => p.toString().trim()).filter(Boolean);

  addLog('info', `▶️ [JADWAL MANUAL] Mulai eksekusi [${triggerSource}]. Target: ${targetPlus.length} PLU Manual, Aksi: [${action.toUpperCase()}]`);

  if (targetPlus.length === 0) {
    addLog('warning', '⚠️ [JADWAL MANUAL] Daftar PLU manual kosong.');
    isRunning = false;
    return { success: true, message: 'Daftar PLU manual kosong.' };
  }

  const results = [];
  try {
    for (const cleanPlu of targetPlus) {
      addLog('info', `🔍 Mencari PLU: ${cleanPlu}...`);
      const items = await searchStockApi({ plu: cleanPlu });

      if (!items || items.length === 0) {
        addLog('warning', `⚠️ PLU ${cleanPlu} tidak ditemukan di database CMS.`);
        results.push({ plu: cleanPlu, status: 'not_found' });
        continue;
      }

      for (const item of items) {
        const id = item.id;
        const currentFlag = (item.flag || '').toLowerCase().trim();
        const desc = item.long_description || item.name || '-';
        const qty = item.qty || '0';

        let needToggle = false;
        if (action === 'toggle') needToggle = true;
        else if (action === 'nonaktif') needToggle = currentFlag.includes('aktif') && !currentFlag.includes('non');
        else if (action === 'aktif') needToggle = currentFlag.includes('non');

        if (needToggle) {
          addLog('info', `⚡ Mengubah status ID ${id} (${cleanPlu} - ${desc}) ke [${action.toUpperCase()}]...`);
          await toggleStockApi(id);
          addLog('success', `✅ BERHASIL: PLU ${cleanPlu} (${desc}) diubah ke [${action.toUpperCase()}].`);
          results.push({ plu: cleanPlu, desc, qty, status: 'success', action });
        } else {
          addLog('info', `⏭️ Lewati PLU ${cleanPlu}: Sudah dalam status [${currentFlag.toUpperCase()}].`);
          results.push({ plu: cleanPlu, desc, qty, status: 'already_set', currentFlag });
        }
      }
    }

    config.lastRun = {
      time: new Date().toLocaleString('id-ID'),
      triggerSource,
      action,
      totalPlus: targetPlus.length,
      successCount: results.filter(r => r.status === 'success').length
    };
    saveConfig(config);

    addLog('success', `🎉 [JADWAL MANUAL] Selesai! Berhasil memproses ${targetPlus.length} PLU manual.`);
    return { success: true, results };
  } catch (err) {
    addLog('error', `❌ [JADWAL MANUAL] Kesalahan: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isRunning = false;
  }
}

// -----------------------------------------------------------------------------
// REST API ENDPOINTS
// -----------------------------------------------------------------------------

// Get Config
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json({
    ...config,
    isRunning
  });
});

// Update Config
app.post('/api/config', (req, res) => {
  const {
    marminGuardEnabled,
    marminIntervalMinutes,
    dailyScheduleEnabled,
    dailyScheduleTime,
    dailyAction,
    customQuery,
    plus,
    dbConfig
  } = req.body;

  const config = loadConfig();

  if (typeof marminGuardEnabled === 'boolean') config.marminGuardEnabled = marminGuardEnabled;
  if (marminIntervalMinutes) config.marminIntervalMinutes = parseInt(marminIntervalMinutes, 10);
  if (typeof dailyScheduleEnabled === 'boolean') config.dailyScheduleEnabled = dailyScheduleEnabled;
  if (dailyScheduleTime) config.dailyScheduleTime = dailyScheduleTime;
  if (dailyAction) config.dailyAction = dailyAction;
  if (customQuery) config.customQuery = customQuery;
  if (Array.isArray(plus)) config.plus = plus.map(p => p.toString().trim()).filter(Boolean);
  if (dbConfig) config.dbConfig = { ...config.dbConfig, ...dbConfig };

  saveConfig(config);
  setupSchedulers();

  addLog('success', '💾 Pengaturan sistem berhasil disimpan dan penjadwal diperbarui!');
  res.json({ success: true, config });
});

// Database Test Connection
app.post('/api/db/test', async (req, res) => {
  const { dbConfig } = req.body;
  const config = loadConfig();
  const testConfig = dbConfig || config.dbConfig;

  addLog('info', `🐘 Menguji koneksi database PostgreSQL (${testConfig.host}:${testConfig.port}/${testConfig.database})...`);
  const result = await testDbConnection(testConfig);

  if (result.success) {
    addLog('success', `✅ Koneksi PostgreSQL BERHASIL terhubung ke database "${result.database}".`);
    res.json({ success: true, message: `Koneksi berhasil terhubung ke database "${result.database}". Waktu server DB: ${result.time}` });
  } else {
    addLog('error', `❌ Koneksi PostgreSQL GAGAL: ${result.error}`);
    res.status(400).json({ success: false, error: result.error });
  }
});

// Database Query Preview
app.post('/api/db/preview', async (req, res) => {
  const config = loadConfig();
  addLog('info', `🐘 Menjalankan query margin minus untuk melihat pratinjau data...`);
  const result = await fetchMarginMinusData(config.dbConfig, config.customQuery);

  if (result.success) {
    addLog('success', `📊 Query berhasil dijalankan, ditemukan ${result.totalCount} item.`);
    res.json({
      success: true,
      totalCount: result.totalCount,
      items: result.items,
      plus: result.plus
    });
  } else {
    addLog('error', `❌ Query PostgreSQL gagal: ${result.error}`);
    res.status(400).json({ success: false, error: result.error });
  }
});

// Trigger Marmin Guard Now
app.post('/api/run-marmin-now', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ success: false, message: 'Tugas lain sedang berjalan.' });
  }
  executeMarminGuard('Manual Trigger (Web UI)');
  res.json({ success: true, message: 'Pengecekan Margin Minus telah dimulai.' });
});

// Trigger Manual PLU Automation Now
app.post('/api/run-manual-now', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ success: false, message: 'Tugas lain sedang berjalan.' });
  }
  executeManualAutomation('Manual Trigger (Web UI)');
  res.json({ success: true, message: 'Otomatisasi PLU manual telah dimulai.' });
});

// Check PLUs Live Status from CMS
app.post('/api/check-plus', async (req, res) => {
  const { plus } = req.body;
  if (!plus || !Array.isArray(plus) || plus.length === 0) {
    return res.status(400).json({ success: false, message: 'Daftar PLU kosong.' });
  }

  try {
    addLog('info', `🔍 Memeriksa status real-time ${plus.length} PLU di server CMS...`);
    await ensureValidSession();

    const items = [];
    for (const p of plus) {
      const clean = p.toString().trim();
      if (!clean) continue;
      const resItems = await searchStockApi({ plu: clean });
      if (resItems && resItems.length > 0) {
        resItems.forEach(item => {
          items.push({
            plu: clean,
            desc: item.long_description || item.name || '-',
            qty: item.qty || '0',
            flag: item.flag || 'UNKNOWN'
          });
        });
      } else {
        items.push({
          plu: clean,
          desc: '(Tidak Ditemukan)',
          qty: 0,
          flag: 'NOT_FOUND'
        });
      }
    }

    addLog('success', `✅ Pengecekan CMS selesai. ${items.length} item ditemukan.`);
    res.json({ success: true, items });
  } catch (err) {
    addLog('error', `❌ Gagal memeriksa status PLU: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Live Logs
app.get('/api/logs', (req, res) => {
  res.json({
    logs: liveLogs,
    isRunning
  });
});

// Clear Live Logs
app.post('/api/logs/clear', (req, res) => {
  liveLogs = [];
  addLog('info', 'Log telah dibersihkan.');
  res.json({ success: true });
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 StokPoin Automation Dashboard siap dijalankan!`);
  console.log(`🌐 Buka di browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  addLog('info', `Server Web UI berjalan di http://localhost:${PORT}`);
  setupSchedulers();
});

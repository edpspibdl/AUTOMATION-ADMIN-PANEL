const express = require('express');
const router = express.Router();
const { loadConfig, updateConfig } = require('../config/configManager');
const { testDbConnection, fetchMarginMinusData } = require('../database/connection');
const { executeMarminGuard } = require('../schedulers/marminGuardJob');
const { executeDailySchedule } = require('../schedulers/dailyScheduleJob');
const { setupSchedulers, isAnyTaskRunning } = require('../schedulers/schedulerManager');
const { searchStockApi, ensureValidSession } = require('../services/stockService');
const { addLog, getLogs, clearLogs } = require('../utils/logger');

// 1. Ambil Konfigurasi Saat Ini
router.get('/config', (req, res) => {
  const config = loadConfig();
  res.json({
    ...config,
    isRunning: isAnyTaskRunning()
  });
});

// 2. Perbarui Konfigurasi
router.post('/config', (req, res) => {
  const updated = updateConfig(req.body);
  setupSchedulers();
  addLog('success', '💾 Pengaturan sistem berhasil disimpan dan penjadwal diperbarui!');
  res.json({ success: true, config: updated });
});

// 3. Uji Koneksi Database PostgreSQL
router.post('/db/test', async (req, res) => {
  const { dbConfig } = req.body;
  const config = loadConfig();
  const testConfig = dbConfig || config.dbConfig;

  addLog('info', `🐘 Menguji koneksi database PostgreSQL (${testConfig.host}:${testConfig.port}/${testConfig.database})...`);
  const result = await testDbConnection(testConfig);

  if (result.success) {
    addLog('success', `✅ Koneksi PostgreSQL BERHASIL terhubung ke database "${result.database}".`);
    res.json({
      success: true,
      message: `Koneksi berhasil terhubung ke database "${result.database}". Waktu server DB: ${result.time}`
    });
  } else {
    addLog('error', `❌ Koneksi PostgreSQL GAGAL: ${result.error}`);
    res.status(400).json({ success: false, error: result.error });
  }
});

// 4. Pratinjau Query Margin Minus dari PostgreSQL
router.post('/db/preview', async (req, res) => {
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

// 5. Eksekusi Manual Guard Margin Minus
router.post('/run-marmin-now', async (req, res) => {
  if (isAnyTaskRunning()) {
    return res.status(409).json({ success: false, message: 'Tugas lain sedang berlangsung.' });
  }
  executeMarminGuard('Manual Trigger (Web UI)');
  res.json({ success: true, message: 'Pengecekan Margin Minus telah dimulai.' });
});

// 6. Eksekusi Manual Jadwal Harian PLU
router.post('/run-manual-now', async (req, res) => {
  if (isAnyTaskRunning()) {
    return res.status(409).json({ success: false, message: 'Tugas lain sedang berlangsung.' });
  }
  executeDailySchedule('Manual Trigger (Web UI)');
  res.json({ success: true, message: 'Otomatisasi PLU manual telah dimulai.' });
});

// 7. Cek Status Real-Time PLU di CMS StokPoin
router.post('/check-plus', async (req, res) => {
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

// 8. Ambil Live Logs
router.get('/logs', (req, res) => {
  res.json({
    logs: getLogs(),
    isRunning: isAnyTaskRunning()
  });
});

// 9. Bersihkan Live Logs
router.post('/logs/clear', (req, res) => {
  clearLogs();
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { loadConfig, updateConfig } = require('../config/configManager');
const { testDbConnection, fetchMarginMinusData } = require('../database/connection');
const { executeMarminGuard } = require('../schedulers/marminGuardJob');
const { executeDailySchedule } = require('../schedulers/dailyScheduleJob');
const { setupSchedulers, isAnyTaskRunning } = require('../schedulers/schedulerManager');
const { searchStockApi, ensureValidSession } = require('../services/stockService');
const { addLog, getLogs, clearLogs } = require('../utils/logger');
const { normalizeAndDeduplicatePlus } = require('../utils/pluHelper');

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
  const body = req.body || {};
  if (Array.isArray(body.plus)) {
    body.plus = normalizeAndDeduplicatePlus(body.plus);
  }
  const updated = updateConfig(body);
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

// 7. Ambil Live Logs
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

const express = require('express');
const router = express.Router();
const { loadConfig, updateConfig } = require('../config/configManager');
const { testDbConnection, fetchMarginMinusData } = require('../database/connection');
const { executeMarminGuard } = require('../schedulers/marminGuardJob');
const { executeDailySchedule } = require('../schedulers/dailyScheduleJob');
const { setupSchedulers, isAnyTaskRunning } = require('../schedulers/schedulerManager');
const { searchStockApi, ensureValidSession } = require('../services/stockService');
const { addLog, getLogs, clearLogs, addIasLog, getIasLogs, clearIasLogs } = require('../utils/logger');
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

// --- Modul Otomasi Web IAS ---
const iasService = require('../services/iasAutomationService');

// Ambil Konfigurasi IAS
router.get('/ias/config', (req, res) => {
  const config = iasService.getConfig();
  res.json(config);
});

// Simpan Konfigurasi IAS
router.post('/ias/config', (req, res) => {
  try {
    const updated = iasService.saveConfig(req.body);
    addIasLog('success', '💾 Pengaturan Web IAS berhasil diperbarui.');
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Live Logs Khusus Web IAS
router.get('/ias/logs', (req, res) => {
  res.json({
    logs: getIasLogs(),
    activeTask: iasService.activeTask || null
  });
});

// Bersihkan Live Logs Khusus Web IAS
router.post('/ias/logs/clear', (req, res) => {
  clearIasLogs();
  res.json({ success: true });
});

// Ambil Daftar Menu Web IAS
router.get('/ias/menus', (req, res) => {
  const menus = iasService.getAvailableMenus();
  res.json({ success: true, total: menus.length, menus });
});

// Auto-Connect / Login Latar Belakang Web IAS
router.post('/ias/auto-connect', async (req, res) => {
  try {
    const result = await iasService.autoConnectInBackground(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Status Sesi Terkini Web IAS
router.get('/ias/session/status', (req, res) => {
  res.json(iasService.getSessionStatus());
});

// Uji Login & Koneksi Web IAS
router.post('/ias/test-login', async (req, res) => {
  const customConfig = req.body;
  addIasLog('info', `🌐 Menguji login ke portal Web IAS (${customConfig.baseUrl || 'http://172.31.146.190'})...`);
  const result = await iasService.login(customConfig);
  if (result.success) {
    addIasLog('success', `✅ Uji Login Web IAS BERHASIL! User: ${customConfig.username || 'RIS'}`);
    res.json(result);
  } else {
    addIasLog('error', `❌ Uji Login Web IAS GAGAL: ${result.error}`);
    res.status(400).json(result);
  }
});

// Ambil Status Live Tasks IAS (Hitstok & LPP)
router.get('/ias/tasks/status', async (req, res) => {
  try {
    const status = await iasService.getTasksLiveStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Jalankan Task 1: Hitung Ulang Stock
router.post('/ias/tasks/hitstok/run', async (req, res) => {
  try {
    addIasLog('info', `🚀 Memulai pemicuan Task: Hitung Ulang Stock...`);
    const result = await iasService.runHitungUlangStock(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Jalankan Task 2: Proses LPP
router.post('/ias/tasks/lpp/run', async (req, res) => {
  try {
    addIasLog('info', `🚀 Memulai pemicuan Task: Proses LPP (${req.body.mode === 'harian' ? 'Harian' : 'Bulanan'})...`);
    const result = await iasService.runProsesLPP(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Task 3: Cetak & Ambil Data Register LPP (Data Pembanding)
router.post('/ias/register-lpp/fetch', async (req, res) => {
  try {
    addIasLog('info', `🚀 Memulai pengambilan laporan Register LPP untuk data pembanding...`);
    const result = await iasService.fetchAndParseRegisterLPP(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Data Register LPP Terakhir yang Tersimpan
router.get('/ias/register-lpp/latest', (req, res) => {
  const data = iasService.getLatestRegisterLPP();
  if (data) {
    res.json(data);
  } else {
    res.json({ success: false, message: 'Belum ada data Register LPP yang diambil.' });
  }
});

// Export Data Register LPP ke format CSV
router.get('/ias/register-lpp/export-csv', (req, res) => {
  const data = iasService.getLatestRegisterLPP();
  if (!data || !data.categories) {
    return res.status(404).send('Data Register LPP belum tersedia.');
  }

  const headers = [
    'DIVISI', 'DEPARTEMEN', 'KODE', 'NAMA KATEGORI',
    'SALDO AWAL (RP)', 'SALDO AWAL (QTY)',
    'PEMBELIAN MURNI', 'PEMBELIAN BONUS',
    'TRANSFER IN', 'RETUR PENJUALAN', 'REPACK IN', 'PENERIMAAN LAIN',
    'PENJUALAN', 'TRANSFER OUT', 'REPACK OUT', 'HILANG', 'PENGELUARAN LAIN', 'SO',
    'PENYESUAIAN', 'KOREKSI',
    'SALDO AKHIR (RP)', 'SALDO AKHIR (QTY)'
  ];

  const escapeCsv = (val) => {
    const s = (val === null || val === undefined) ? '' : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const csvRows = [headers.join(',')];

  data.categories.forEach(c => {
    csvRows.push([
      escapeCsv(c.divisi),
      escapeCsv(c.departemen),
      escapeCsv(c.kode),
      escapeCsv(c.namaKategori),
      escapeCsv(c.saldoAwal?.rp || '0'),
      escapeCsv(c.saldoAwal?.qty || '0'),
      escapeCsv(c.pembelianMurni),
      escapeCsv(c.pembelianBonus),
      escapeCsv(c.transferIn),
      escapeCsv(c.returPenjualan),
      escapeCsv(c.repackIn),
      escapeCsv(c.penerimaanLain),
      escapeCsv(c.penjualan),
      escapeCsv(c.transferOut),
      escapeCsv(c.repackOut),
      escapeCsv(c.hilang),
      escapeCsv(c.pengeluaranLain),
      escapeCsv(c.so),
      escapeCsv(c.penyesuaian),
      escapeCsv(c.koreksi),
      escapeCsv(c.saldoAkhir?.rp || '0'),
      escapeCsv(c.saldoAkhir?.qty || '0')
    ].join(','));
  });

  if (data.grandTotal) {
    const gt = data.grandTotal;
    csvRows.push([
      escapeCsv('TOTAL SELURUHNYA'), '', '', '',
      escapeCsv(gt.saldoAwal?.rp || '0'), escapeCsv(gt.saldoAwal?.qty || '0'),
      escapeCsv(gt.pembelianMurni || gt.murni || '0'),
      escapeCsv(gt.pembelianBonus || gt.bonus || '0'),
      escapeCsv(gt.transferIn || '0'),
      escapeCsv(gt.returPenjualan || '0'),
      escapeCsv(gt.repackIn || '0'),
      escapeCsv(gt.penerimaanLain || '0'),
      escapeCsv(gt.penjualan || '0'),
      escapeCsv(gt.transferOut || '0'),
      escapeCsv(gt.repackOut || '0'),
      escapeCsv(gt.hilang || '0'),
      escapeCsv(gt.pengeluaranLain || '0'),
      escapeCsv(gt.so || '0'),
      escapeCsv(gt.penyesuaian || '0'),
      escapeCsv(gt.koreksi || '0'),
      escapeCsv(gt.saldoAkhir?.rp || '0'), escapeCsv(gt.saldoAkhir?.qty || '0')
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Register_LPP_${data.params?.periode1 || 'data'}.csv"`);
  res.send(csvRows.join('\n'));
});

module.exports = router;

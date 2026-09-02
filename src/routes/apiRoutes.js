const express = require('express');
const router = express.Router();
const { loadConfig, updateConfig } = require('../config/configManager');
const { testDbConnection, fetchMarginMinusData, fetchPluFromMd } = require('../database/connection');
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

// 4b. Ambil PLU Master MD dari PostgreSQL (tbtr_update_plu_md hari ini)
router.get('/db/fetch-plu-md', async (req, res) => {
  const config = loadConfig();
  addLog('info', `🐘 Mengambil daftar PLU Master MD (tbtr_update_plu_md Tag Z hari ini)...`);
  const result = await fetchPluFromMd(config.dbConfig);

  if (result.success) {
    addLog('success', `📥 Ditemukan ${result.totalCount} PLU Master MD hari ini.`);
    res.json({
      success: true,
      totalCount: result.totalCount,
      plus: result.plus,
      items: result.items
    });
  } else {
    addLog('error', `❌ Query PLU Master MD gagal: ${result.error}`);
    res.status(400).json({ success: false, error: result.error, plus: [], items: [] });
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

// Login Manual / Eksplisit ke Web IAS
router.post('/ias/session/login', async (req, res) => {
  try {
    const result = await iasService.login(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout / Putuskan Sesi Web IAS
router.post('/ias/session/logout', async (req, res) => {
  try {
    const result = await iasService.logout();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Konfigurasi Web IAS
router.get('/ias/config', (req, res) => {
  try {
    const config = iasService.getConfig();
    res.json({
      success: true,
      config: {
        baseUrl: config.baseUrl,
        koneksi: config.koneksi,
        username: config.username,
        branchCode: config.branchCode,
        cabang: config.cabang,
        autoResetSession: config.autoResetSession
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Simpan Konfigurasi Web IAS
router.post('/ias/config', (req, res) => {
  try {
    const saved = iasService.saveConfig(req.body);
    res.json({ success: true, config: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Uji Login & Koneksi Web IAS
router.post('/ias/test-login', async (req, res) => {
  const customConfig = req.body;
  const cfg = iasService.getConfig();
  const targetUrl = customConfig.baseUrl || cfg.baseUrl || 'http://172.31.146.190';
  addIasLog('info', `🌐 Menguji login ke portal Web IAS (${targetUrl})...`);
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

// ============================================================================
// KROSCEK DATA LAPORAN LPP (Posisi & Mutasi Persediaan SOP)
// ============================================================================

router.get('/ias/kroscek', (req, res) => {
  try {
    const data = iasService.getKroscekData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/save', (req, res) => {
  try {
    const saved = iasService.saveKroscekData(req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/sync-lpp01', (req, res) => {
  try {
    const synced = iasService.syncKroscekFromLpp01();
    res.json({ success: true, data: synced });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-prev-lpp', async (req, res) => {
  try {
    const result = await iasService.fetchLppBulanSebelumnya(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-next-lpp', async (req, res) => {
  try {
    const result = await iasService.fetchLppBulanBerikutnya(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-daftar-pembelian', async (req, res) => {
  try {
    const result = await iasService.fetchAndParseDaftarPembelian(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-penjualan', async (req, res) => {
  try {
    const result = await iasService.fetchAndParseLaporanPenjualan(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-lpp02', async (req, res) => {
  try {
    const result = await iasService.fetchLpp02(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ias/kroscek/fetch-lpp03', async (req, res) => {
  try {
    const result = await iasService.fetchLpp03(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/ias/kroscek/export-csv', (req, res) => {
  const data = iasService.getKroscekData();
  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lpp = data.lpp01 || {};
  const pem = data.pembanding || {};
  const antar = data.antarLpp || {};

  const rows = [
    ['REGISTER LPP', 'DATA LPP 01', 'KROSCEK DATA LAPORAN', 'NILAI PEMBANDING', 'SELISIH', 'KETERANGAN'],
    ['SALDO AKHIR BULAN SEBELUM ME', lpp.saldoAkhirSebelumME || 0, '', pem.saldoAkhirSebelumME || 0, (lpp.saldoAkhirSebelumME || 0) - (pem.saldoAkhirSebelumME || 0), 'LPP-01 Bulan Sebelumnya'],
    ['SALDO AWAL BULAN ME', lpp.saldoAwalBulanME || 0, '', pem.saldoAwalBulanME || 0, (lpp.saldoAwalBulanME || 0) - (pem.saldoAwalBulanME || 0), 'Saldo Awal Grand Total LPP 01'],
    ['PEMBELIAN MURNI', lpp.pembelianMurni || 0, 'LAP DFTR PEMBELIAN --> Gross - Potongan + Disc4', pem.pembelianMurni || 0, (lpp.pembelianMurni || 0) - (pem.pembelianMurni || 0), 'IAS - BO - LAPORAN2-LAPORAN DFTR PEMBELIAN'],
    ['PEMBELIAN BONUS', lpp.pembelianBonus || 0, '', pem.pembelianBonus || 0, (lpp.pembelianBonus || 0) - (pem.pembelianBonus || 0), 'Bonus Pembelian'],
    ['TRANSFER IN', lpp.transferIn || 0, 'REGISTER TAC + LAP TRANSFER HBV --> Total + Batal', pem.transferIn || 0, (lpp.transferIn || 0) - (pem.transferIn || 0), '(IAS - BO - CETAK REGISTER) + (IAS - BO - LAPORAN2)'],
    ['RETUR PENJUALAN', lpp.returPenjualan || 0, 'OMI>>LAP REGISTER BARANG RETUR --> Total', pem.returPenjualan || 0, (lpp.returPenjualan || 0) - (pem.returPenjualan || 0), 'Kalo selisih berarti ada yang belum BPBR'],
    ['REPACK', lpp.repack || 0, 'LAPORAN REPACKING --> HARUS SAMA DENGAN PREPACK', pem.repack || 0, (lpp.repack || 0) - (pem.repack || 0), 'IAS - BO - TRANSAKSI - REPACKING (Harus sama dengan prepack)'],
    ['LAIN2 (Penerimaan)', lpp.penerimaanLain || 0, 'LPP RETUR + LPP RUSAK --> Pengeluaran Lain Baik', pem.penerimaanLain || 0, (lpp.penerimaanLain || 0) - (pem.penerimaanLain || 0), 'IAS - BO - LPP'],
    ['PENJUALAN', lpp.penjualan || 0, 'LAPORAN PENJUALAN --> HPP RATA2', pem.penjualan || 0, (lpp.penjualan || 0) - (pem.penjualan || 0), 'IAS - FO - LAP. KASIR (PER DEPARTEMENT) - Dibawah 5000 OK'],
    ['TRANSFER OUT', lpp.transferOut || 0, 'REGISTER SURAT JALAN + LAP TRANSFER HBV--> Total + Batal', pem.transferOut || 0, (lpp.transferOut || 0) - (pem.transferOut || 0), '(IAS - BO - CETAK REGISTER) + (IAS - BO - LAPORAN2)'],
    ['PREPACK', lpp.prepack || 0, 'LAPORAN PREPACK --> HARUS SAMA DENGAN REPACKING', pem.prepack || 0, (lpp.prepack || 0) - (pem.prepack || 0), 'IAS - BO - TRANSAKSI - REPACKING (Harus sama dengan repack)'],
    ['HILANG', lpp.hilang || 0, 'REGISTER NBH --> Total - Batal', pem.hilang || 0, (lpp.hilang || 0) - (pem.hilang || 0), 'IAS - BO - CETAK REGISTER'],
    ['LAIN2 (Pengeluaran)', lpp.pengeluaranLain || 0, 'LPP RETUR + LPP RUSAK (Penerimaan Baik) + BA RETUR IDM (DPP)', pem.pengeluaranLain || 0, (lpp.pengeluaranLain || 0) - (pem.pengeluaranLain || 0), '(IAS - BO - LPP) + (IAS - BO - LPP - REGISTER BA IDM (REKAP))'],
    ['SO', lpp.so || 0, 'LAP REKAP ADJUST SO --> Total', pem.so || 0, (lpp.so || 0) - (pem.so || 0), 'IAS - BO - LPP'],
    ['INTRANSIT', lpp.intransit || 0, 'AKHIR BULAN HARUS = 0', pem.intransit || 0, (lpp.intransit || 0) - (pem.intransit || 0), 'Akhir Bulan HARUS = 0'],
    ['PENYESUAIAN', lpp.penyesuaian || 0, 'REGISTER MPP --> Total - Batal', pem.penyesuaian || 0, (lpp.penyesuaian || 0) - (pem.penyesuaian || 0), 'IAS - BO - CETAK REGISTER'],
    ['KOREKSI', lpp.koreksi || 0, '', pem.koreksi || 0, (lpp.koreksi || 0) - (pem.koreksi || 0), 'Koreksi Nilai'],
    ['SALDO AKHIR BULAN ME', lpp.saldoAkhirBulanME || 0, '', pem.saldoAkhirBulanME || 0, (lpp.saldoAkhirBulanME || 0) - (pem.saldoAkhirBulanME || 0), 'Saldo Akhir Grand Total LPP 01'],
    [],
    ['=== KROSCEK ANTAR BULAN & ANTAR LPP (TIDAK BOLEH ADA SELISIH) ==='],
    ['KATEGORI KOMPARASI', 'NILAI 1', 'NILAI 2', 'SELISIH', 'STATUS'],
    ['Saldo Akhir LPP-01 Bulan Sebelumnya vs Saldo Awal LPP-01 Bulan ME', antar.lpp01_prev || 0, antar.lpp01_me_awal || 0, (antar.lpp01_prev || 0) - (antar.lpp01_me_awal || 0), (antar.lpp01_prev || 0) === (antar.lpp01_me_awal || 0) ? 'OK' : 'SELISIH'],
    ['Saldo Akhir LPP-01 Bulan ME vs Saldo Awal LPP-01 Bulan Baru', antar.lpp01_me_akhir || 0, antar.lpp01_next_awal || 0, (antar.lpp01_me_akhir || 0) - (antar.lpp01_next_awal || 0), (antar.lpp01_me_akhir || 0) === (antar.lpp01_next_awal || 0) ? 'OK' : 'SELISIH'],
    ['Saldo Akhir LPP-02 Bulan Sebelumnya vs Saldo Awal LPP-02 Bulan ME', antar.lpp02_prev || 0, antar.lpp02_me_awal || 0, (antar.lpp02_prev || 0) - (antar.lpp02_me_awal || 0), (antar.lpp02_prev || 0) === (antar.lpp02_me_awal || 0) ? 'OK' : 'SELISIH'],
    ['Saldo Akhir LPP-02 Bulan ME vs Saldo Awal LPP-02 Bulan Baru', antar.lpp02_me_akhir || 0, antar.lpp02_next_awal || 0, (antar.lpp02_me_akhir || 0) - (antar.lpp02_next_awal || 0), (antar.lpp02_me_akhir || 0) === (antar.lpp02_next_awal || 0) ? 'OK' : 'SELISIH'],
    ['Saldo Akhir LPP-03 Bulan Sebelumnya vs Saldo Awal LPP-03 Bulan ME', antar.lpp03_prev || 0, antar.lpp03_me_awal || 0, (antar.lpp03_prev || 0) - (antar.lpp03_me_awal || 0), (antar.lpp03_prev || 0) === (antar.lpp03_me_awal || 0) ? 'OK' : 'SELISIH'],
    ['Saldo Akhir LPP-03 Bulan ME vs Saldo Awal LPP-03 Bulan Baru', antar.lpp03_me_akhir || 0, antar.lpp03_next_awal || 0, (antar.lpp03_me_akhir || 0) - (antar.lpp03_next_awal || 0), (antar.lpp03_me_akhir || 0) === (antar.lpp03_next_awal || 0) ? 'OK' : 'SELISIH']
  ];

  const csvContent = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Kroscek_LPP_${data.periode?.replace(/\//g, '-') || 'ME'}.csv"`);
  res.send(csvContent);
});

module.exports = router;


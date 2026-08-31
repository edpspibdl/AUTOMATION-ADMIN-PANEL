const { fetchMarginMinusData } = require('../database/connection');
const { searchStockApi, toggleStockApi } = require('../services/stockService');
const { loadConfig, updateConfig } = require('../config/configManager');
const { addLog } = require('../utils/logger');

let isMarminRunning = false;

/**
 * Eksekusi Guard Margin Minus:
 * Mengecek DB PostgreSQL -> JIKA ADA ITEM MARGIN MINUS -> LANGSUNG NONAKTIFKAN DI CMS INSTAN!
 */
async function executeMarminGuard(triggerSource = 'Auto-Guard (5 Menit)') {
  if (isMarminRunning) {
    addLog('warning', `⚠️ [MARMIN GUARD] Tugas pengecekan sebelumnya masih berlangsung. (${triggerSource}) ditunda.`);
    return { success: false, message: 'Tugas masih berjalan.' };
  }

  isMarminRunning = true;
  const config = loadConfig();

  try {
    addLog('info', `🛡️ [MARMIN GUARD] Menjalankan pengecekan margin minus ke database PostgreSQL...`);
    const dbRes = await fetchMarginMinusData(config.dbConfig, config.customQuery);

    if (!dbRes.success) {
      addLog('error', `❌ [MARMIN GUARD] Gagal query ke PostgreSQL: ${dbRes.error}`);
      return { success: false, error: dbRes.error };
    }

    const items = dbRes.items || [];
    const plus = dbRes.plus || [];

    if (items.length === 0) {
      addLog('info', `🛡️ [MARMIN GUARD] Pengecekan selesai: 0 item Margin Minus ditemukan (Kondisi Aman).`);
      updateConfig({
        lastMarminRun: {
          time: new Date().toLocaleString('id-ID'),
          triggerSource,
          foundCount: 0,
          deactivatedCount: 0
        }
      });
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

    updateConfig({
      lastMarminRun: {
        time: new Date().toLocaleString('id-ID'),
        triggerSource,
        foundCount: items.length,
        deactivatedCount
      }
    });

    addLog('success', `🎉 [MARMIN GUARD] Selesai! Berhasil mematikan ${deactivatedCount} dari ${items.length} item margin minus.`);
    return { success: true, items, deactivatedCount };

  } catch (err) {
    addLog('error', `❌ [MARMIN GUARD] Terjadi kesalahan: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isMarminRunning = false;
  }
}

function getMarminRunningState() {
  return isMarminRunning;
}

module.exports = {
  executeMarminGuard,
  getMarminRunningState
};

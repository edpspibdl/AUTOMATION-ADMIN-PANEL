const { fetchMarginMinusData } = require('../database/connection');
const { searchStockApi, toggleStockApi } = require('../services/stockService');
const { loadConfig, updateConfig } = require('../config/configManager');
const { addLog } = require('../utils/logger');
const { normalizePlu } = require('../utils/pluHelper');

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

    const items = (dbRes.items || []).filter(item => item.plu && item.plu.endsWith('0'));
    const plus = dbRes.plus || [];

    // Ambil riwayat PLU yang sebelumnya pernah dimatikan oleh bot
    let deactivatedPlus = config.deactivatedPlus || [];
    const currentMinusPlusSet = new Set(items.map(item => item.plu));
    const nextDeactivatedPlus = [];
    let activatedCount = 0;
    let deactivatedCount = 0;

    addLog('info', `🔎 [DEBUG CONFIG] Jumlah PLU mati di memori saat ini: ${deactivatedPlus.length}`);

    // 1. PROSES NYALAKAN KEMBALI (Cek barang lama yang dulu mati, tapi sekarang sudah tidak minus. diluar jam malam 21:00 - 06:00)
    const now = new Date();
    const currentHour = now.getHours(); // Format 0-23
    const isRestrictedTime = currentHour >= 21 || currentHour < 6;

    if (isRestrictedTime) {
      addLog('info', `⏳ [AUTO-ACTIVATE] Ditunda. Sekarang pukul ${now.toLocaleTimeString('id-ID')} (Masuk jam malam 21:00 - 06:00). Barang tidak minus belum dinyalakan.`);
      
      // Karena dilarang nyala, pastikan semua PLU yang tadinya mati tetap ditahan statusnya di list mati
      for (const plu of deactivatedPlus) {
        if (!nextDeactivatedPlus.includes(plu)) {
          nextDeactivatedPlus.push(plu);
        }
      }
    } else {
      for (const plu of deactivatedPlus) {
        if (!currentMinusPlusSet.has(plu)) {
          addLog('info', `🟢 [AUTO-ACTIVATE] PLU ${plu} sudah tidak minus lagi. Menyalakan kembali...`);
          try {
            const stockItems = await searchStockApi({ plu });
            if (stockItems && stockItems.length > 0) {
              for (const s of stockItems) {
                const flag = (s.flag || '').toLowerCase().trim();
                
                addLog('info', `🔎 [CENDIEN DEBUG] PLU ${plu} (ID ${s.id}) memiliki flag asli di CMS: "${s.flag}"`);
  
                if (flag.includes('non') || !flag.includes('aktif')) {
                  await toggleStockApi(s.id);
                  addLog('success', `✅ [AUTO-ACTIVATE] BERHASIL DIHIDUPKAN: PLU ${plu}`);
                  activatedCount++;
                } else {
                  addLog('warning', `⚠️ [AUTO-ACTIVATE] Gagal menyalakan PLU ${plu}, karena flag terbaca: "${flag}"`);
                  if (!nextDeactivatedPlus.includes(plu)) nextDeactivatedPlus.push(plu);
                }
              }
            }
          } catch (actErr) {
            addLog('error', `❌ [AUTO-ACTIVATE] Gagal menyalakan PLU ${plu}: ${actErr.message}`);
            if (!nextDeactivatedPlus.includes(plu)) nextDeactivatedPlus.push(plu);
          }
        } else {
          if (!nextDeactivatedPlus.includes(plu)) {
            nextDeactivatedPlus.push(plu);
          }
        }
      }
    }


    // 2. PROSES MATIKAN (Jika ditemukan item margin minus saat ini)
    if (items.length > 0) {
      addLog('warning', `🚨 [MARMIN GUARD] TERDETEKSI ${items.length} ITEM MARGIN MINUS! Memulai proses penonaktifan instan ke CMS StokPoin...`);

      for (const item of items) {
        const plu = item.plu;
        
        if (!nextDeactivatedPlus.includes(plu)) {
          nextDeactivatedPlus.push(plu);
        }

        try {
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
        } catch (itemErr) {
          addLog('error', `❌ [MARMIN] Gagal memproses PLU ${plu}: ${itemErr.message}`);
        }
      }
    } else {
      addLog('info', `🛡️ [MARMIN GUARD] 0 item Margin Minus ditemukan pada database (Kondisi Aman).`);
    }

    deactivatedPlus = nextDeactivatedPlus;

    // Simpan konfigurasi terbaru secara eksplisit
    const savedData = {
      ...config,
      deactivatedPlus,
      lastMarminRun: {
        time: new Date().toLocaleString('id-ID'),
        triggerSource,
        foundCount: items.length,
        deactivatedCount,
        activatedCount
      }
    };
    updateConfig(savedData);

    addLog('success', `🎉 [MARMIN GUARD] Selesai! Mematikan: ${deactivatedCount}, Menyalakan kembali: ${activatedCount}.`);
    return { success: true, items, deactivatedCount, activatedCount };

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

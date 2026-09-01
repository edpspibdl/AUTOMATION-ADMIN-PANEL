const { searchStockApi, toggleStockApi } = require('../services/stockService');
const { loadConfig, updateConfig } = require('../config/configManager');
const { addLog } = require('../utils/logger');
const { normalizeAndDeduplicatePlus } = require('../utils/pluHelper');

let isDailyRunning = false;

/**
 * Eksekusi Jadwal Harian PLU Manual:
 * Memproses seluruh nomor PLU yang ada di input manual sesuai jadwal jam harian.
 */
async function executeDailySchedule(triggerSource = 'Jadwal Harian Manual') {
  if (isDailyRunning) {
    addLog('warning', `⚠️ [JADWAL MANUAL] Tugas sebelumnya masih berlangsung. (${triggerSource}) diabaikan.`);
    return { success: false, message: 'Tugas masih berjalan.' };
  }

  isDailyRunning = true;
  const config = loadConfig();
  const action = config.dailyAction || 'nonaktif';
  const targetPlus = normalizeAndDeduplicatePlus(config.plus || []);

  addLog('info', `▶️ [JADWAL MANUAL] Mulai eksekusi [${triggerSource}]. Target: ${targetPlus.length} PLU Manual, Aksi: [${action.toUpperCase()}]`);

  if (targetPlus.length === 0) {
    addLog('warning', '⚠️ [JADWAL MANUAL] Daftar PLU manual kosong.');
    isDailyRunning = false;
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

    updateConfig({
      lastRun: {
        time: new Date().toLocaleString('id-ID'),
        triggerSource,
        action,
        totalPlus: targetPlus.length,
        successCount: results.filter(r => r.status === 'success').length
      }
    });

    addLog('success', `🎉 [JADWAL MANUAL] Selesai! Berhasil memproses ${targetPlus.length} PLU manual.`);
    return { success: true, results };
  } catch (err) {
    addLog('error', `❌ [JADWAL MANUAL] Terjadi kesalahan: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isDailyRunning = false;
  }
}

function getDailyRunningState() {
  return isDailyRunning;
}

module.exports = {
  executeDailySchedule,
  getDailyRunningState
};

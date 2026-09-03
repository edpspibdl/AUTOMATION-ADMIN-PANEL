const { searchStockApi, toggleStockApi } = require('../services/stockService');
const { loadConfig, updateConfig } = require('../config/configManager');
const { addLog } = require('../utils/logger');
const { normalizeAndDeduplicatePlus } = require('../utils/pluHelper');
const { fetchPluFromMd } = require('../database/connection');

let isDailyRunning = false;

/**
 * Eksekusi Jadwal Harian PLU:
 * Memproses PLU dari Master DB (tbtr_update_plu_md) dan PLU manual sesuai jadwal harian.
 */
async function executeDailySchedule(triggerSource = 'Jadwal Harian Manual', overrideAction = null) {
  if (isDailyRunning) {
    addLog('warning', `⚠️ [JADWAL PLU] Tugas sebelumnya masih berlangsung. (${triggerSource}) diabaikan.`);
    return { success: false, message: 'Tugas masih berjalan.' };
  }

  isDailyRunning = true;
  const config = loadConfig();
  const action = overrideAction || config.dailyAction || 'nonaktif';

  // 1. Ambil data master PLU dari tbtr_update_plu_md (Tag Z hari ini)
  let dbPlus = [];
  try {
    const dbRes = await fetchPluFromMd(config.dbConfig);
    if (dbRes.success && dbRes.plus && dbRes.plus.length > 0) {
      dbPlus = dbRes.plus;
      addLog('info', `📥 [MASTER MD] Ditemukan ${dbPlus.length} PLU dari tbtr_update_plu_md hari ini: ${dbPlus.join(', ')}`);
    } else if (dbRes.success) {
      addLog('info', `📥 [MASTER MD] Tidak ada update PLU Tag Z hari ini di tbtr_update_plu_md.`);
    } else {
      addLog('warning', `⚠️ [MASTER MD] Gagal query tbtr_update_plu_md: ${dbRes.error}`);
    }
  } catch (err) {
    addLog('warning', `⚠️ [MASTER MD] Gagal koneksi database master: ${err.message}`);
  }

  // 2. Gabungkan dengan PLU manual dari config (deduplikasi)
  const combined = [...dbPlus, ...(config.plus || [])];
  const targetPlus = normalizeAndDeduplicatePlus(combined);

  addLog('info', `▶️ [JADWAL PLU] Mulai eksekusi [${triggerSource}]. Target Total: ${targetPlus.length} PLU (${dbPlus.length} Master DB, ${(config.plus || []).length} Manual), Aksi: [${action.toUpperCase()}]`);

  if (targetPlus.length === 0) {
    addLog('warning', '⚠️ [JADWAL PLU] Daftar PLU target kosong (tidak ada PLU dari DB maupun manual).');
    isDailyRunning = false;
    return { success: true, message: 'Daftar PLU target kosong.' };
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
        fromDbCount: dbPlus.length,
        fromManualCount: (config.plus || []).length,
        successCount: results.filter(r => r.status === 'success').length
      }
    });

    addLog('success', `🎉 [JADWAL PLU] Selesai! Berhasil memproses ${targetPlus.length} PLU (${dbPlus.length} Master DB, ${(config.plus || []).length} Manual).`);
    return { success: true, results };
  } catch (err) {
    addLog('error', `❌ [JADWAL PLU] Terjadi kesalahan: ${err.message}`);
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

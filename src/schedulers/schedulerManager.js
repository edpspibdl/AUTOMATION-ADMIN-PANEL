const cron = require('node-cron');
const { loadConfig } = require('../config/configManager');
const { executeMarminGuard, getMarminRunningState } = require('./marminGuardJob');
const { executeDailySchedule, getDailyRunningState } = require('./dailyScheduleJob');
const { addLog } = require('../utils/logger');

let marminCronTask = null;
let dailyCronTask = null;
let dailyEnableCronTask = null;

function setupSchedulers() {
  // Hentikan jadwal aktif sebelumnya jika ada
  if (marminCronTask) {
    marminCronTask.stop();
    marminCronTask = null;
  }
  if (dailyCronTask) {
    dailyCronTask.stop();
    dailyCronTask = null;
  }
  if (dailyEnableCronTask) {
    dailyEnableCronTask.stop();
    dailyEnableCronTask = null;
  }

  const config = loadConfig();

  // 1. Setup Auto-Guard Margin Minus (Setiap X Menit)
  if (config.marminGuardEnabled) {
    const mins = parseInt(config.marminIntervalMinutes, 10) || 5;
    const cronExpr = mins === 1 ? '* * * * *' : `*/${mins} * * * *`;
    addLog('info', `🛡️ [MARMIN GUARD] Aktif! Pengecekan rutin setiap ${mins} menit sekali (Cron: ${cronExpr}) -> Langsung nonaktifkan jika terdeteksi.`);

    marminCronTask = cron.schedule(cronExpr, async () => {
      await executeMarminGuard(`Auto-Guard (${mins} Menit)`);
    });
  } else {
    addLog('info', '⏸️ [MARMIN GUARD] Status: NONAKTIF.');
  }

  // 2. Setup Jadwal Harian Manual (misal Jam 22:00 WIB)
  if (config.dailyScheduleEnabled && config.dailyScheduleTime) {
    const [hour, minute] = config.dailyScheduleTime.split(':');
    const cronExpr = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
    addLog('info', `⏰ [JADWAL HARIAN MANUAL] Aktif! Menonaktifkan PLU manual setiap hari pukul ${config.dailyScheduleTime} WIB (Cron: ${cronExpr})`);

    dailyCronTask = cron.schedule(cronExpr, async () => {
      addLog('info', `🚀 [CRON TRIGGER] Memulai eksekusi jadwal harian PLU manual pada pukul ${config.dailyScheduleTime}...`);
      await executeDailySchedule(`Jadwal Harian (${config.dailyScheduleTime} WIB)`);
    });
  } else {
    addLog('info', '⏸️ [JADWAL HARIAN MANUAL] Status: NONAKTIF.');
  }

  // 3. Setup Jadwal Harian Aktif Kembali (misal Jam 08:00 WIB)
  if (config.dailyScheduleEnabled && config.dailyEnableTime) {
    const [hour, minute] = config.dailyEnableTime.split(':');
    const cronExpr = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
    addLog('info', `⏰ [JADWAL HARIAN MANUAL] Aktif! Mengaktifkan PLU manual setiap hari pukul ${config.dailyEnableTime} WIB (Cron: ${cronExpr})`);

    dailyEnableCronTask = cron.schedule(cronExpr, async () => {
      addLog('info', `🚀 [CRON TRIGGER] Memulai eksekusi jadwal harian PLU manual pada pukul ${config.dailyEnableTime}...`);
      // Kirim overrideAction 'aktif'
      await executeDailySchedule(`Jadwal Aktif (${config.dailyEnableTime} WIB)`, 'aktif');
    });
  } else {
    addLog('info', '⏸️ [JADWAL HARIAN MANUAL] Status: NONAKTIF.');
  }
}

function isAnyTaskRunning() {
  return getMarminRunningState() || getDailyRunningState();
}

module.exports = {
  setupSchedulers,
  isAnyTaskRunning
};

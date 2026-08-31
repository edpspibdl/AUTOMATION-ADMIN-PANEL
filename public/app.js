// Global State
let currentConfig = {
  marminGuardEnabled: true,
  marminIntervalMinutes: 5,
  dailyScheduleEnabled: true,
  dailyScheduleTime: '22:00',
  dailyAction: 'nonaktif',
  plus: [],
  customQuery: '',
  dbConfig: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'postgres'
  },
  lastRun: null,
  lastMarminRun: null,
  isRunning: false
};

// Main Elements
const liveClock = document.getElementById('liveClock');

// Auto-Guard Marmin Elements
const toggleMarminGuard = document.getElementById('toggleMarminGuard');
const selectMarminInterval = document.getElementById('selectMarminInterval');
const btnRunMarminGuardNow = document.getElementById('btnRunMarminGuardNow');
const btnRunMarminDirect = document.getElementById('btnRunMarminDirect');

// Daily Manual Schedule Elements
const toggleDailySchedule = document.getElementById('toggleDailySchedule');
const inputDailyTime = document.getElementById('inputDailyTime');
const selectDailyAction = document.getElementById('selectDailyAction');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const btnRunManualDirect = document.getElementById('btnRunManualDirect');
const btnCheckPluLive = document.getElementById('btnCheckPluLive');

// Logs & Preview Elements
const btnClearLogs = document.getElementById('btnClearLogs');
const logConsole = document.getElementById('logConsole');
const pluChipsContainer = document.getElementById('pluChipsContainer');
const badgePluListCount = document.getElementById('badgePluListCount');
const badgeDbCount = document.getElementById('badgeDbCount');
const btnRunQueryPreview = document.getElementById('btnRunQueryPreview');
const tableDbBody = document.getElementById('tableDbBody');
const dbLastQueryStatus = document.getElementById('dbLastQueryStatus');

// PLU Modal Elements
const pluModalOverlay = document.getElementById('pluModalOverlay');
const btnOpenPluModal = document.getElementById('btnOpenPluModal');
const btnClosePluModal = document.getElementById('btnClosePluModal');
const btnCancelPluModal = document.getElementById('btnCancelPluModal');
const btnSavePluModal = document.getElementById('btnSavePluModal');
const modalTextareaPlu = document.getElementById('modalTextareaPlu');
const modalPluCounter = document.getElementById('modalPluCounter');
const btnModalClear = document.getElementById('btnModalClear');
const modalFileInput = document.getElementById('modalFileInput');

// Database Modal Elements
const dbModalOverlay = document.getElementById('dbModalOverlay');
const btnOpenDbModal = document.getElementById('btnOpenDbModal');
const btnCloseDbModal = document.getElementById('btnCloseDbModal');
const btnCancelDbModal = document.getElementById('btnCancelDbModal');
const btnSaveDbModal = document.getElementById('btnSaveDbModal');
const btnTestDbConnection = document.getElementById('btnTestDbConnection');
const dbHost = document.getElementById('dbHost');
const dbPort = document.getElementById('dbPort');
const dbUser = document.getElementById('dbUser');
const dbPassword = document.getElementById('dbPassword');
const dbDatabase = document.getElementById('dbDatabase');
const chkFilterMarginMinusOnly = document.getElementById('chkFilterMarginMinusOnly');
const dbCustomQuery = document.getElementById('dbCustomQuery');

// Custom Confirm Modal Elements
const confirmModalOverlay = document.getElementById('confirmModalOverlay');
const confirmModalTitle = document.getElementById('confirmModalTitle');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const btnCancelConfirm = document.getElementById('btnCancelConfirm');
const btnCancelConfirmX = document.getElementById('btnCancelConfirmX');
const btnAcceptConfirm = document.getElementById('btnAcceptConfirm');
let pendingConfirmCallback = null;

// Metric Elements
const cardMarminStatus = document.getElementById('cardMarminStatus');
const cardMarminInterval = document.getElementById('cardMarminInterval');
const cardDailyStatus = document.getElementById('cardDailyStatus');
const cardDailyTime = document.getElementById('cardDailyTime');
const cardPluCount = document.getElementById('cardPluCount');
const cardDailyAction = document.getElementById('cardDailyAction');
const cardLastRun = document.getElementById('cardLastRun');
const cardLastRunSummary = document.getElementById('cardLastRunSummary');

// 1. Live Clock
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
  liveClock.textContent = `${timeStr} WIB`;
}
setInterval(updateClock, 1000);
updateClock();

// 2. Top-Right Floating Alerts System
function showAlert(type = 'info', title = '', message = '', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const alertEl = document.createElement('div');
  alertEl.className = `toast-alert ${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'ℹ'
  };

  const defaultTitles = {
    success: 'Berhasil',
    error: 'Terjadi Kesalahan',
    warning: 'Peringatan',
    info: 'Informasi'
  };

  const alertTitle = title || defaultTitles[type] || 'Notifikasi';

  alertEl.innerHTML = `
    <div class="toast-icon-wrap">${iconMap[type] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(alertTitle)}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close-btn" title="Tutup">&times;</button>
    <div class="toast-progress">
      <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    </div>
  `;

  alertEl.querySelector('.toast-close-btn').addEventListener('click', () => {
    dismissAlert(alertEl);
  });

  container.appendChild(alertEl);

  const timer = setTimeout(() => {
    dismissAlert(alertEl);
  }, duration);

  alertEl._timer = timer;
}

function dismissAlert(alertEl) {
  if (alertEl.classList.contains('closing')) return;
  alertEl.classList.add('closing');
  clearTimeout(alertEl._timer);
  setTimeout(() => {
    alertEl.remove();
  }, 250);
}

// 3. Custom Confirmation Modal
function showConfirmDialog(title, message, onAccept) {
  confirmModalTitle.textContent = title || 'Konfirmasi Tindakan';
  confirmModalMessage.textContent = message || 'Apakah Anda yakin?';
  pendingConfirmCallback = onAccept;
  confirmModalOverlay.classList.add('active');
}

function closeConfirmDialog() {
  confirmModalOverlay.classList.remove('active');
  pendingConfirmCallback = null;
}

btnCancelConfirm.addEventListener('click', closeConfirmDialog);
btnCancelConfirmX.addEventListener('click', closeConfirmDialog);
btnAcceptConfirm.addEventListener('click', () => {
  if (typeof pendingConfirmCallback === 'function') {
    const cb = pendingConfirmCallback;
    closeConfirmDialog();
    cb();
  } else {
    closeConfirmDialog();
  }
});
confirmModalOverlay.addEventListener('click', (e) => {
  if (e.target === confirmModalOverlay) closeConfirmDialog();
});

// 4. Helper: Parse PLU Text
function parsePluText(text) {
  return text
    .split(/[\n,;\t]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// 5. Render PLU Chips
function renderPluChips(plus) {
  badgePluListCount.textContent = `${plus.length} PLU`;
  cardPluCount.textContent = `${plus.length} PLU`;

  if (!plus || plus.length === 0) {
    pluChipsContainer.innerHTML = '<span class="chip-empty">Belum ada PLU manual. Klik <strong>"Input / Edit PLU"</strong>.</span>';
    return;
  }

  pluChipsContainer.innerHTML = plus.map(plu => {
    return `<span class="plu-chip">🏷️ ${escapeHtml(plu)}</span>`;
  }).join('');
}

// 6. Load & Render Configuration
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    currentConfig = data;

    // Controls: Marmin Guard
    toggleMarminGuard.checked = !!data.marminGuardEnabled;
    selectMarminInterval.value = data.marminIntervalMinutes || 5;

    // Controls: Daily Manual Schedule
    toggleDailySchedule.checked = !!data.dailyScheduleEnabled;
    inputDailyTime.value = data.dailyScheduleTime || '22:00';
    selectDailyAction.value = data.dailyAction || 'nonaktif';
    
    // DB Form Controls
    const db = data.dbConfig || {};
    dbHost.value = db.host || 'localhost';
    dbPort.value = db.port || 5432;
    dbUser.value = db.user || 'postgres';
    dbPassword.value = db.password || '';
    dbDatabase.value = db.database || 'postgres';
    dbCustomQuery.value = data.customQuery || '';

    renderPluChips(data.plus || []);

    // Update Top Metric Cards
    cardMarminStatus.textContent = data.marminGuardEnabled ? 'AKTIF' : 'NONAKTIF';
    cardMarminStatus.style.color = data.marminGuardEnabled ? 'var(--success)' : 'var(--text-muted)';
    cardMarminInterval.textContent = data.marminGuardEnabled 
      ? `Setiap ${data.marminIntervalMinutes || 5} Menit Sekali` 
      : 'Auto-Guard Mati';

    cardDailyStatus.textContent = data.dailyScheduleEnabled ? 'AKTIF' : 'NONAKTIF';
    cardDailyStatus.style.color = data.dailyScheduleEnabled ? 'var(--success)' : 'var(--text-muted)';
    cardDailyTime.textContent = `Pukul ${data.dailyScheduleTime || '--:--'} WIB`;

    cardDailyAction.textContent = `Aksi: ${(data.dailyAction || 'nonaktif').toUpperCase()}`;

    // Last Run Information
    if (data.lastMarminRun) {
      cardLastRun.textContent = data.lastMarminRun.time || '-';
      cardLastRunSummary.textContent = `Marmin: ${data.lastMarminRun.foundCount} ditemukan, ${data.lastMarminRun.deactivatedCount} dinonaktifkan`;
    } else if (data.lastRun) {
      cardLastRun.textContent = data.lastRun.time || '-';
      cardLastRunSummary.textContent = `Manual: ${data.lastRun.successCount || 0}/${data.lastRun.totalPlus || 0} Sukses`;
    } else {
      cardLastRun.textContent = '-';
      cardLastRunSummary.textContent = 'Belum ada eksekusi';
    }

    updateRunningState(data.isRunning);
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

function updateRunningState(isRunning) {
  if (isRunning) {
    btnRunMarminGuardNow.disabled = true;
    btnRunMarminDirect.disabled = true;
    btnRunManualDirect.disabled = true;
  } else {
    btnRunMarminGuardNow.disabled = false;
    btnRunMarminDirect.disabled = false;
    btnRunManualDirect.disabled = false;
  }
}

// 7. Save Settings
async function saveAllConfig() {
  const payload = {
    marminGuardEnabled: toggleMarminGuard.checked,
    marminIntervalMinutes: parseInt(selectMarminInterval.value, 10) || 5,
    dailyScheduleEnabled: toggleDailySchedule.checked,
    dailyScheduleTime: inputDailyTime.value,
    dailyAction: selectDailyAction.value,
    plus: currentConfig.plus || []
  };

  try {
    btnSaveConfig.disabled = true;
    btnSaveConfig.innerHTML = '<span>⏳</span> Menyimpan...';

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showAlert('success', 'Pengaturan Disimpan', 'Konfigurasi Auto-Guard dan Jadwal Harian berhasil diperbarui.');
      loadConfig();
    } else {
      showAlert('error', 'Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan.');
    }
  } catch (err) {
    showAlert('error', 'Koneksi Gagal', err.message);
  } finally {
    btnSaveConfig.disabled = false;
    btnSaveConfig.innerHTML = '<span>💾</span> Simpan Pengaturan';
  }
}

// 8. PLU Modal Handlers
function openPluModal() {
  modalTextareaPlu.value = (currentConfig.plus || []).join('\n');
  updateModalCounter();
  pluModalOverlay.classList.add('active');
  modalTextareaPlu.focus();
}

function closePluModal() {
  pluModalOverlay.classList.remove('active');
}

function updateModalCounter() {
  const plus = parsePluText(modalTextareaPlu.value);
  modalPluCounter.textContent = `${plus.length} PLU Terdeteksi`;
}

async function savePluFromModal() {
  const plus = parsePluText(modalTextareaPlu.value);

  const payload = {
    plus: plus
  };

  try {
    btnSavePluModal.disabled = true;
    btnSavePluModal.innerHTML = '<span>⏳</span> Menyimpan...';

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showAlert('success', 'Daftar PLU Tersimpan', `${plus.length} nomor PLU manual berhasil disimpan.`);
      closePluModal();
      loadConfig();
    } else {
      showAlert('error', 'Gagal Menyimpan', 'Gagal memperbarui daftar PLU.');
    }
  } catch (err) {
    showAlert('error', 'Koneksi Gagal', err.message);
  } finally {
    btnSavePluModal.disabled = false;
    btnSavePluModal.innerHTML = '<span>💾</span> Simpan & Terapkan';
  }
}

// 9. Database Modal Handlers
function openDbModal() {
  dbModalOverlay.classList.add('active');
}

function closeDbModal() {
  dbModalOverlay.classList.remove('active');
}

async function testDbConnection() {
  const dbConfig = {
    host: dbHost.value.trim(),
    port: parseInt(dbPort.value, 10) || 5432,
    user: dbUser.value.trim(),
    password: dbPassword.value,
    database: dbDatabase.value.trim()
  };

  try {
    btnTestDbConnection.disabled = true;
    btnTestDbConnection.innerHTML = '<span>⏳</span> Menguji...';
    showAlert('info', 'Menguji Koneksi', 'Menghubungkan ke PostgreSQL...');

    const res = await fetch('/api/db/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbConfig })
    });

    const data = await res.json();
    if (data.success) {
      showAlert('success', 'Koneksi Berhasil!', data.message);
    } else {
      showAlert('error', 'Koneksi Gagal', data.error);
    }
  } catch (err) {
    showAlert('error', 'Kesalahan Sistem', err.message);
  } finally {
    btnTestDbConnection.disabled = false;
    btnTestDbConnection.innerHTML = '<span>🔌</span> Tes Koneksi';
  }
}

async function saveDbConfigFromModal() {
  const dbConfig = {
    host: dbHost.value.trim(),
    port: parseInt(dbPort.value, 10) || 5432,
    user: dbUser.value.trim(),
    password: dbPassword.value,
    database: dbDatabase.value.trim()
  };

  const payload = {
    dbConfig,
    customQuery: dbCustomQuery.value.trim()
  };

  try {
    btnSaveDbModal.disabled = true;
    btnSaveDbModal.innerHTML = '<span>⏳</span> Menyimpan...';

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showAlert('success', 'Konfigurasi DB Disimpan', 'Pengaturan database PostgreSQL berhasil diperbarui.');
      closeDbModal();
      loadConfig();
    } else {
      showAlert('error', 'Gagal Menyimpan', 'Gagal memperbarui konfigurasi DB.');
    }
  } catch (err) {
    showAlert('error', 'Koneksi Gagal', err.message);
  } finally {
    btnSaveDbModal.disabled = false;
    btnSaveDbModal.innerHTML = '<span>💾</span> Simpan Konfigurasi DB';
  }
}

// 10. Run Query Preview / Refresh DB Table
async function runQueryPreview() {
  try {
    btnRunQueryPreview.disabled = true;
    btnRunQueryPreview.innerHTML = '<span>⏳</span> Mengambil Data...';
    tableDbBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Sedang mengeksekusi query margin minus ke PostgreSQL...</td>
      </tr>
    `;

    const res = await fetch('/api/db/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await res.json();
    if (data.success && data.items) {
      renderDbTable(data.items);
      badgeDbCount.textContent = `${data.items.length} Item`;
      dbLastQueryStatus.textContent = `Terakhir: ${new Date().toLocaleTimeString('id-ID')} (${data.items.length} item margin minus)`;
      showAlert('success', 'Query Selesai', `Ditemukan ${data.items.length} item Margin Minus di database.`);
    } else {
      tableDbBody.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal: ${data.error || 'Query tidak berhasil'}</td></tr>`;
      showAlert('error', 'Query Gagal', data.error || 'Periksa koneksi PostgreSQL');
    }
  } catch (err) {
    showAlert('error', 'Kesalahan Sistem', err.message);
  } finally {
    btnRunQueryPreview.disabled = false;
    btnRunQueryPreview.innerHTML = '<span>📊</span> Refresh Data DB';
  }
}

function renderDbTable(items) {
  if (items.length === 0) {
    tableDbBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Tidak ada item margin minus ditemukan dalam database saat ini (Kondisi Aman).</td>
      </tr>
    `;
    return;
  }

  tableDbBody.innerHTML = items.map(item => {
    const isMinusA = item.marginA !== '-' && parseFloat(item.marginA) < 0;
    const isMinusMd = item.marginMd !== '-' && parseFloat(item.marginMd) < 0;

    const badgeClassA = isMinusA ? 'badge-danger' : 'badge-info';
    const badgeClassMd = isMinusMd ? 'badge-danger' : 'badge-info';

    const hrgText = item.hrgP && item.hrgP !== '-' 
      ? `Rp ${Number(item.hrg).toLocaleString('id-ID')} / <strong style="color:#f59e0b">Rp ${Number(item.hrgP).toLocaleString('id-ID')}</strong>`
      : `Rp ${Number(item.hrg).toLocaleString('id-ID')}`;

    return `
      <tr>
        <td><strong>${escapeHtml(item.plu)}</strong></td>
        <td>${escapeHtml(item.deskripsi)}</td>
        <td>${escapeHtml(item.lpp.toString())}</td>
        <td>${hrgText}</td>
        <td><span class="badge ${badgeClassA}">${escapeHtml(item.marginA)}%</span></td>
        <td><span class="badge ${badgeClassMd}">${escapeHtml(item.marginMd)}%</span></td>
      </tr>
    `;
  }).join('');
}

// 11. Trigger Auto-Guard Marmin Instantly
function triggerMarminGuardNow() {
  showConfirmDialog(
    'Jalankan Guard Margin Minus Sekarang?',
    'Sistem akan mengecek database PostgreSQL. Jika ada item Margin Minus yang terdeteksi, item tersebut akan LANGSUNG DINONAKTIFKAN di CMS saat ini juga.',
    async () => {
      try {
        const res = await fetch('/api/run-marmin-now', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showAlert('info', 'Guard Berjalan', 'Pengecekan Margin Minus telah dimulai di latar belakang.');
          updateRunningState(true);
        } else {
          showAlert('error', 'Gagal Memulai', data.message);
        }
      } catch (err) {
        showAlert('error', 'Kesalahan Sistem', err.message);
      }
    }
  );
}

// 12. Trigger Manual PLU Schedule Instantly
function triggerManualScheduleNow() {
  const count = (currentConfig.plus || []).length;
  if (count === 0) {
    showAlert('warning', 'Daftar PLU Kosong', 'Silakan klik "Input / Edit PLU" untuk menambahkan PLU manual terlebih dahulu.');
    return;
  }

  const actionText = (currentConfig.dailyAction || 'nonaktif').toUpperCase();

  showConfirmDialog(
    'Jalankan PLU Manual Sekarang?',
    `Apakah Anda ingin memproses ${count} PLU manual untuk aksi [${actionText}] saat ini?`,
    async () => {
      try {
        const res = await fetch('/api/run-manual-now', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showAlert('info', 'Otomatisasi Berjalan', 'Proses eksekusi PLU manual telah dimulai di latar belakang.');
          updateRunningState(true);
        } else {
          showAlert('error', 'Gagal Memulai', data.message);
        }
      } catch (err) {
        showAlert('error', 'Kesalahan Sistem', err.message);
      }
    }
  );
}

// 13. Live Logs Polling
let lastLogCount = 0;
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();

    updateRunningState(data.isRunning);

    if (data.logs && data.logs.length !== lastLogCount) {
      lastLogCount = data.logs.length;
      renderLogs(data.logs);
    }
  } catch (err) {}
}

function renderLogs(logs) {
  if (logs.length === 0) {
    logConsole.innerHTML = `
      <div class="log-line info">
        <span class="log-time">[--:--:--]</span>
        <span class="log-msg">Belum ada aktivitas log.</span>
      </div>
    `;
    return;
  }

  logConsole.innerHTML = logs.map(l => {
    return `
      <div class="log-line ${l.level || 'info'}">
        <span class="log-time">[${l.timestamp}]</span>
        <span class="log-msg">${escapeHtml(l.message)}</span>
      </div>
    `;
  }).join('');

  logConsole.scrollTop = logConsole.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// 14. Clear Logs
async function clearLogs() {
  try {
    await fetch('/api/logs/clear', { method: 'POST' });
    lastLogCount = 0;
    fetchLogs();
    showAlert('info', 'Log Dibersihkan', 'Riwayat log aktivitas telah dikosongkan.');
  } catch (err) {}
}

// Event Listeners
btnSaveConfig.addEventListener('click', saveAllConfig);
toggleMarminGuard.addEventListener('change', saveAllConfig);
selectMarminInterval.addEventListener('change', saveAllConfig);
toggleDailySchedule.addEventListener('change', saveAllConfig);
selectDailyAction.addEventListener('change', saveAllConfig);

btnRunMarminGuardNow.addEventListener('click', triggerMarminGuardNow);
btnRunMarminDirect.addEventListener('click', triggerMarminGuardNow);
btnRunManualDirect.addEventListener('click', triggerManualScheduleNow);

btnRunQueryPreview.addEventListener('click', runQueryPreview);
btnClearLogs.addEventListener('click', clearLogs);

// PLU Modal Events
btnOpenPluModal.addEventListener('click', openPluModal);
btnClosePluModal.addEventListener('click', closePluModal);
btnCancelPluModal.addEventListener('click', closePluModal);
btnSavePluModal.addEventListener('click', savePluFromModal);
modalTextareaPlu.addEventListener('input', updateModalCounter);
btnModalClear.addEventListener('click', () => {
  modalTextareaPlu.value = '';
  updateModalCounter();
});

// DB Modal Events
btnOpenDbModal.addEventListener('click', openDbModal);
btnCloseDbModal.addEventListener('click', closeDbModal);
btnCancelDbModal.addEventListener('click', closeDbModal);
btnTestDbConnection.addEventListener('click', testDbConnection);
btnSaveDbModal.addEventListener('click', saveDbConfigFromModal);

// Import File into modal
modalFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    modalTextareaPlu.value = event.target.result;
    updateModalCounter();
    showAlert('success', 'File Dimuat', `File "${file.name}" berhasil dimasukkan ke daftar.`);
  };
  reader.readAsText(file);
});

// Close modals on backdrop click or Escape key
pluModalOverlay.addEventListener('click', (e) => {
  if (e.target === pluModalOverlay) closePluModal();
});
dbModalOverlay.addEventListener('click', (e) => {
  if (e.target === dbModalOverlay) closeDbModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (pluModalOverlay.classList.contains('active')) closePluModal();
    if (dbModalOverlay.classList.contains('active')) closeDbModal();
    if (confirmModalOverlay.classList.contains('active')) closeConfirmDialog();
  }
});

// Initial Load
loadConfig();
setInterval(fetchLogs, 1500);
fetchLogs();

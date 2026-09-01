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
const btnThemeToggle = document.getElementById('btnThemeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');

// Theme Management (Light / Dark)
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (theme === 'light') {
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Light';
  } else {
    if (themeIcon) themeIcon.textContent = '🌙';
    if (themeText) themeText.textContent = 'Dark';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', toggleTheme);
}

// Auto-Guard Marmin Elements
const toggleMarminGuard = document.getElementById('toggleMarminGuard');
const selectMarminInterval = document.getElementById('selectMarminInterval');
const btnRunMarminGuardNow = document.getElementById('btnRunMarminGuardNow');

// Daily Manual Schedule Elements
const toggleDailySchedule = document.getElementById('toggleDailySchedule');
const inputDailyTime = document.getElementById('inputDailyTime');
const selectDailyAction = document.getElementById('selectDailyAction');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const btnRunManualDirect = document.getElementById('btnRunManualDirect');

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
    btnRunManualDirect.disabled = true;
  } else {
    btnRunMarminGuardNow.disabled = false;
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

// Sidebar & Multi-Module Navigation Elements
const adminSidebar = document.getElementById('adminSidebar');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const currentViewTitle = document.getElementById('currentViewTitle');
const navStokPoin = document.getElementById('navStokPoin');
const navIAS = document.getElementById('navIAS');
const btnSidebarDb = document.getElementById('btnSidebarDb');
const viewStokPoin = document.getElementById('viewStokPoin');
const viewIAS = document.getElementById('viewIAS');


function switchAdminView(targetViewId) {
  const views = {
    viewStokPoin: { title: 'CMS StokPoin', element: viewStokPoin, nav: navStokPoin },
    viewIAS: { title: 'Otomasi Web IAS', element: viewIAS, nav: navIAS }
  };

  const target = views[targetViewId] || views.viewStokPoin;

  // Toggle active view
  Object.values(views).forEach(v => {
    if (v.element) v.element.classList.remove('active');
    if (v.nav) v.nav.classList.remove('active');
  });

  if (target.element) target.element.classList.add('active');
  if (target.nav) target.nav.classList.add('active');
  if (currentViewTitle) currentViewTitle.textContent = target.title;

  localStorage.setItem('activeAdminView', targetViewId);

  if (targetViewId === 'viewIAS' && typeof loadIasTasksStatus === 'function') {
    populateDefaultDates();
    loadIasTasksStatus(true);
  }
}

function initAdminNav() {
  if (navStokPoin) {
    navStokPoin.addEventListener('click', () => switchAdminView('viewStokPoin'));
  }
  if (navIAS) {
    navIAS.addEventListener('click', () => switchAdminView('viewIAS'));
  }
  if (btnSidebarDb) {
    btnSidebarDb.addEventListener('click', openDbModal);
  }
  if (btnToggleSidebar && adminSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      adminSidebar.classList.toggle('open');
    });
  }

  // Restore saved view or default to viewStokPoin
  const savedView = localStorage.getItem('activeAdminView') || 'viewStokPoin';
  switchAdminView(savedView);
}

// ============================================================================
// MODUL OTOMASI WEB IAS (Task Hitstok & Proses LPP)
// ============================================================================
const inputIasUrl = document.getElementById('inputIasUrl');
const selectIasKoneksi = document.getElementById('selectIasKoneksi');
const inputIasUser = document.getElementById('inputIasUser');
const inputIasPassword = document.getElementById('inputIasPassword');
const btnSaveIasConfig = document.getElementById('btnSaveIasConfig');
const btnTestIasLogin = document.getElementById('btnTestIasLogin');
const btnClearIasLogs = document.getElementById('btnClearIasLogs');
const logIasConsole = document.getElementById('logIasConsole');
const tableIasBody = document.getElementById('tableIasBody');
const badgeIasQueueCount = document.getElementById('badgeIasQueueCount');
const btnRefreshAllIasStatus = document.getElementById('btnRefreshAllIasStatus');
const cardIasLastRefresh = document.getElementById('cardIasLastRefresh');

// Task 1: Hitstok Selectors
const hitstokPeriode1 = document.getElementById('hitstokPeriode1');
const hitstokPeriode2 = document.getElementById('hitstokPeriode2');
const hitstokPlu1 = document.getElementById('hitstokPlu1');
const hitstokPlu2 = document.getElementById('hitstokPlu2');
const checkHitstokOnlineStock = document.getElementById('checkHitstokOnlineStock');
const btnRunHitstok = document.getElementById('btnRunHitstok');
const btnCheckHitstokStatus = document.getElementById('btnCheckHitstokStatus');
const badgeHitstokStatus = document.getElementById('badgeHitstokStatus');
const cardHitstokStatus = document.getElementById('cardHitstokStatus');
const cardHitstokDetail = document.getElementById('cardHitstokDetail');
const hitstokLastRunTime = document.getElementById('hitstokLastRunTime');
const hitstokLastStatus = document.getElementById('hitstokLastStatus');
const hitstokLastPluRange = document.getElementById('hitstokLastPluRange');

// Task 2: LPP Selectors
const tabLppBulanan = document.getElementById('tabLppBulanan');
const tabLppHarian = document.getElementById('tabLppHarian');
const sectionLppHarianFields = document.getElementById('sectionLppHarianFields');
const lppPeriode1 = document.getElementById('lppPeriode1');
const lppPeriode2 = document.getElementById('lppPeriode2');
const lppTanggalSo = document.getElementById('lppTanggalSo');
const checkLppAudit = document.getElementById('checkLppAudit');
const btnRunLpp = document.getElementById('btnRunLpp');
const btnCheckLppStatus = document.getElementById('btnCheckLppStatus');
const badgeLppStatus = document.getElementById('badgeLppStatus');
const cardLppStatus = document.getElementById('cardLppStatus');
const cardLppDetail = document.getElementById('cardLppDetail');
const lppLastRunTime = document.getElementById('lppLastRunTime');
const lppLastMode = document.getElementById('lppLastMode');
const lppLastTimeWindow = document.getElementById('lppLastTimeWindow');
const lppLastStatus = document.getElementById('lppLastStatus');

let currentLppMode = 'bulanan';

function addIasLog(type, msg) {
  if (!logIasConsole) return;
  const time = new Date().toLocaleTimeString('id-ID');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${escapeHtml(msg)}</span>`;
  logIasConsole.appendChild(line);
  logIasConsole.scrollTop = logIasConsole.scrollHeight;
}

function renderTaskBadge(el, statusText) {
  if (!el) return;
  const st = (statusText || 'STANDBY').toUpperCase();
  el.className = 'task-badge-live';
  if (st === 'DONE' || st === 'SUCCESS') {
    el.classList.add('task-badge-done');
    el.innerHTML = `<span>●</span> DONE`;
  } else if (st === 'LOADING' || st === 'EXEC') {
    el.classList.add('task-badge-loading');
    el.innerHTML = `<span>⏳</span> ${st}`;
  } else if (st === 'WAITING' || st === 'STANDBY') {
    el.classList.add('task-badge-waiting');
    el.innerHTML = `<span>●</span> ${st}`;
  } else {
    el.classList.add('task-badge-error');
    el.innerHTML = `<span>●</span> ${st}`;
  }
}

function populateDefaultDates() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  const startOfMonth = `01/${month}/${year}`;
  const today = `${day}/${month}/${year}`;

  if (hitstokPeriode1 && !hitstokPeriode1.value) hitstokPeriode1.value = startOfMonth;
  if (hitstokPeriode2 && !hitstokPeriode2.value) hitstokPeriode2.value = today;

  if (lppPeriode1 && !lppPeriode1.value) lppPeriode1.value = startOfMonth;
  if (lppPeriode2 && !lppPeriode2.value) lppPeriode2.value = today;
  if (lppTanggalSo && !lppTanggalSo.value) lppTanggalSo.value = today;
}

// Load IAS Config
async function loadIasConfig() {
  try {
    const res = await fetch('/api/ias/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (inputIasUrl && cfg.baseUrl) inputIasUrl.value = cfg.baseUrl;
    if (selectIasKoneksi && cfg.koneksi) selectIasKoneksi.value = cfg.koneksi;
    if (inputIasUser && cfg.username) inputIasUser.value = cfg.username;
    if (inputIasPassword && cfg.password) inputIasPassword.value = cfg.password;
  } catch (e) {
    console.error('Failed to load IAS config:', e);
  }
}

// Load and Refresh Live Tasks Status (Hitstok & LPP)
async function loadIasTasksStatus(silent = false) {
  try {
    if (!silent && btnRefreshAllIasStatus) {
      btnRefreshAllIasStatus.disabled = true;
      btnRefreshAllIasStatus.innerHTML = `<span>⏳</span> Memeriksa...`;
    }

    const res = await fetch('/api/ias/tasks/status');
    const data = await res.json();

    if (data.success) {
      // 1. Render Hitstok
      if (data.hitstok) {
        const hData = data.hitstok.data;
        let isDone = false;
        if (Array.isArray(hData)) {
          isDone = hData.every(d => d.status === 'DONE');
        }
        const statusText = isDone ? 'DONE' : (hData?.[0]?.status || 'STANDBY');
        renderTaskBadge(badgeHitstokStatus, statusText);
        if (cardHitstokStatus) {
          cardHitstokStatus.textContent = statusText;
          cardHitstokStatus.style.color = statusText === 'DONE' ? 'var(--success)' : 'var(--warning)';
        }
      }

      if (data.lastHitstokRun) {
        if (hitstokLastRunTime) hitstokLastRunTime.textContent = data.lastHitstokRun.time || '-';
        if (hitstokLastStatus) {
          hitstokLastStatus.textContent = data.lastHitstokRun.status || '-';
          hitstokLastStatus.style.color = data.lastHitstokRun.status === 'DONE' ? 'var(--success)' : 'var(--warning)';
        }
        if (hitstokLastPluRange) hitstokLastPluRange.textContent = data.lastHitstokRun.pluRange || 'SEMUA PLU';
      }

      // 2. Render LPP
      if (data.lpp) {
        const lData = data.lpp.data;
        const statusText = lData?.status || 'STANDBY';
        renderTaskBadge(badgeLppStatus, statusText);
        if (cardLppStatus) {
          cardLppStatus.textContent = statusText;
          cardLppStatus.style.color = statusText === 'DONE' ? 'var(--success)' : 'var(--warning)';
        }
      }

      if (data.lastLppRun) {
        if (lppLastRunTime) lppLastRunTime.textContent = data.lastLppRun.time || '-';
        if (lppLastMode) lppLastMode.textContent = data.lastLppRun.mode || 'Bulanan';
        if (lppLastTimeWindow) lppLastTimeWindow.textContent = `${data.lastLppRun.startTime || '-'} / ${data.lastLppRun.endTime || '-'}`;
        if (lppLastStatus) {
          lppLastStatus.textContent = data.lastLppRun.status || '-';
          lppLastStatus.style.color = data.lastLppRun.status === 'DONE' ? 'var(--success)' : 'var(--warning)';
        }
      }

      if (cardIasLastRefresh) {
        cardIasLastRefresh.textContent = `Update: ${new Date().toLocaleTimeString('id-ID')}`;
      }

      updateIasSummaryTable(data);
      if (!silent) showAlert('success', 'Status IAS Diperbarui', 'Status Hitstok dan LPP berhasil diperbarui dari Web IAS.');
    }
  } catch (err) {
    console.error('Gagal mengambil status tasks IAS:', err);
    if (!silent) showAlert('error', 'Koneksi IAS Gagal', err.message);
  } finally {
    if (btnRefreshAllIasStatus) {
      btnRefreshAllIasStatus.disabled = false;
      btnRefreshAllIasStatus.innerHTML = `<span>🔄</span> Cek Status Semua Task`;
    }
  }
}

function updateIasSummaryTable(data) {
  if (!tableIasBody) return;
  const rows = [];

  if (data.lastHitstokRun) {
    rows.push(`
      <tr>
        <td><code>${data.lastHitstokRun.time}</code></td>
        <td><strong>Proses Hitstok</strong></td>
        <td><span class="badge ${data.lastHitstokRun.status === 'DONE' ? 'badge-success' : 'badge-warning'}">${data.lastHitstokRun.status}</span></td>
        <td>${data.lastHitstokRun.periode || '-'} (PLU: ${data.lastHitstokRun.pluRange || 'ALL'})</td>
      </tr>
    `);
  } else {
    rows.push(`
      <tr>
        <td>-</td>
        <td><strong>Proses Hitstok</strong></td>
        <td><span class="badge badge-info">STANDBY</span></td>
        <td>Siap dijalankan</td>
      </tr>
    `);
  }

  if (data.lastLppRun) {
    rows.push(`
      <tr>
        <td><code>${data.lastLppRun.time}</code></td>
        <td><strong>Proses LPP (${data.lastLppRun.mode || 'Bulanan'})</strong></td>
        <td><span class="badge ${data.lastLppRun.status === 'DONE' ? 'badge-success' : 'badge-warning'}">${data.lastLppRun.status}</span></td>
        <td>${data.lastLppRun.periode || '-'}</td>
      </tr>
    `);
  } else {
    rows.push(`
      <tr>
        <td>-</td>
        <td><strong>Proses LPP</strong></td>
        <td><span class="badge badge-info">STANDBY</span></td>
        <td>Siap dijalankan</td>
      </tr>
    `);
  }

  tableIasBody.innerHTML = rows.join('');
}

// Mode Tab Switching for LPP
if (tabLppBulanan && tabLppHarian) {
  tabLppBulanan.addEventListener('click', () => {
    currentLppMode = 'bulanan';
    tabLppBulanan.classList.add('active');
    tabLppHarian.classList.remove('active');
    if (sectionLppHarianFields) sectionLppHarianFields.style.display = 'none';
  });

  tabLppHarian.addEventListener('click', () => {
    currentLppMode = 'harian';
    tabLppHarian.classList.add('active');
    tabLppBulanan.classList.remove('active');
    if (sectionLppHarianFields) sectionLppHarianFields.style.display = 'block';
  });
}

// Event: Run Task 1 (Hitstok)
if (btnRunHitstok) {
  btnRunHitstok.addEventListener('click', async () => {
    const originalHtml = btnRunHitstok.innerHTML;
    btnRunHitstok.disabled = true;
    btnRunHitstok.innerHTML = `<span>⏳</span> Memproses Hitstok...`;
    renderTaskBadge(badgeHitstokStatus, 'LOADING');

    const payload = {
      periode1: hitstokPeriode1 ? hitstokPeriode1.value.trim() : '',
      periode2: hitstokPeriode2 ? hitstokPeriode2.value.trim() : '',
      plu1: hitstokPlu1 ? hitstokPlu1.value.trim() : '',
      plu2: hitstokPlu2 ? hitstokPlu2.value.trim() : '',
      updateOnlineStock: checkHitstokOnlineStock ? checkHitstokOnlineStock.checked : true
    };

    addIasLog('info', `🚀 Memulai eksekusi Task Hitstok (Periode: ${payload.periode1} s/d ${payload.periode2}, PLU: ${payload.plu1 || 'ALL'})...`);
    showAlert('info', 'Task Hitstok Dimulai', 'Sedang menjalankan proses hitung ulang stock di Web IAS...');

    try {
      const res = await fetch('/api/ias/tasks/hitstok/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        addIasLog('success', `✅ Task Hitung Ulang Stock selesai dengan status: ${result.status}`);
        showAlert('success', 'Hitstok Selesai', `Proses Hitung Ulang Stock berhasil dieksekusi (${result.status})`);
      } else {
        addIasLog('error', `❌ Task Hitstok gagal: ${result.error}`);
        showAlert('error', 'Hitstok Gagal', result.error || 'Terjadi kesalahan eksekusi.');
      }
      await loadIasTasksStatus(true);
    } catch (err) {
      addIasLog('error', `❌ Error request Hitstok: ${err.message}`);
      showAlert('error', 'Error Jaringan', err.message);
    } finally {
      btnRunHitstok.disabled = false;
      btnRunHitstok.innerHTML = originalHtml;
    }
  });
}

// Event: Check Status Hitstok
if (btnCheckHitstokStatus) {
  btnCheckHitstokStatus.addEventListener('click', () => {
    loadIasTasksStatus(false);
  });
}

// Event: Run Task 2 (Proses LPP)
if (btnRunLpp) {
  btnRunLpp.addEventListener('click', async () => {
    const originalHtml = btnRunLpp.innerHTML;
    btnRunLpp.disabled = true;
    btnRunLpp.innerHTML = `<span>⏳</span> Memproses LPP...`;
    renderTaskBadge(badgeLppStatus, 'LOADING');

    const payload = {
      mode: currentLppMode,
      periode1: lppPeriode1 ? lppPeriode1.value.trim() : '',
      periode2: lppPeriode2 ? lppPeriode2.value.trim() : '',
      tanggalSo: lppTanggalSo ? lppTanggalSo.value.trim() : '',
      khususAudit: checkLppAudit ? checkLppAudit.checked : false
    };

    addIasLog('info', `🚀 Memulai eksekusi Task Proses LPP (${currentLppMode.toUpperCase()}, Periode: ${payload.periode1} s/d ${payload.periode2})...`);
    showAlert('info', 'Task LPP Dimulai', `Sedang menjalankan proses LPP ${currentLppMode} di Web IAS...`);

    try {
      const res = await fetch('/api/ias/tasks/lpp/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        addIasLog('success', `✅ Task Proses LPP selesai! Status: ${result.status} (Start: ${result.startTime || '-'}, Finish: ${result.endTime || '-'})`);
        showAlert('success', 'Proses LPP Selesai', `Proses LPP (${result.mode}) berhasil dieksekusi dengan status: ${result.status}`);
      } else {
        addIasLog('error', `❌ Task Proses LPP gagal: ${result.error}`);
        showAlert('error', 'LPP Gagal', result.error || 'Terjadi kesalahan eksekusi.');
      }
      await loadIasTasksStatus(true);
    } catch (err) {
      addIasLog('error', `❌ Error request LPP: ${err.message}`);
      showAlert('error', 'Error Jaringan', err.message);
    } finally {
      btnRunLpp.disabled = false;
      btnRunLpp.innerHTML = originalHtml;
    }
  });
}

// Event: Check Status LPP
if (btnCheckLppStatus) {
  btnCheckLppStatus.addEventListener('click', () => {
    loadIasTasksStatus(false);
  });
}

// Event: Refresh All IAS Tasks Status
if (btnRefreshAllIasStatus) {
  btnRefreshAllIasStatus.addEventListener('click', () => {
    loadIasTasksStatus(false);
  });
}

// Event: Save IAS Config
if (btnSaveIasConfig) {
  btnSaveIasConfig.addEventListener('click', async () => {
    try {
      const payload = {
        baseUrl: inputIasUrl.value.trim(),
        koneksi: selectIasKoneksi.value,
        username: inputIasUser.value.trim(),
        password: inputIasPassword.value.trim()
      };
      const res = await fetch('/api/ias/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', 'Konfigurasi IAS Disimpan', 'Pengaturan URL, kredensial, dan koneksi Web IAS berhasil disimpan.');
        addIasLog('success', '💾 Pengaturan konfigurasi Web IAS berhasil disimpan.');
      } else {
        showAlert('error', 'Gagal Menyimpan', data.error || 'Terjadi kesalahan.');
      }
    } catch (err) {
      showAlert('error', 'Gagal', err.message);
    }
  });
}

// Event: Test Login Web IAS
if (btnTestIasLogin) {
  btnTestIasLogin.addEventListener('click', async () => {
    const originalText = btnTestIasLogin.innerHTML;
    btnTestIasLogin.disabled = true;
    btnTestIasLogin.innerHTML = `<span>⏳</span> Menguji Login...`;

    addIasLog('info', `🌐 Menguji login ke ${inputIasUrl.value} (Koneksi: ${selectIasKoneksi.value.toUpperCase()}, User: ${inputIasUser.value})...`);

    try {
      const payload = {
        baseUrl: inputIasUrl.value.trim(),
        koneksi: selectIasKoneksi.value,
        username: inputIasUser.value.trim(),
        password: inputIasPassword.value.trim(),
        autoResetSession: true
      };

      const res = await fetch('/api/ias/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showAlert('success', 'Login IAS Sukses', data.message || 'Berhasil login ke Web IAS!');
        addIasLog('success', `✅ ${data.message}`);
        addIasLog('info', `📍 Berhasil diarahkan ke Dashboard: ${data.url} ("${data.title}")`);
      } else {
        showAlert('error', 'Login IAS Gagal', data.error || 'Gagal login.');
        addIasLog('error', `❌ Gagal login: ${data.error}`);
      }
    } catch (err) {
      showAlert('error', 'Error Jaringan', err.message);
      addIasLog('error', `❌ Error: ${err.message}`);
    } finally {
      btnTestIasLogin.disabled = false;
      btnTestIasLogin.innerHTML = originalText;
    }
  });
}

// Event: Clear IAS Logs
if (btnClearIasLogs) {
  btnClearIasLogs.addEventListener('click', () => {
    if (logIasConsole) logIasConsole.innerHTML = '';
    addIasLog('info', 'Log aktivitas Web IAS telah dibersihkan.');
  });
}

// Initial Load
initTheme();
initAdminNav();
populateDefaultDates();
loadConfig();
loadIasConfig();
setInterval(fetchLogs, 1500);
fetchLogs();


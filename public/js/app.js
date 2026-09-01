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

  if (targetViewId === 'viewIAS') {
    if (typeof populateDefaultDates === 'function') populateDefaultDates();
    if (typeof autoConnectIasBackground === 'function') autoConnectIasBackground();
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
const cardIasSessionValue = document.getElementById('cardIasSessionValue');
const cardIasSessionDetail = document.getElementById('cardIasSessionDetail');
const badgeIasAutoLogin = document.getElementById('badgeIasAutoLogin');
const btnToggleIasConfig = document.getElementById('btnToggleIasConfig');
const drawerIasConfig = document.getElementById('drawerIasConfig');

if (btnToggleIasConfig && drawerIasConfig) {
  btnToggleIasConfig.addEventListener('click', () => {
    const isHidden = drawerIasConfig.style.display === 'none' || !drawerIasConfig.style.display;
    drawerIasConfig.style.display = isHidden ? 'block' : 'none';
    btnToggleIasConfig.classList.toggle('active', isHidden);
  });
}

let isIasConnecting = false;

// Auto-connect / Login otomatis di latar belakang saat buka menu
async function autoConnectIasBackground() {
  if (isIasConnecting) return;
  isIasConnecting = true;

  if (cardIasSessionValue) {
    cardIasSessionValue.innerHTML = `<span style="color: var(--warning);">⏳ MENYIAPKAN SESI...</span>`;
  }
  if (cardIasSessionDetail) {
    cardIasSessionDetail.textContent = `Auto-login latar belakang sedang berjalan...`;
  }
  if (badgeIasAutoLogin) {
    badgeIasAutoLogin.className = 'badge badge-warning';
    badgeIasAutoLogin.innerHTML = `<span class="live-dot" style="width:6px;height:6px;background:#f59e0b;border-radius:50%;display:inline-block;margin-right:4px;"></span>Menghubungkan...`;
  }

  addIasLog('info', '🌐 Menjalankan login Web IAS otomatis di latar belakang...');

  try {
    const payload = {
      baseUrl: inputIasUrl ? inputIasUrl.value.trim() : 'http://172.31.146.190',
      koneksi: selectIasKoneksi ? selectIasKoneksi.value : 'sim',
      username: inputIasUser ? inputIasUser.value.trim() : 'RIS',
      password: inputIasPassword ? inputIasPassword.value.trim() : '061201',
      autoResetSession: true
    };

    const res = await fetch('/api/ias/auto-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      const sess = data.session || {};
      if (cardIasSessionValue) {
        cardIasSessionValue.innerHTML = `<span style="color: var(--success);">🟢 TERHUBUNG (${sess.user || 'RIS'})</span>`;
      }
      if (cardIasSessionDetail) {
        cardIasSessionDetail.textContent = `Sesi aktif (${sess.koneksi || 'SIMULASI'}) • Terhubung: ${sess.lastConnected || 'Barusan'}`;
      }
      if (badgeIasAutoLogin) {
        badgeIasAutoLogin.className = 'badge badge-success';
        badgeIasAutoLogin.innerHTML = `<span class="live-dot" style="width:6px;height:6px;background:#34d399;border-radius:50%;display:inline-block;margin-right:4px;"></span>Auto-Login Latar Belakang`;
      }
      addIasLog('success', `✅ Sesi Web IAS aktif di latar belakang (${sess.koneksi || 'SIMULASI'} - ${sess.user || 'RIS'})`);

      // Update tasks status immediately from background session response
      if (data.tasks) {
        applyTasksDataToUi(data.tasks);
      }
    } else {
      if (cardIasSessionValue) {
        cardIasSessionValue.innerHTML = `<span style="color: var(--danger);">❌ GAGAL LOGIN</span>`;
      }
      if (cardIasSessionDetail) {
        cardIasSessionDetail.textContent = data.error ? data.error.slice(0, 45) : 'Gagal login latar belakang';
      }
      if (badgeIasAutoLogin) {
        badgeIasAutoLogin.className = 'badge badge-danger';
        badgeIasAutoLogin.textContent = 'Gagal Login';
      }
      addIasLog('error', `❌ Auto-login latar belakang gagal: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Auto-connect error:', err);
    if (cardIasSessionValue) {
      cardIasSessionValue.innerHTML = `<span style="color: var(--danger);">❌ OFFLINE</span>`;
    }
    if (cardIasSessionDetail) {
      cardIasSessionDetail.textContent = err.message;
    }
    addIasLog('error', `❌ Auto-login error: ${err.message}`);
  } finally {
    isIasConnecting = false;
  }
}

// Unified IAS Period Selectors
const iasSharedPeriode1 = document.getElementById('iasSharedPeriode1');
const iasSharedPeriode2 = document.getElementById('iasSharedPeriode2');
const btnQuickThisMonth = document.getElementById('btnQuickThisMonth');
const btnQuickPrevMonth = document.getElementById('btnQuickPrevMonth');
const btnQuickToday = document.getElementById('btnQuickToday');
const textLppActivePeriod = document.getElementById('textLppActivePeriod');

// Task 1: Hitstok Selectors
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

// Task 2: LPP Selectors (Bulanan)
const btnRunLpp = document.getElementById('btnRunLpp');
const btnCheckLppStatus = document.getElementById('btnCheckLppStatus');
const badgeLppStatus = document.getElementById('badgeLppStatus');
const cardLppStatus = document.getElementById('cardLppStatus');
const cardLppDetail = document.getElementById('cardLppDetail');
const lppLastRunTime = document.getElementById('lppLastRunTime');
const lppLastMode = document.getElementById('lppLastMode');
const lppLastTimeWindow = document.getElementById('lppLastTimeWindow');
const lppLastStatus = document.getElementById('lppLastStatus');

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

function updateActivePeriodDisplay() {
  if (textLppActivePeriod && iasSharedPeriode1 && iasSharedPeriode2) {
    textLppActivePeriod.textContent = `${iasSharedPeriode1.value} s/d ${iasSharedPeriode2.value}`;
  }
}

function populateDefaultDates() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  const startOfMonth = `01/${month}/${year}`;
  const today = `${day}/${month}/${year}`;

  if (iasSharedPeriode1 && !iasSharedPeriode1.value) iasSharedPeriode1.value = startOfMonth;
  if (iasSharedPeriode2 && !iasSharedPeriode2.value) iasSharedPeriode2.value = today;

  updateActivePeriodDisplay();
}

if (iasSharedPeriode1) {
  iasSharedPeriode1.addEventListener('input', updateActivePeriodDisplay);
  iasSharedPeriode1.addEventListener('change', updateActivePeriodDisplay);
}
if (iasSharedPeriode2) {
  iasSharedPeriode2.addEventListener('input', updateActivePeriodDisplay);
  iasSharedPeriode2.addEventListener('change', updateActivePeriodDisplay);
}

// Quick Date Handlers
if (btnQuickThisMonth) {
  btnQuickThisMonth.addEventListener('click', () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    iasSharedPeriode1.value = `01/${month}/${year}`;
    iasSharedPeriode2.value = `${day}/${month}/${year}`;
    updateActivePeriodDisplay();
    showAlert('info', 'Periode Diubah', `Periode diubah ke Bulan Ini: ${iasSharedPeriode1.value} s/d ${iasSharedPeriode2.value}`);
  });
}

if (btnQuickPrevMonth) {
  btnQuickPrevMonth.addEventListener('click', () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const m = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const y = prevMonthDate.getFullYear();
    const lastDay = String(lastDayPrevMonth.getDate()).padStart(2, '0');

    iasSharedPeriode1.value = `01/${m}/${y}`;
    iasSharedPeriode2.value = `${lastDay}/${m}/${y}`;
    updateActivePeriodDisplay();
    showAlert('info', 'Periode Diubah', `Periode diubah ke Bulan Lalu: ${iasSharedPeriode1.value} s/d ${iasSharedPeriode2.value}`);
  });
}

if (btnQuickToday) {
  btnQuickToday.addEventListener('click', () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const today = `${day}/${month}/${year}`;
    iasSharedPeriode1.value = today;
    iasSharedPeriode2.value = today;
    updateActivePeriodDisplay();
    showAlert('info', 'Periode Diubah', `Periode diubah ke Hari Ini: ${today}`);
  });
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

// Render data status tugas ke antarmuka UI
function applyTasksDataToUi(data) {
  if (!data || !data.success) return;

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
    if (lppLastMode) lppLastMode.textContent = 'Bulanan';
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
      applyTasksDataToUi(data);
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
        <td><strong>Proses LPP (Bulanan)</strong></td>
        <td><span class="badge ${data.lastLppRun.status === 'DONE' ? 'badge-success' : 'badge-warning'}">${data.lastLppRun.status}</span></td>
        <td>${data.lastLppRun.periode || '-'}</td>
      </tr>
    `);
  } else {
    rows.push(`
      <tr>
        <td>-</td>
        <td><strong>Proses LPP (Bulanan)</strong></td>
        <td><span class="badge badge-info">STANDBY</span></td>
        <td>Siap dijalankan</td>
      </tr>
    `);
  }

  tableIasBody.innerHTML = rows.join('');
}

// Event: Run Task 1 (Hitstok)
if (btnRunHitstok) {
  btnRunHitstok.addEventListener('click', async () => {
    const originalHtml = btnRunHitstok.innerHTML;
    btnRunHitstok.disabled = true;
    btnRunHitstok.innerHTML = `<span>⏳</span> Memproses Hitstok...`;
    renderTaskBadge(badgeHitstokStatus, 'LOADING');

    const payload = {
      periode1: iasSharedPeriode1 ? iasSharedPeriode1.value.trim() : '',
      periode2: iasSharedPeriode2 ? iasSharedPeriode2.value.trim() : '',
      plu1: hitstokPlu1 ? hitstokPlu1.value.trim() : '',
      plu2: hitstokPlu2 ? hitstokPlu2.value.trim() : '',
      updateOnlineStock: checkHitstokOnlineStock ? checkHitstokOnlineStock.checked : true
    };

    addIasLog('info', `🚀 Memulai eksekusi Task Hitstok (Periode: ${payload.periode1} s/d ${payload.periode2}, PLU: ${payload.plu1 || 'ALL'})...`);
    showAlert('info', 'Task Hitstok Dimulai', `Sedang menjalankan proses hitung ulang stock (${payload.periode1} s/d ${payload.periode2})...`);

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

// Event: Run Task 2 (Proses LPP Bulanan)
if (btnRunLpp) {
  btnRunLpp.addEventListener('click', async () => {
    const originalHtml = btnRunLpp.innerHTML;
    btnRunLpp.disabled = true;
    btnRunLpp.innerHTML = `<span>⏳</span> Memproses LPP...`;
    renderTaskBadge(badgeLppStatus, 'LOADING');

    const payload = {
      mode: 'bulanan',
      periode1: iasSharedPeriode1 ? iasSharedPeriode1.value.trim() : '',
      periode2: iasSharedPeriode2 ? iasSharedPeriode2.value.trim() : ''
    };

    addIasLog('info', `🚀 Memulai eksekusi Task Proses LPP Bulanan (Periode: ${payload.periode1} s/d ${payload.periode2})...`);
    showAlert('info', 'Task LPP Dimulai', `Sedang menjalankan proses LPP Bulanan (${payload.periode1} s/d ${payload.periode2})...`);

    try {
      const res = await fetch('/api/ias/tasks/lpp/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        addIasLog('success', `✅ Task Proses LPP selesai! Status: ${result.status} (Start: ${result.startTime || '-'}, Finish: ${result.endTime || '-'})`);
        showAlert('success', 'Proses LPP Selesai', `Proses LPP Bulanan berhasil dieksekusi dengan status: ${result.status}`);
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
        autoConnectIasBackground();
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

// Event: Clear IAS Logs (Terpisah dari CMS StokPoin)
async function clearIasLogsOnServer() {
  try {
    await fetch('/api/ias/logs/clear', { method: 'POST' });
    lastIasLogCount = 0;
    fetchIasLogs();
    showAlert('info', 'Log IAS Dibersihkan', 'Riwayat log aktivitas Web IAS telah dikosongkan.');
  } catch (err) {
    if (logIasConsole) logIasConsole.innerHTML = '';
  }
}

if (btnClearIasLogs) {
  btnClearIasLogs.addEventListener('click', clearIasLogsOnServer);
}

// IAS Live Logs Polling (Terpisah dari terminal CMS StokPoin)
let lastIasLogCount = 0;
async function fetchIasLogs() {
  try {
    const res = await fetch('/api/ias/logs');
    if (!res.ok) return;
    const data = await res.json();

    if (data.logs && data.logs.length !== lastIasLogCount) {
      lastIasLogCount = data.logs.length;
      renderIasLogs(data.logs);
    }
  } catch (err) {}
}

function renderIasLogs(logs) {
  if (!logIasConsole) return;
  if (!logs || logs.length === 0) {
    logIasConsole.innerHTML = `
      <div class="log-line info">
        <span class="log-time">[--:--:--]</span>
        <span class="log-msg">Belum ada aktivitas log Web IAS.</span>
      </div>
    `;
    return;
  }

  logIasConsole.innerHTML = logs.map(l => {
    return `
      <div class="log-line ${l.level || 'info'}">
        <span class="log-time">[${l.timestamp}]</span>
        <span class="log-msg">${escapeHtml(l.message)}</span>
      </div>
    `;
  }).join('');

  logIasConsole.scrollTop = logIasConsole.scrollHeight;
}

// ============================================================================
// TASK 3: REGISTER LPP (Data Pembanding Persediaan)
// ============================================================================
const btnFetchRegisterLpp = document.getElementById('btnFetchRegisterLpp');
const btnCheckRegisterLppLatest = document.getElementById('btnCheckRegisterLppLatest');
const btnOpenLppModal = document.getElementById('btnOpenLppModal');
const btnExportLppCsv = document.getElementById('btnExportLppCsv');
const badgeRegisterLppStatus = document.getElementById('badgeRegisterLppStatus');

const statLppSaldoAwalRp = document.getElementById('statLppSaldoAwalRp');
const statLppSaldoAwalQty = document.getElementById('statLppSaldoAwalQty');
const statLppPembelian = document.getElementById('statLppPembelian');
const statLppPenerimaanLain = document.getElementById('statLppPenerimaanLain');
const statLppPenjualan = document.getElementById('statLppPenjualan');
const statLppPengeluaranLain = document.getElementById('statLppPengeluaranLain');
const statLppSaldoAkhirRp = document.getElementById('statLppSaldoAkhirRp');
const statLppSaldoAkhirQty = document.getElementById('statLppSaldoAkhirQty');

// Modal Elements
const lppModalOverlay = document.getElementById('lppModalOverlay');
const btnCloseLppModal = document.getElementById('btnCloseLppModal');
const btnCloseLppModalBtn = document.getElementById('btnCloseLppModalBtn');
const inputFilterLppTable = document.getElementById('inputFilterLppTable');
const selectFilterLppDivisi = document.getElementById('selectFilterLppDivisi');
const badgeLppRowCount = document.getElementById('badgeLppRowCount');
const tbodyLppDetail = document.getElementById('tbodyLppDetail');

let cachedRegisterLpp = null;

function formatRp(val) {
  if (!val || val === '0' || val === '-') return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function applyLppDataToUi(data) {
  if (!data || !data.success) return;
  cachedRegisterLpp = data;

  const gt = data.grandTotal;
  if (gt) {
    if (statLppSaldoAwalRp) statLppSaldoAwalRp.textContent = `Rp ${gt.saldoAwal?.rp || '0'}`;
    if (statLppSaldoAwalQty) statLppSaldoAwalQty.textContent = `Qty: ${gt.saldoAwal?.qty || '0'}`;

    const murni = parseInt((gt.pembelianMurni || gt.murni || '0').replace(/,/g, ''), 10) || 0;
    const bonus = parseInt((gt.pembelianBonus || gt.bonus || '0').replace(/,/g, ''), 10) || 0;
    if (statLppPembelian) statLppPembelian.textContent = `Rp ${formatRp(murni + bonus)}`;
    if (statLppPenerimaanLain) statLppPenerimaanLain.textContent = `Trf In: ${gt.transferIn || '0'} • Lain: ${gt.penerimaanLain || '0'}`;

    if (statLppPenjualan) statLppPenjualan.textContent = `Rp ${gt.penjualan || '0'}`;
    if (statLppPengeluaranLain) statLppPengeluaranLain.textContent = `Hilang: ${gt.hilang || '0'} • SO: ${gt.so || '0'}`;

    if (statLppSaldoAkhirRp) statLppSaldoAkhirRp.textContent = `Rp ${gt.saldoAkhir?.rp || '0'}`;
    if (statLppSaldoAkhirQty) statLppSaldoAkhirQty.textContent = `Qty: ${gt.saldoAkhir?.qty || '0'}`;
  }

  renderTaskBadge(badgeRegisterLppStatus, 'DONE');

  if (btnOpenLppModal) btnOpenLppModal.style.display = 'inline-flex';
  if (btnExportLppCsv) btnExportLppCsv.style.display = 'inline-flex';

  renderLppTable();
}

function renderLppTable() {
  if (!cachedRegisterLpp || !tbodyLppDetail) return;

  const query = (inputFilterLppTable ? inputFilterLppTable.value.trim().toLowerCase() : '');
  const divFilter = (selectFilterLppDivisi ? selectFilterLppDivisi.value.trim().toUpperCase() : '');

  let filtered = (cachedRegisterLpp.categories || []).filter(c => {
    if (divFilter && !c.divisi.toUpperCase().includes(divFilter)) return false;
    if (query) {
      const matchKode = c.kode.toLowerCase().includes(query);
      const matchKat = c.namaKategori.toLowerCase().includes(query);
      const matchDept = c.departemen.toLowerCase().includes(query);
      const matchDiv = c.divisi.toLowerCase().includes(query);
      return matchKode || matchKat || matchDept || matchDiv;
    }
    return true;
  });

  if (badgeLppRowCount) {
    badgeLppRowCount.textContent = `${filtered.length} Kategori`;
  }

  if (filtered.length === 0) {
    tbodyLppDetail.innerHTML = `
      <tr class="empty-row">
        <td colspan="22" style="text-align: center; padding: 24px; color: var(--text-dim);">
          Tidak ada kategori yang cocok dengan filter pencarian.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  filtered.forEach(c => {
    html += `
      <tr>
        <td style="padding: 6px 10px; color: var(--text-dim);">${escapeHtml(c.divisi)}</td>
        <td style="padding: 6px 10px; color: var(--text-dim);">${escapeHtml(c.departemen)}</td>
        <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${escapeHtml(c.kode)}</td>
        <td style="padding: 6px 10px; font-weight: 600; color: var(--text-main);">${escapeHtml(c.namaKategori)}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700;">${escapeHtml(c.saldoAwal?.rp || '0')}</td>
        <td style="padding: 6px 10px; text-align: right; color: var(--primary);">${escapeHtml(c.saldoAwal?.qty || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.pembelianMurni || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.pembelianBonus || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.transferIn || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.returPenjualan || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.repackIn || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.penerimaanLain || '0')}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 600; color: var(--warning);">${escapeHtml(c.penjualan || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.transferOut || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.repackOut || '0')}</td>
        <td style="padding: 6px 10px; text-align: right; color: var(--danger);">${escapeHtml(c.hilang || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.pengeluaranLain || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.so || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.penyesuaian || '0')}</td>
        <td style="padding: 6px 10px; text-align: right;">${escapeHtml(c.koreksi || '0')}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: var(--success);">${escapeHtml(c.saldoAkhir?.rp || '0')}</td>
        <td style="padding: 6px 10px; text-align: right; color: var(--primary);">${escapeHtml(c.saldoAkhir?.qty || '0')}</td>
      </tr>
    `;
  });

  // Render Grand Total row at the bottom
  if (cachedRegisterLpp.grandTotal) {
    const gt = cachedRegisterLpp.grandTotal;
    html += `
      <tr style="background: #0b1329; font-weight: 700; border-top: 2px solid var(--primary); box-shadow: 0 -4px 12px rgba(0,0,0,0.6); position: sticky; bottom: 0; z-index: 5;">
        <td colspan="4" style="padding: 8px 10px; color: var(--primary); background: #0b1329;">TOTAL SELURUHNYA (GRAND TOTAL)</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.saldoAwal?.rp || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; color: var(--primary); background: #0b1329;">${escapeHtml(gt.saldoAwal?.qty || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.pembelianMurni || gt.murni || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.pembelianBonus || gt.bonus || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.transferIn || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.returPenjualan || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.repackIn || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.penerimaanLain || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; color: var(--warning); background: #0b1329;">${escapeHtml(gt.penjualan || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.transferOut || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.repackOut || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; color: var(--danger); background: #0b1329;">${escapeHtml(gt.hilang || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.pengeluaranLain || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.so || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.penyesuaian || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; background: #0b1329;">${escapeHtml(gt.koreksi || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; color: var(--success); background: #0b1329;">${escapeHtml(gt.saldoAkhir?.rp || '0')}</td>
        <td style="padding: 8px 10px; text-align: right; color: var(--primary); background: #0b1329;">${escapeHtml(gt.saldoAkhir?.qty || '0')}</td>
      </tr>
    `;
  }

  tbodyLppDetail.innerHTML = html;
}

// Fetch Live Register LPP from Web IAS
async function triggerFetchRegisterLpp() {
  if (!btnFetchRegisterLpp) return;
  const origText = btnFetchRegisterLpp.innerHTML;
  btnFetchRegisterLpp.disabled = true;
  btnFetchRegisterLpp.innerHTML = `<span>⏳</span> Mengambil Register LPP...`;
  renderTaskBadge(badgeRegisterLppStatus, 'LOADING');

  const p1 = iasSharedPeriode1 ? iasSharedPeriode1.value.trim() : '01/09/2026';
  const p2 = iasSharedPeriode2 ? iasSharedPeriode2.value.trim() : '01/09/2026';

  addIasLog('info', `📊 Memulai pengambilan laporan Register LPP untuk Periode ${p1} s/d ${p2}...`);

  try {
    const res = await fetch('/api/ias/register-lpp/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu: 'LPP01',
        export_type: 'pdf',
        periode1: p1,
        periode2: p2,
        tipe: '3'
      })
    });

    const data = await res.json();
    if (data.success) {
      applyLppDataToUi(data);
      // Auto-sync kroscek table
      fetch('/api/ias/kroscek/sync-lpp01', { method: 'POST' })
        .then(r => r.json())
        .then(res => {
          if (res.success && res.data) {
            kroscekState = res.data;
            renderKroscekTables();
          }
        }).catch(() => {});
      showAlert('success', 'Register LPP Berhasil Diekstrak', `Berhasil mengekstrak ${data.totalCategories} kategori dan Grand Total sebagai data pembanding.`);
    } else {
      renderTaskBadge(badgeRegisterLppStatus, 'ERROR');
      showAlert('error', 'Gagal Mengambil Register LPP', data.error || 'Terjadi kesalahan');
    }
  } catch (err) {
    renderTaskBadge(badgeRegisterLppStatus, 'ERROR');
    showAlert('error', 'Error Jaringan', err.message);
  } finally {
    btnFetchRegisterLpp.disabled = false;
    btnFetchRegisterLpp.innerHTML = origText;
  }
}

// Load Latest Saved Register LPP
async function loadLatestRegisterLpp() {
  try {
    const res = await fetch('/api/ias/register-lpp/latest');
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.categories) {
      applyLppDataToUi(data);
    }
  } catch (e) {}
}

// Modal open/close & filter events
if (btnOpenLppModal) {
  btnOpenLppModal.addEventListener('click', () => {
    if (lppModalOverlay) lppModalOverlay.classList.add('active');
  });
}
if (btnCloseLppModal) {
  btnCloseLppModal.addEventListener('click', () => {
    if (lppModalOverlay) lppModalOverlay.classList.remove('active');
  });
}
if (btnCloseLppModalBtn) {
  btnCloseLppModalBtn.addEventListener('click', () => {
    if (lppModalOverlay) lppModalOverlay.classList.remove('active');
  });
}
if (lppModalOverlay) {
  lppModalOverlay.addEventListener('click', (e) => {
    if (e.target === lppModalOverlay) lppModalOverlay.classList.remove('active');
  });
}
if (btnFetchRegisterLpp) {
  btnFetchRegisterLpp.addEventListener('click', triggerFetchRegisterLpp);
}
if (btnCheckRegisterLppLatest) {
  btnCheckRegisterLppLatest.addEventListener('click', async () => {
    await loadLatestRegisterLpp();
    showAlert('info', 'Data Dimuat', 'Data Register LPP terakhir berhasil dimuat ulang.');
  });
}
if (inputFilterLppTable) {
  inputFilterLppTable.addEventListener('input', renderLppTable);
}
if (selectFilterLppDivisi) {
  selectFilterLppDivisi.addEventListener('change', renderLppTable);
}

// ============================================================================
// TASK 4: KROSCEK DATA LAPORAN LPP (Posisi & Mutasi Persediaan SOP)
// ============================================================================

const tbodyKroscekMain = document.getElementById('tbodyKroscekMain');
const tbodyAntarLpp = document.getElementById('tbodyAntarLpp');
const btnSyncKroscekLpp01 = document.getElementById('btnSyncKroscekLpp01');
const btnSaveKroscek = document.getElementById('btnSaveKroscek');
const bannerTidakBolehSelisih = document.getElementById('bannerTidakBolehSelisih');
const statusKroscekSummary = document.getElementById('statusKroscekSummary');

const KROSCEK_ROWS = [
  { key: 'saldoAkhirSebelumME', label: 'SALDO AKHIR BULAN SEBELUM ME', rumus: '', rule: 'LPP-01 Bulan Sebelumnya', isHeader: true },
  { key: 'saldoAwalBulanME', label: 'SALDO AWAL BULAN ME', rumus: '', rule: 'Saldo Awal Grand Total LPP 01', isHeader: true },
  { key: 'pembelianMurni', label: 'PEMBELIAN MURNI', rumus: 'LAP DFTR PEMBELIAN --> Gross - Potongan + Disc4', rule: 'IAS - BO - LAPORAN2-LAPORAN DFTR PEMBELIAN' },
  { key: 'pembelianBonus', label: 'PEMBELIAN BONUS', rumus: '', rule: 'Bonus Pembelian' },
  { key: 'transferIn', label: 'TRANSFER IN', rumus: 'REGISTER TAC + LAP TRANSFER HBV --> Total + Batal', rule: '(IAS - BO - CETAK REGISTER) + (IAS - BO - LAPORAN2)' },
  { key: 'returPenjualan', label: 'RETUR PENJUALAN', rumus: 'OMI>>LAP REGISTER BARANG RETUR --> Total', rule: 'Kalo selisih berarti ada yang belum BPBR', alert: true },
  { key: 'repack', label: 'REPACK', rumus: 'LAPORAN REPACKING --> HARUS SAMA DENGAN PREPACK', rule: 'IAS - BO - TRANSAKSI - REPACKING (Harus sama dg prepack)' },
  { key: 'penerimaanLain', label: 'LAIN2 (Penerimaan)', rumus: 'LPP RETUR + LPP RUSAK --> Pengeluaran Lain Baik', rule: 'IAS - BO - LPP' },
  { key: 'penjualan', label: 'PENJUALAN', rumus: 'LAPORAN PENJUALAN --> HPP RATA2', rule: 'IAS - FO - LAP. KASIR (PER DEPT) - Dibawah 5000 OK', tolerance: 5000 },
  { key: 'transferOut', label: 'TRANSFER OUT', rumus: 'REGISTER SURAT JALAN + LAP TRANSFER HBV--> Total + Batal', rule: '(IAS - BO - CETAK REGISTER) + (IAS - BO - LAPORAN2)' },
  { key: 'prepack', label: 'PREPACK', rumus: 'LAPORAN PREPACK --> HARUS SAMA DENGAN REPACKING', rule: 'IAS - BO - TRANSAKSI - REPACKING (Harus sama dg repack)' },
  { key: 'hilang', label: 'HILANG', rumus: 'REGISTER NBH --> Total - Batal', rule: 'IAS - BO - CETAK REGISTER' },
  { key: 'pengeluaranLain', label: 'LAIN2 (Pengeluaran)', rumus: 'LPP RETUR + LPP RUSAK (Penerimaan Baik) + BA RETUR IDM (DPP)', rule: '(IAS - BO - LPP) + (IAS - BO - LPP - REG BA IDM)' },
  { key: 'so', label: 'SO', rumus: 'LAP REKAP ADJUST SO --> Total', rule: 'IAS - BO - LPP' },
  { key: 'intransit', label: 'INTRANSIT', rumus: 'AKHIR BULAN HARUS = 0', rule: 'Akhir Bulan HARUS = 0', alert: true },
  { key: 'penyesuaian', label: 'PENYESUAIAN', rumus: 'REGISTER MPP --> Total - Batal', rule: 'IAS - BO - CETAK REGISTER' },
  { key: 'koreksi', label: 'KOREKSI', rumus: '', rule: 'Koreksi Nilai' },
  { key: 'saldoAkhirBulanME', label: 'SALDO AKHIR BULAN ME', rumus: '', rule: 'Saldo Akhir Grand Total LPP 01', isHeader: true }
];

const ANTAR_LPP_ITEMS = [
  { key1: 'lpp01_prev', key2: 'lpp01_me_awal', label: 'Saldo Akhir LPP-01 Bln Lalu vs Saldo Awal LPP-01 Bln ME' },
  { key1: 'lpp01_me_akhir', key2: 'lpp01_next_awal', label: 'Saldo Akhir LPP-01 Bln ME vs Saldo Awal LPP-01 Bln Baru' },
  { key1: 'lpp02_prev', key2: 'lpp02_me_awal', label: 'Saldo Akhir LPP-02 Bln Lalu vs Saldo Awal LPP-02 Bln ME' },
  { key1: 'lpp02_me_akhir', key2: 'lpp02_next_awal', label: 'Saldo Akhir LPP-02 Bln ME vs Saldo Awal LPP-02 Bln Baru' },
  { key1: 'lpp03_prev', key2: 'lpp03_me_awal', label: 'Saldo Akhir LPP-03 Bln Lalu vs Saldo Awal LPP-03 Bln ME' },
  { key1: 'lpp03_me_akhir', key2: 'lpp03_next_awal', label: 'Saldo Akhir LPP-03 Bln ME vs Saldo Awal LPP-03 Bln Baru' }
];

let kroscekState = null;

async function loadKroscekData() {
  try {
    const res = await fetch('/api/ias/kroscek');
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      kroscekState = json.data;
      renderKroscekTables();
    }
  } catch (err) {
    console.error('Error loading kroscek data:', err);
  }
}

function parseInputNumber(val) {
  if (!val) return 0;
  return parseInt(String(val).replace(/,/g, '').trim(), 10) || 0;
}

function renderKroscekTables() {
  if (!kroscekState || !tbodyKroscekMain || !tbodyAntarLpp) return;

  const lpp = kroscekState.lpp01 || {};
  const pem = kroscekState.pembanding || {};
  const antar = kroscekState.antarLpp || {};

  let totalSelisihCount = 0;
  let mainHtml = '';

  KROSCEK_ROWS.forEach(row => {
    const vLpp = parseInt(lpp[row.key] || 0, 10);
    const vPem = parseInt(pem[row.key] || 0, 10);
    const selisih = vLpp - vPem;

    let isOk = (selisih === 0);
    if (row.tolerance && Math.abs(selisih) <= row.tolerance) {
      isOk = true;
    }

    if (!isOk) totalSelisihCount++;

    const badgeSelisihClass = isOk
      ? 'background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.4);'
      : 'background: rgba(239, 68, 68, 0.25); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); font-weight: 800;';

    const rowBg = row.isHeader
      ? 'background: rgba(255,255,255,0.03); font-weight: 700;'
      : '';

    mainHtml += `
      <tr style="${rowBg}">
        <td style="padding: 6px 12px; font-weight: 600; color: ${row.alert ? '#ef4444' : 'var(--text-main)'};">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding: 6px 12px; text-align: right; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.08);">
          ${formatRp(vLpp)}
        </td>
        <td style="padding: 6px 12px; color: var(--text-muted); font-size: 11px;">
          ${row.rumus ? `<span style="padding: 2px 6px; background: rgba(6, 182, 212, 0.1); border-radius: 4px; color: #06b6d4;">${escapeHtml(row.rumus)}</span>` : '-'}
        </td>
        <td style="padding: 4px 8px; text-align: right;">
          <input type="text" class="custom-input kroscek-pem-input" data-key="${row.key}" value="${formatRp(vPem)}"
            style="width: 100%; height: 28px; text-align: right; font-size: 11.5px; font-weight: 600; padding: 2px 6px; background: rgba(0,0,0,0.3); border-color: rgba(6, 182, 212, 0.3);">
        </td>
        <td style="padding: 6px 12px; text-align: right;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; ${badgeSelisihClass}">
            ${selisih > 0 ? '+' : ''}${formatRp(selisih)}
          </span>
        </td>
        <td style="padding: 6px 12px; font-size: 11px; color: #f59e0b;">
          ${escapeHtml(row.rule)}
        </td>
      </tr>
    `;
  });

  tbodyKroscekMain.innerHTML = mainHtml;

  // Render Antar LPP Table
  let antarHtml = '';
  ANTAR_LPP_ITEMS.forEach(item => {
    const v1 = parseInt(antar[item.key1] || 0, 10);
    const v2 = parseInt(antar[item.key2] || 0, 10);
    const diff = v1 - v2;
    const ok = (diff === 0);
    if (!ok) totalSelisihCount++;

    const diffBadge = ok
      ? '<span style="color: #22c55e; font-weight: 700;">0 (OK)</span>'
      : `<span style="color: #ef4444; font-weight: 800;">${diff > 0 ? '+' : ''}${formatRp(diff)} ⚠️</span>`;

    antarHtml += `
      <tr>
        <td style="padding: 5px 8px; font-size: 11px; color: var(--text-main);">${escapeHtml(item.label)}</td>
        <td style="padding: 3px 6px; text-align: right;">
          <input type="text" class="custom-input antar-lpp-input" data-key="${item.key1}" value="${formatRp(v1)}"
            style="width: 100%; height: 26px; text-align: right; font-size: 11px; padding: 2px 4px; background: rgba(0,0,0,0.25);">
        </td>
        <td style="padding: 3px 6px; text-align: right;">
          <input type="text" class="custom-input antar-lpp-input" data-key="${item.key2}" value="${formatRp(v2)}"
            style="width: 100%; height: 26px; text-align: right; font-size: 11px; padding: 2px 4px; background: rgba(0,0,0,0.25);">
        </td>
        <td style="padding: 5px 8px; text-align: right; font-size: 11px;">
          ${diffBadge}
        </td>
      </tr>
    `;
  });

  tbodyAntarLpp.innerHTML = antarHtml;

  // Attach event listeners for real-time calculation
  document.querySelectorAll('.kroscek-pem-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const key = e.target.getAttribute('data-key');
      const num = parseInputNumber(e.target.value);
      kroscekState.pembanding[key] = num;
      e.target.value = formatRp(num);
      renderKroscekTables();
    });
  });

  document.querySelectorAll('.antar-lpp-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const key = e.target.getAttribute('data-key');
      const num = parseInputNumber(e.target.value);
      kroscekState.antarLpp[key] = num;
      e.target.value = formatRp(num);
      renderKroscekTables();
    });
  });

  // Update Summary Banner status
  if (statusKroscekSummary && bannerTidakBolehSelisih) {
    if (totalSelisihCount === 0) {
      statusKroscekSummary.innerHTML = '<span>●</span> SEMUA SESUAI (0 SELISIH)';
      statusKroscekSummary.style.background = 'rgba(34, 197, 94, 0.2)';
      statusKroscekSummary.style.color = '#22c55e';
      statusKroscekSummary.style.border = '1px solid rgba(34, 197, 94, 0.4)';
      bannerTidakBolehSelisih.style.border = '2px dashed #f97316';
      bannerTidakBolehSelisih.style.background = 'linear-gradient(135deg, rgba(234, 88, 12, 0.15), rgba(249, 115, 22, 0.05))';
    } else {
      statusKroscekSummary.innerHTML = `<span>⚠️</span> PERHATIAN: ${totalSelisihCount} ITEM BERSELISIH!`;
      statusKroscekSummary.style.background = 'rgba(239, 68, 68, 0.3)';
      statusKroscekSummary.style.color = '#ef4444';
      statusKroscekSummary.style.border = '1px solid rgba(239, 68, 68, 0.6)';
      bannerTidakBolehSelisih.style.border = '2px solid #ef4444';
      bannerTidakBolehSelisih.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.1))';
    }
  }
}

// Button Sync Grand Total LPP 01
if (btnSyncKroscekLpp01) {
  btnSyncKroscekLpp01.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/ias/kroscek/sync-lpp01', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data) {
        kroscekState = json.data;
        renderKroscekTables();
        showAlert('success', 'Sinkronisasi Berhasil', 'Nilai Grand Total Register LPP 01 berhasil dimasukkan ke kolom hijau.');
      } else {
        showAlert('error', 'Gagal Sinkronisasi', json.error || 'Terjadi kesalahan');
      }
    } catch (err) {
      showAlert('error', 'Error Jaringan', err.message);
    }
  });
}

// Button Save Kroscek Data
if (btnSaveKroscek) {
  btnSaveKroscek.addEventListener('click', async () => {
    if (!kroscekState) return;
    try {
      const res = await fetch('/api/ias/kroscek/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kroscekState)
      });
      const json = await res.json();
      if (json.success) {
        showAlert('success', 'Kroscek Disimpan', 'Nilai lembar kroscek berhasil disimpan ke sistem.');
      } else {
        showAlert('error', 'Gagal Menyimpan', json.error || 'Terjadi kesalahan');
      }
    } catch (err) {
      showAlert('error', 'Error Jaringan', err.message);
    }
  });
}

// Initial Load
initTheme();
initAdminNav();
populateDefaultDates();
loadConfig();
loadIasConfig();
loadLatestRegisterLpp();
loadKroscekData();

// Poll Live Logs (Terpisah: CMS StokPoin vs Web IAS)
setInterval(fetchLogs, 1500);
fetchLogs();

setInterval(fetchIasLogs, 1500);
fetchIasLogs();



// State
let servicesList = [];
let activeConsoleServiceId = '';
const serviceLogsCache = {};
let sseSource = null;

// DOM Elements
const cardTotalServices = document.getElementById('cardTotalServices');
const cardRunningServices = document.getElementById('cardRunningServices');
const cardRunningDetail = document.getElementById('cardRunningDetail');
const cardStoppedServices = document.getElementById('cardStoppedServices');
const badgeServiceTotalCount = document.getElementById('badgeServiceTotalCount');
const servicesContainer = document.getElementById('servicesContainer');
const inputSearchService = document.getElementById('inputSearchService');

const btnOpenAddServiceModal = document.getElementById('btnOpenAddServiceModal');
const btnStartAllServices = document.getElementById('btnStartAllServices');
const btnStopAllServices = document.getElementById('btnStopAllServices');
const btnRefreshServicesList = document.getElementById('btnRefreshServicesList');

const selectConsoleService = document.getElementById('selectConsoleService');
const terminalServiceTitle = document.getElementById('terminalServiceTitle');
const chkAutoScrollServiceConsole = document.getElementById('chkAutoScrollServiceConsole');
const btnCopyServiceLogs = document.getElementById('btnCopyServiceLogs');
const btnClearServiceConsole = document.getElementById('btnClearServiceConsole');
const logServiceConsole = document.getElementById('logServiceConsole');

// Modal Elements
const serviceModalOverlay = document.getElementById('serviceModalOverlay');
const serviceModalTitle = document.getElementById('serviceModalTitle');
const btnCloseServiceModal = document.getElementById('btnCloseServiceModal');
const btnCancelServiceModal = document.getElementById('btnCancelServiceModal');
const btnSaveServiceModal = document.getElementById('btnSaveServiceModal');
const inputServiceId = document.getElementById('inputServiceId');
const inputServiceName = document.getElementById('inputServiceName');
const inputServiceCommand = document.getElementById('inputServiceCommand');
const inputServiceDesc = document.getElementById('inputServiceDesc');
const inputServiceCwd = document.getElementById('inputServiceCwd');
const inputServicePort = document.getElementById('inputServicePort');
const chkServiceAutoStart = document.getElementById('chkServiceAutoStart');
const chkServiceAutoRestart = document.getElementById('chkServiceAutoRestart');

// Clock
function updateClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
}
setInterval(updateClock, 1000);
updateClock();

// Toast Notifications
function showAlert(type, title, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast-alert ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// 1. Fetch & Render Services
async function fetchServicesList() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    if (data.success && Array.isArray(data.services)) {
      servicesList = data.services;
      updateServiceMetrics();
      renderServicesList();
      populateConsoleDropdown();
    }
  } catch (err) {
    console.error('Gagal mengambil daftar services:', err);
  }
}

function updateServiceMetrics() {
  const total = servicesList.length;
  const running = servicesList.filter(s => s.status === 'RUNNING').length;
  const stopped = total - running;

  if (cardTotalServices) cardTotalServices.textContent = `${total} Service`;
  if (cardRunningServices) cardRunningServices.textContent = `${running} Berjalan`;
  if (cardRunningDetail) cardRunningDetail.textContent = `${running} proses aktif`;
  if (cardStoppedServices) cardStoppedServices.textContent = `${stopped} Berhenti`;
  if (badgeServiceTotalCount) badgeServiceTotalCount.textContent = `${total} Terdaftar`;
}

function renderServicesList() {
  if (!servicesContainer) return;

  const query = (inputSearchService ? inputSearchService.value : '').toLowerCase().trim();
  const filtered = servicesList.filter(s => {
    if (!query) return true;
    return (s.name || '').toLowerCase().includes(query) ||
           (s.command || '').toLowerCase().includes(query) ||
           (s.description || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    servicesContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚙️</span>
        <h4>${query ? 'Tidak ada service yang cocok dengan pencarian' : 'Belum Ada Service Terdaftar'}</h4>
        <p>${query ? 'Coba gunakan kata kunci lain.' : 'Klik tombol "Tambah Service" di atas untuk mendaftarkan script atau program Anda.'}</p>
      </div>
    `;
    return;
  }

  servicesContainer.innerHTML = filtered.map(s => {
    const isRunning = s.status === 'RUNNING';
    const isCrashed = s.status === 'CRASHED';

    let statusBadgeClass = 'badge-secondary';
    let statusText = '🔴 STOPPED';
    let cardClass = 'stopped';

    if (isRunning) {
      statusBadgeClass = 'badge-success';
      statusText = `🟢 RUNNING (PID: ${s.pid || '-'})`;
      cardClass = 'running';
    } else if (isCrashed) {
      statusBadgeClass = 'badge-danger';
      statusText = '⚠️ CRASHED';
      cardClass = 'crashed';
    }

    return `
      <div class="service-card ${cardClass}" id="serviceCard_${s.id}">
        <div class="service-card-header">
          <div>
            <h4 class="service-card-title">${escapeHtml(s.name)}</h4>
          </div>
          <span class="badge ${statusBadgeClass}">
            ${statusText}
          </span>
        </div>

        <div class="service-card-desc">
          ${escapeHtml(s.description || 'Tidak ada deskripsi')}
        </div>

        <div class="service-card-cmd" title="Perintah: ${escapeHtml(s.command)}">
          <code>$ ${escapeHtml(s.command)}</code>
        </div>

        <div class="service-card-meta">
          ${isRunning ? `
            <span class="service-meta-tag" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">
              ⏱️ Uptime: <strong>${s.uptimeFormatted || '0d'}</strong>
            </span>
          ` : ''}
          ${s.port ? `
            <span class="service-meta-tag ${s.portStatus === 'OPEN' ? 'port-tag-online' : 'port-tag-offline'}" title="Port ${s.port} Status: ${s.portStatus === 'OPEN' ? 'Port sedang mendengarkan (Online)' : 'Port belum aktif / tertutup (Offline)'}">
              <span class="dot-port ${s.portStatus === 'OPEN' ? 'online' : 'offline'}"></span>
              Port: <strong>${s.port}</strong> ${s.portStatus === 'OPEN' ? '🟢 Online' : '⚪ Offline'}
            </span>
          ` : ''}
          ${s.autoStart ? `
            <span class="service-meta-tag" title="Auto-start aktif">⚡ Auto-Start</span>
          ` : ''}
          ${s.autoRestart ? `
            <span class="service-meta-tag" title="Auto-restart jika crash">🔄 Auto-Restart</span>
          ` : ''}
          ${s.cwd ? `
            <span class="service-meta-tag" title="Folder: ${escapeHtml(s.cwd)}">📁 ${escapeHtml(s.cwd)}</span>
          ` : ''}
        </div>

        <div class="service-card-actions">
          <div class="service-actions-primary">
            ${isRunning ? `
              <button class="btn btn-xs btn-danger" onclick="triggerStopService('${s.id}')" title="Hentikan Program">
                ⏹️ Stop
              </button>
              <button class="btn btn-xs btn-warning" onclick="triggerRestartService('${s.id}')" title="Jalankan Ulang Program">
                🔄 Restart
              </button>
            ` : `
              <button class="btn btn-xs btn-success" onclick="triggerStartService('${s.id}')" title="Jalankan Program">
                ▶️ Start
              </button>
            `}
            ${s.port ? `
              <a href="http://localhost:${s.port}" target="_blank" class="btn btn-xs ${s.portStatus === 'OPEN' ? 'btn-web-active' : 'btn-outline'}" title="Buka http://localhost:${s.port} di browser">
                🌐 Web :${s.port}
              </a>
            ` : ''}
            <button class="btn btn-xs btn-outline" onclick="selectServiceForConsole('${s.id}', true)" title="Buka Live Terminal Log">
              📜 Log
            </button>
          </div>

          <div class="service-actions-secondary">
            <button class="btn btn-xs btn-ghost" onclick="editServiceModal('${s.id}')" title="Edit Service">
              ✏️
            </button>
            <button class="btn btn-xs btn-ghost text-danger" onclick="triggerDeleteService('${s.id}', '${escapeHtml(s.name)}')" title="Hapus Service">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

if (inputSearchService) {
  inputSearchService.addEventListener('input', renderServicesList);
}

function populateConsoleDropdown() {
  if (!selectConsoleService) return;
  const currentVal = selectConsoleService.value;
  selectConsoleService.innerHTML = '<option value="">-- Pilih Service --</option>' +
    servicesList.map(s => {
      const statusIcon = s.status === 'RUNNING' ? '🟢' : s.status === 'CRASHED' ? '⚠️' : '🔴';
      return `<option value="${s.id}">${statusIcon} ${escapeHtml(s.name)}</option>`;
    }).join('');

  if (currentVal && servicesList.some(s => s.id === currentVal)) {
    selectConsoleService.value = currentVal;
  } else if (!activeConsoleServiceId && servicesList.length > 0) {
    selectServiceForConsole(servicesList[0].id, false);
  }
}

// 2. Actions: Start, Stop, Restart, Delete
async function triggerStartService(id) {
  try {
    const res = await fetch(`/api/services/${id}/start`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAlert('success', 'Service Dimulai', 'Program berhasil dijalankan di background.');
      fetchServicesList();
      selectServiceForConsole(id, false);
    } else {
      showAlert('error', 'Gagal Memulai', json.error || 'Terjadi kesalahan saat memulai service.');
    }
  } catch (err) {
    showAlert('error', 'Error Jaringan', err.message);
  }
}

async function triggerStopService(id) {
  try {
    const res = await fetch(`/api/services/${id}/stop`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAlert('info', 'Service Dihentikan', 'Program telah dihentikan.');
      fetchServicesList();
    } else {
      showAlert('error', 'Gagal Menghentikan', json.error || 'Terjadi kesalahan');
    }
  } catch (err) {
    showAlert('error', 'Error Jaringan', err.message);
  }
}

async function triggerRestartService(id) {
  try {
    showAlert('info', 'Merestart...', 'Sedang menghentikan dan memulai ulang service...');
    const res = await fetch(`/api/services/${id}/restart`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAlert('success', 'Restart Berhasil', 'Program berhasil dimulai kembali.');
      fetchServicesList();
    } else {
      showAlert('error', 'Gagal Restart', json.error || 'Terjadi kesalahan');
    }
  } catch (err) {
    showAlert('error', 'Error Jaringan', err.message);
  }
}

async function triggerDeleteService(id, name) {
  if (!confirm(`Apakah Anda yakin ingin menghapus service "${name}"?`)) return;
  try {
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showAlert('success', 'Service Dihapus', 'Service berhasil dihapus dari daftar.');
      if (activeConsoleServiceId === id) {
        activeConsoleServiceId = '';
        if (logServiceConsole) logServiceConsole.innerHTML = '<div class="log-line info"><span class="log-time">[--:--:--]</span> <span class="log-msg">Service telah dihapus.</span></div>';
      }
      fetchServicesList();
    }
  } catch (err) {
    showAlert('error', 'Error Jaringan', err.message);
  }
}

if (btnStartAllServices) {
  btnStartAllServices.addEventListener('click', async () => {
    if (!confirm('Jalankan semua service terdaftar sekaligus?')) return;
    try {
      await fetch('/api/services/start-all', { method: 'POST' });
      showAlert('success', 'Menjalankan Semua Service', 'Perintah start telah dikirimkan ke semua service.');
      fetchServicesList();
    } catch (err) {
      showAlert('error', 'Error', err.message);
    }
  });
}

if (btnStopAllServices) {
  btnStopAllServices.addEventListener('click', async () => {
    if (!confirm('Hentikan semua service yang sedang berjalan?')) return;
    try {
      await fetch('/api/services/stop-all', { method: 'POST' });
      showAlert('info', 'Menghentikan Semua Service', 'Semua service telah dihentikan.');
      fetchServicesList();
    } catch (err) {
      showAlert('error', 'Error', err.message);
    }
  });
}

if (btnRefreshServicesList) {
  btnRefreshServicesList.addEventListener('click', () => {
    fetchServicesList();
    showAlert('info', 'Diperbarui', 'Daftar service dan status telah dimuat ulang.');
  });
}

// 3. Modal Form: Add / Edit
function openServiceModal(srv = null) {
  if (!serviceModalOverlay) return;
  if (srv) {
    if (serviceModalTitle) serviceModalTitle.textContent = 'Edit Service / Program';
    inputServiceId.value = srv.id;
    inputServiceName.value = srv.name;
    inputServiceCommand.value = srv.command;
    inputServiceDesc.value = srv.description || '';
    inputServiceCwd.value = srv.cwd || '';
    if (inputServicePort) inputServicePort.value = srv.port || '';
    chkServiceAutoStart.checked = Boolean(srv.autoStart);
    chkServiceAutoRestart.checked = srv.autoRestart !== undefined ? Boolean(srv.autoRestart) : true;
  } else {
    if (serviceModalTitle) serviceModalTitle.textContent = 'Daftarkan Program / Service Baru';
    inputServiceId.value = '';
    inputServiceName.value = '';
    inputServiceCommand.value = '';
    inputServiceDesc.value = '';
    inputServiceCwd.value = '';
    if (inputServicePort) inputServicePort.value = '';
    chkServiceAutoStart.checked = false;
    chkServiceAutoRestart.checked = true;
  }
  serviceModalOverlay.classList.add('active');
}

function closeServiceModal() {
  if (serviceModalOverlay) serviceModalOverlay.classList.remove('active');
}

function editServiceModal(id) {
  const srv = servicesList.find(s => s.id === id);
  if (srv) openServiceModal(srv);
}

if (btnOpenAddServiceModal) {
  btnOpenAddServiceModal.addEventListener('click', () => openServiceModal(null));
}
if (btnCloseServiceModal) {
  btnCloseServiceModal.addEventListener('click', closeServiceModal);
}
if (btnCancelServiceModal) {
  btnCancelServiceModal.addEventListener('click', closeServiceModal);
}

if (btnSaveServiceModal) {
  btnSaveServiceModal.addEventListener('click', async () => {
    const id = inputServiceId.value.trim();
    const name = inputServiceName.value.trim();
    const command = inputServiceCommand.value.trim();
    const description = inputServiceDesc.value.trim();
    const cwd = inputServiceCwd.value.trim();
    const portVal = inputServicePort ? inputServicePort.value.trim() : '';
    const port = portVal ? parseInt(portVal, 10) : null;
    const autoStart = chkServiceAutoStart.checked;
    const autoRestart = chkServiceAutoRestart.checked;

    if (!name || !command) {
      showAlert('warning', 'Data Kurang Lengkap', 'Nama service dan perintah (command) wajib diisi.');
      return;
    }

    const payload = { name, command, description, cwd, port, autoStart, autoRestart };

    try {
      let res;
      if (id) {
        res = await fetch(`/api/services/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const json = await res.json();
      if (json.success) {
        showAlert('success', 'Berhasil Disimpan', `Service "${name}" telah berhasil disimpan.`);
        closeServiceModal();
        fetchServicesList();
      } else {
        showAlert('error', 'Gagal Menyimpan', json.error || 'Terjadi kesalahan');
      }
    } catch (err) {
      showAlert('error', 'Error Jaringan', err.message);
    }
  });
}

// 4. Live Console & Terminal per Service
async function selectServiceForConsole(serviceId, autoFocus = false) {
  activeConsoleServiceId = serviceId;
  if (selectConsoleService) selectConsoleService.value = serviceId;

  const srv = servicesList.find(s => s.id === serviceId);
  if (terminalServiceTitle) {
    terminalServiceTitle.textContent = srv ? `Live Terminal: ${srv.name}` : 'Live Terminal';
  }

  if (autoFocus && logServiceConsole) {
    logServiceConsole.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  try {
    const res = await fetch(`/api/services/${serviceId}/logs`);
    const json = await res.json();
    if (json.success && Array.isArray(json.logs)) {
      serviceLogsCache[serviceId] = json.logs;
      renderServiceConsole(json.logs);
    }
  } catch (err) {
    console.error('Gagal memuat log service:', err);
  }
}

function renderServiceConsole(logs) {
  if (!logServiceConsole) return;
  if (!logs || logs.length === 0) {
    logServiceConsole.innerHTML = `
      <div class="log-line info">
        <span class="log-time">[--:--:--]</span>
        <span class="log-msg">Belum ada output log tercatat untuk service ini. Klik "Start" untuk menjalankan.</span>
      </div>
    `;
    return;
  }

  logServiceConsole.innerHTML = logs.map(l => {
    let typeClass = 'info';
    if (l.type === 'stderr' || l.type === 'error') typeClass = 'error';
    else if (l.type === 'stdout') typeClass = 'success';
    else if (l.type === 'system') typeClass = 'info';

    return `
      <div class="log-line ${typeClass}">
        <span class="log-time">[${l.time}]</span>
        <span class="log-msg">${escapeHtml(l.text)}</span>
      </div>
    `;
  }).join('');

  if (chkAutoScrollServiceConsole && chkAutoScrollServiceConsole.checked) {
    logServiceConsole.scrollTop = logServiceConsole.scrollHeight;
  }
}

function handleIncomingServiceLog(serviceId, logEntry) {
  if (!serviceLogsCache[serviceId]) serviceLogsCache[serviceId] = [];
  serviceLogsCache[serviceId].push(logEntry);
  if (serviceLogsCache[serviceId].length > 300) serviceLogsCache[serviceId].shift();

  if (activeConsoleServiceId === serviceId && logServiceConsole) {
    let typeClass = 'info';
    if (logEntry.type === 'stderr' || logEntry.type === 'error') typeClass = 'error';
    else if (logEntry.type === 'stdout') typeClass = 'success';
    else if (logEntry.type === 'system') typeClass = 'info';

    const div = document.createElement('div');
    div.className = `log-line ${typeClass} log-line-new`;
    div.innerHTML = `<span class="log-time">[${logEntry.time}]</span> <span class="log-msg">${escapeHtml(logEntry.text)}</span>`;
    logServiceConsole.appendChild(div);

    if (chkAutoScrollServiceConsole && chkAutoScrollServiceConsole.checked) {
      logServiceConsole.scrollTop = logServiceConsole.scrollHeight;
    }
  }
}

function handleServiceStatusChange(serviceId, status, pid) {
  const srv = servicesList.find(s => s.id === serviceId);
  if (srv) {
    srv.status = status;
    srv.pid = pid || null;
    updateServiceMetrics();
    renderServicesList();
    populateConsoleDropdown();
  } else {
    fetchServicesList();
  }
}

if (selectConsoleService) {
  selectConsoleService.addEventListener('change', (e) => {
    if (e.target.value) {
      selectServiceForConsole(e.target.value, false);
    }
  });
}

if (btnCopyServiceLogs) {
  btnCopyServiceLogs.addEventListener('click', () => {
    if (!activeConsoleServiceId || !serviceLogsCache[activeConsoleServiceId]) {
      showAlert('warning', 'Tidak Ada Log', 'Belum ada log yang dapat disalin.');
      return;
    }
    const text = serviceLogsCache[activeConsoleServiceId].map(l => `[${l.time}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showAlert('success', 'Disalin', 'Log service berhasil disalin ke clipboard.');
    }).catch(() => {
      showAlert('error', 'Gagal', 'Gagal menyalin ke clipboard.');
    });
  });
}

if (btnClearServiceConsole) {
  btnClearServiceConsole.addEventListener('click', async () => {
    if (!activeConsoleServiceId) return;
    try {
      await fetch(`/api/services/${activeConsoleServiceId}/logs/clear`, { method: 'POST' });
      serviceLogsCache[activeConsoleServiceId] = [];
      renderServiceConsole([]);
      showAlert('info', 'Dibersihkan', 'Log service telah dibersihkan.');
    } catch (err) {
      showAlert('error', 'Error', err.message);
    }
  });
}

// 5. Realtime SSE Stream
function initStream() {
  if (sseSource) {
    try { sseSource.close(); } catch (_) {}
  }

  try {
    sseSource = new EventSource('/api/stream');

    sseSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.services)) {
          servicesList = data.services;
          updateServiceMetrics();
          renderServicesList();
          populateConsoleDropdown();
        }
      } catch (err) {
        console.error('Error SSE init:', err);
      }
    });

    sseSource.addEventListener('service-log', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleIncomingServiceLog(data.serviceId, data.log);
      } catch (err) {
        console.error('Error SSE log:', err);
      }
    });

    sseSource.addEventListener('service-status', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleServiceStatusChange(data.serviceId, data.status, data.pid);
      } catch (err) {
        console.error('Error SSE status:', err);
      }
    });

    sseSource.onerror = () => {
      try { sseSource.close(); } catch (_) {}
      setTimeout(initStream, 3000);
    };
  } catch (err) {
    console.error('SSE Error:', err);
  }
}

// Initial Load & Continuous Refresh for Port/Uptime
fetchServicesList();
initStream();
setInterval(fetchServicesList, 5000);

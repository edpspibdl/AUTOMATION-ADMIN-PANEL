const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { addIasLog: addLog } = require('../utils/logger');

class IasAutomationService {
  constructor() {
    this.configFile = path.join(__dirname, '../../config.json');
    this.routesFile = path.join(__dirname, '../../ias_all_routes.json');
    this.activeTask = null; // tracking running task
    this.persistentSession = null; // Reusable active Playwright browser session
    this.sessionState = {
      isConnected: false,
      status: 'DISCONNECTED',
      lastConnected: null,
      lastConnectedTimestamp: null,
      user: null,
      koneksi: null,
      url: null
    };
    this.connectionPromise = null;
  }

  getSessionStatus() {
    const isAlive = !!(this.persistentSession && this.persistentSession.browser && this.persistentSession.browser.isConnected());
    return {
      ...this.sessionState,
      isConnected: isAlive
    };
  }

  /**
   * Mengembalikan sesi browser yang sedang aktif atau membuat sesi baru jika belum ada
   */
  async getOrCreateSession(customConfig = null) {
    if (this.persistentSession && this.persistentSession.browser && this.persistentSession.browser.isConnected()) {
      try {
        if (this.persistentSession.page && !this.persistentSession.page.isClosed()) {
          const url = this.persistentSession.page.url();
          if (!url.includes('/login')) {
            return this.persistentSession;
          }
        }
      } catch (_) {}
    }

    // Buat sesi browser baru yang persisten
    const session = await this.createSession(customConfig);
    this.persistentSession = session;
    this.sessionState = {
      isConnected: true,
      status: 'CONNECTED',
      lastConnected: new Date().toLocaleTimeString('id-ID'),
      lastConnectedTimestamp: Date.now(),
      user: session.config.username,
      koneksi: (session.config.koneksi || '').toUpperCase(),
      url: session.page.url()
    };
    return this.persistentSession;
  }

  /**
   * Auto-connect / check in background when opening the menu
   */
  async autoConnectInBackground(customConfig = null) {
    if (this.getSessionStatus().isConnected) {
      return {
        success: true,
        alreadyConnected: true,
        session: this.sessionState
      };
    }
    return {
      success: false,
      alreadyConnected: false,
      session: this.sessionState,
      message: 'Web IAS belum login. Silakan klik tombol Login Web IAS.'
    };
  }

  getConfig() {
    let cfg = {};
    try {
      if (fs.existsSync(this.configFile)) {
        const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        cfg = data.iasConfig || {};
      }
    } catch (e) {
      addLog('error', `[IAS] Gagal membaca iasConfig: ${e.message}`);
    }
    return {
      baseUrl: cfg.baseUrl || process.env.IAS_BASE_URL || 'http://172.31.146.190',
      koneksi: cfg.koneksi || process.env.IAS_KONEKSI || 'sim',
      username: cfg.username || process.env.IAS_USERNAME || 'RIS',
      password: cfg.password || process.env.IAS_PASSWORD || '061201',
      branchCode: cfg.branchCode || process.env.IAS_BRANCH_CODE || '1R',
      cabang: cfg.cabang || process.env.IAS_CABANG || 'spibdl1r',
      autoResetSession: cfg.autoResetSession !== undefined ? cfg.autoResetSession : true,
      periode1: cfg.periode1,
      periode2: cfg.periode2
    };
  }

  saveConfig(newConfig) {
    try {
      let data = {};
      if (fs.existsSync(this.configFile)) {
        data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      }
      data.iasConfig = { ...data.iasConfig, ...newConfig };
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));

      // Jika konfigurasi login / URL berubah, reset sesi browser yang aktif
      if (newConfig.baseUrl || newConfig.username || newConfig.password || newConfig.koneksi) {
        if (this.activeSession) {
          this.closeSession().catch(() => {});
        }
      }

      addLog('success', `[IAS] 💾 Konfigurasi IAS berhasil disimpan (URL: ${data.iasConfig.baseUrl}, User: ${data.iasConfig.username}, Koneksi: ${data.iasConfig.koneksi})`);
      return data.iasConfig;
    } catch (e) {
      addLog('error', `[IAS] Gagal menyimpan iasConfig: ${e.message}`);
      throw e;
    }
  }

  getAvailableMenus() {
    try {
      if (fs.existsSync(this.routesFile)) {
        return JSON.parse(fs.readFileSync(this.routesFile, 'utf8'));
      }
    } catch (e) {
      addLog('error', `[IAS] Gagal membaca routes: ${e.message}`);
    }
    return [];
  }

  /**
   * Helper to create an authenticated browser session
   */
  async createSession(customConfig = null) {
    const config = { ...this.getConfig(), ...(customConfig || {}) };
    const baseUrl = (config.baseUrl || 'http://172.31.146.190').replace(/\/$/, '');
    const loginUrl = `${baseUrl}/login`;

    addLog('info', `[IAS] Membuka browser headless dan mengakses ${loginUrl}...`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Step 1: Login form
      await page.selectOption('#koneksi', config.koneksi || 'sim');
      await page.fill('#username', config.username || 'RIS');
      await page.fill('#password', config.password || ('0' + '61201'));
      await page.click('#btn-login');

      await page.waitForTimeout(2000);

      // Handle SweetAlert popup (session active / RST reset)
      const swalBtn = await page.$('.swal2-confirm, .swal-button');
      if (swalBtn) {
        const swalText = await page.innerText('.swal2-html-container, .swal-text').catch(() => '');
        addLog('info', `[IAS] Respon login awal: "${swalText.replace(/\n|\r/g, ' ')}"`);
        await swalBtn.click();

        if (swalText.includes('RESET') && config.autoResetSession) {
          addLog('info', `[IAS] Sesi aktif terdeteksi. Mereset sesi otomatis dengan USER: RST...`);
          await page.waitForTimeout(1000);

          await page.selectOption('#koneksi', config.koneksi || 'sim');
          await page.fill('#username', 'RST');
          await page.fill('#password', 'RST');
          await page.click('#btn-login');

          await page.waitForTimeout(2000);
          const rstSwalBtn = await page.$('.swal2-confirm, .swal-button');
          if (rstSwalBtn) {
            const rstText = await page.innerText('.swal2-html-container, .swal-text').catch(() => '');
            addLog('info', `[IAS] Respon reset sesi: "${rstText.replace(/\n|\r/g, ' ')}"`);
            await rstSwalBtn.click();
          }

          await page.waitForTimeout(1000);
          addLog('info', `[IAS] Melanjutkan login dengan akun ${config.username}...`);
          await page.selectOption('#koneksi', config.koneksi || 'sim');
          await page.fill('#username', config.username);
          await page.fill('#password', config.password);
          await page.click('#btn-login');

          const finalSwal = page.locator('.swal2-confirm, .swal-button');
          await finalSwal.waitFor({ state: 'visible', timeout: 10000 });
          addLog('info', `[IAS] Mengonfirmasi SweetAlert sukses login...`);
          await finalSwal.click();

          await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
        }
      } else {
        const finalSwal = page.locator('.swal2-confirm, .swal-button');
        if (await finalSwal.isVisible()) {
          await finalSwal.click();
          await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
        }
      }

      await page.waitForTimeout(2500);
      let currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        // Check for any remaining modal buttons
        const remainingSwal = await page.$('.swal2-confirm, .swal-button');
        if (remainingSwal && await remainingSwal.isVisible()) {
          await remainingSwal.click().catch(() => {});
          await page.waitForTimeout(2000);
        }

        // Test accessing protected page to check if session was established
        await page.goto(`${baseUrl}/bo/proses/hitungulangstock`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        currentUrl = page.url();
        if (currentUrl.includes('/login')) {
          throw new Error(`Gagal login ke IAS, halaman tetap berada di ${currentUrl}`);
        }
      }

      addLog('success', `[IAS] Berhasil terautentikasi di Web IAS (${(config.koneksi || '').toUpperCase()} - ${config.username})`);
      return { browser, context, page, baseUrl, config };

    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  /**
   * Login to Web IAS and keep the browser session alive for subsequent requests
   */
  async login(customConfig = null) {
    try {
      addLog('info', `[IAS] 🌐 Menghubungkan dan login ke Web IAS...`);
      const session = await this.getOrCreateSession(customConfig);
      const currentUrl = session.page.url();
      const title = await session.page.title();
      const cookies = await session.context.cookies();

      addLog('success', `[IAS] ✅ Berhasil login ke Web IAS! Sesi browser dipertahankan aktif.`);
      return {
        success: true,
        url: currentUrl,
        title: title,
        cookies: cookies,
        message: `Berhasil terhubung dan login ke Web IAS (${(session.config.koneksi || '').toUpperCase()} - ${session.config.username})`,
        session: this.sessionState
      };
    } catch (err) {
      this.sessionState.isConnected = false;
      this.sessionState.status = 'ERROR';
      addLog('error', `[IAS] ❌ Login gagal: ${err.message}`);
      return {
        success: false,
        error: err.message,
        session: this.sessionState
      };
    }
  }

  /**
   * Logout from Web IAS and close active browser session
   */
  async logout() {
    try {
      if (this.persistentSession && this.persistentSession.browser) {
        await this.persistentSession.browser.close().catch(() => {});
      }
    } finally {
      this.persistentSession = null;
      this.sessionState = {
        isConnected: false,
        status: 'DISCONNECTED',
        lastConnected: null,
        lastConnectedTimestamp: null,
        user: null,
        koneksi: null,
        url: null
      };
      addLog('info', `[IAS] 🚪 Sesi Web IAS telah diputuskan (Logout).`);
      return { success: true };
    }
  }

  /**
   * Check current live status for both Hitstok and LPP.
   * DOES NOT launch a browser if session is disconnected (returns cached info immediately).
   */
  async getTasksLiveStatus(customConfig = null, existingSession = null) {
    const session = existingSession || this.persistentSession;

    // Read last run info from config.json
    let lastHitstokRun = null;
    let lastLppRun = null;
    if (fs.existsSync(this.configFile)) {
      const cfg = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      lastHitstokRun = cfg.lastHitstokRun || null;
      lastLppRun = cfg.lastLppRun || null;
    }

    // If no active session, DO NOT launch a browser! Return cached info instantly.
    if (!session || !session.browser || !session.browser.isConnected()) {
      return {
        success: true,
        isConnected: false,
        lastHitstokRun,
        lastLppRun
      };
    }

    try {
      const { page, baseUrl } = session;

      // 1. Check Hitstok
      await page.goto(`${baseUrl}/bo/proses/hitungulangstock`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);

      const hitstokStatus = await page.evaluate(async () => {
        const p1 = $('#periode1').val();
        const p2 = $('#periode2').val();
        return new Promise((resolve) => {
          $.ajax({
            url: '/bo/proses/hitungulangstock/get-status',
            type: 'get',
            data: { periode1: p1, periode2: p2 },
            success: (res) => resolve({ periode1: p1, periode2: p2, ...res }),
            error: (err) => resolve({ periode1: p1, periode2: p2, status: 'ERROR', message: err.statusText })
          });
        });
      });

      // 2. Check LPP
      await page.goto(`${baseUrl}/bo/lpp/proses-lpp`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);

      const lppStatus = await page.evaluate(async () => {
        const p1 = $('#periode1').val();
        const p2 = $('#periode2').val();
        return new Promise((resolve) => {
          $.ajax({
            url: '/bo/lpp/proses-lpp/get-status',
            type: 'get',
            data: { periode1: p1, periode2: p2 },
            success: (res) => resolve({ periode1: p1, periode2: p2, ...res }),
            error: (err) => resolve({ periode1: p1, periode2: p2, status: 'ERROR', message: err.statusText })
          });
        });
      });

      addLog('success', `[IAS] ✅ Berhasil memperbarui status Hitstok dan LPP.`);
      return {
        success: true,
        isConnected: true,
        hitstok: hitstokStatus,
        lpp: lppStatus,
        lastHitstokRun,
        lastLppRun
      };

    } catch (err) {
      addLog('error', `[IAS] Gagal mengambil status live tasks: ${err.message}`);
      return {
        success: false,
        isConnected: true,
        error: err.message,
        lastHitstokRun,
        lastLppRun
      };
    }
  }

  /**
   * TASK 1: Run Hitung Ulang Stock
   * @param {Object} opts { periode1, periode2, plu1, plu2, updateOnlineStock, iterations }
   */
  async runHitungUlangStock(opts = {}) {
    if (this.activeTask) {
      throw new Error(`Saat ini sedang berjalan tugas: ${this.activeTask}. Mohon tunggu hingga selesai.`);
    }

    this.activeTask = 'HITUNG_ULANG_STOCK';
    let session = null;
    const totalPasses = opts.iterations || 1;

    try {
      session = await this.getOrCreateSession();
      const { page, baseUrl } = session;

      addLog('info', `[IAS] [TASK HITSTOK] Membuka halaman Hitung Ulang Stock...`);
      await page.goto(`${baseUrl}/bo/proses/hitungulangstock`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Read or fill parameters safely without readonly errors
      let p1 = (opts.periode1 || '').trim();
      let p2 = (opts.periode2 || '').trim();
      let plu1 = (opts.plu1 || '').trim();
      let plu2 = (opts.plu2 || '').trim();
      if (plu1) plu1 = plu1.padStart(7, '0');
      if (plu2) plu2 = plu2.padStart(7, '0');

      await page.evaluate(({ p1Val, p2Val, plu1Val, plu2Val }) => {
        if (p1Val) {
          const el1 = document.querySelector('#periode1');
          if (el1) { el1.removeAttribute('readonly'); el1.value = p1Val; }
          if (window.$) $('#periode1').val(p1Val).trigger('change');
        }
        if (p2Val) {
          const el2 = document.querySelector('#periode2');
          if (el2) { el2.removeAttribute('readonly'); el2.value = p2Val; }
          if (window.$) $('#periode2').val(p2Val).trigger('change');
        }
        if (plu1Val) {
          if (window.$) $('#plu1').val(plu1Val).trigger('change');
          else { const el = document.querySelector('#plu1'); if (el) el.value = plu1Val; }
        }
        if (plu2Val) {
          if (window.$) $('#plu2').val(plu2Val).trigger('change');
          else { const el = document.querySelector('#plu2'); if (el) el.value = plu2Val; }
        }
      }, { p1Val: p1, p2Val: p2, plu1Val: plu1, plu2Val: plu2 });

      if (!p1) p1 = await page.$eval('#periode1', el => el.value).catch(() => '');
      if (!p2) p2 = await page.$eval('#periode2', el => el.value).catch(() => '');

      addLog('info', `[IAS] [TASK HITSTOK] Menjalankan proses hitung stok untuk Periode ${p1} s/d ${p2} (PLU: ${plu1 || 'SEMUA PLU'}, Total ${totalPasses} Putaran)...`);

      let lastData = null;
      let isDoneAll = false;

      for (let pass = 1; pass <= totalPasses; pass++) {
        addLog('info', `[IAS] [TASK HITSTOK] 🔄 Memulai Putaran ${pass}/${totalPasses}...`);

        // Reset / proses-ulang if previously DONE
        await page.evaluate(async ({ p1, p2 }) => {
          return new Promise((resolve) => {
            if (typeof ajaxSetup === 'function') ajaxSetup();
            $.ajax({
              url: '/bo/proses/hitungulangstock/proses-ulang',
              type: 'post',
              data: { periode1: p1, periode2: p2 },
              success: (res) => resolve(res),
              error: () => resolve(null)
            });
          });
        }, { p1, p2 });

        // Trigger Step 1: Hitung Ulang Stock
        addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Memicu Step 1: Hitung Ulang Stock...`);
        const step1Res = await page.evaluate(async ({ p1, p2, plu1, plu2 }) => {
          return new Promise((resolve) => {
            if (typeof ajaxSetup === 'function') ajaxSetup();
            $.ajax({
              url: '/bo/proses/hitungulangstock/hitung-ulang-stock',
              type: 'post',
              data: { periode1: p1, periode2: p2, plu1: plu1, plu2: plu2 },
              success: (res) => resolve({ ok: true, res }),
              error: (err) => resolve({ ok: false, error: err.statusText || 'Error request' }),
              timeout: 30000
            });
          });
        }, { p1, p2, plu1, plu2 });

        addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Respon Step 1: ${JSON.stringify(step1Res.res || step1Res.error)}`);

        // Trigger Step 2: Hitung Ulang Stock CMO
        addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Memicu Step 2: Hitung Ulang Stock CMO...`);
        const step2Res = await page.evaluate(async ({ p1, p2, plu1, plu2 }) => {
          return new Promise((resolve) => {
            if (typeof ajaxSetup === 'function') ajaxSetup();
            $.ajax({
              url: '/bo/proses/hitungulangstock/hitung-ulang-stock-cmo',
              type: 'post',
              data: { periode1: p1, periode2: p2, plu1: plu1, plu2: plu2 },
              success: (res) => resolve({ ok: true, res }),
              error: (err) => resolve({ ok: false, error: err.statusText || 'Error request' }),
              timeout: 30000
            });
          });
        }, { p1, p2, plu1, plu2 });

        addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Respon Step 2: ${JSON.stringify(step2Res.res || step2Res.error)}`);

        // Polling status until DONE (max 90 seconds)
        addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Memantau proses hitung stok hingga berstatus DONE...`);
        let isDone = false;
        let checkAttempts = 0;

        while (!isDone && checkAttempts < 30) {
          checkAttempts++;
          await page.waitForTimeout(3000);

          const pollRes = await page.evaluate(async ({ p1, p2 }) => {
            return new Promise((resolve) => {
              if (typeof ajaxSetup === 'function') ajaxSetup();
              $.ajax({
                url: '/bo/proses/hitungulangstock/get-status',
                type: 'get',
                data: { periode1: p1, periode2: p2 },
                success: (res) => resolve(res),
                error: () => resolve(null)
              });
            });
          }, { p1, p2 });

          if (pollRes && Array.isArray(pollRes.data)) {
            lastData = pollRes.data;
            const statuses = pollRes.data.map(d => `${d.submenu}: ${d.status}`);
            addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Status check #${checkAttempts}: ${statuses.join(' | ')}`);

            const allDone = pollRes.data.every(d => d.status === 'DONE');
            if (allDone) {
              isDone = true;
              break;
            }
          }
        }

        // Optional: UPDATE ONLINE STOCK SPI
        if (opts.updateOnlineStock) {
          addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Memicu UPDATE ONLINE STOCK SPI...`);
          const onlineStockResult = await page.evaluate(async () => {
            return new Promise((resolve) => {
              if (typeof ajaxSetup === 'function') ajaxSetup();
              $.ajax({
                url: '/bo/proses/hitungulangstock/update-online-stock-spi',
                type: 'post',
                success: (res) => resolve(res),
                error: (err) => resolve({ error: err.statusText })
              });
            });
          });
          addLog('info', `[IAS] [TASK HITSTOK] [Putaran ${pass}/${totalPasses}] Respon Update Online Stock SPI: ${JSON.stringify(onlineStockResult)}`);
        }

        if (isDone) {
          addLog('success', `[IAS] [TASK HITSTOK] ✅ Putaran ${pass}/${totalPasses} Selesai!`);
        }

        if (pass === totalPasses) {
          isDoneAll = isDone;
        } else {
          await page.waitForTimeout(2000);
        }
      }

      // Save execution info
      const nowStr = new Date().toLocaleString('id-ID');
      const execRecord = {
        time: nowStr,
        status: isDoneAll ? 'DONE' : 'TIMEOUT_WAITING',
        periode: `${p1} s/d ${p2}`,
        pluRange: plu1 ? `${plu1} s/d ${plu2 || plu1}` : 'SEMUA',
        onlineStockUpdated: !!opts.updateOnlineStock,
        details: lastData,
        passesCompleted: totalPasses
      };

      if (fs.existsSync(this.configFile)) {
        const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        raw.lastHitstokRun = execRecord;
        fs.writeFileSync(this.configFile, JSON.stringify(raw, null, 2));
      }

      addLog('success', `[IAS] 🎉 [TASK HITSTOK] Selesai ${totalPasses} Putaran dengan status: ${execRecord.status}!`);
      return {
        success: true,
        ...execRecord
      };

    } catch (err) {
      addLog('error', `[IAS] ❌ [TASK HITSTOK] Gagal: ${err.message}`);
      throw err;
    } finally {
      this.activeTask = null;
    }
  }

  /**
   * TASK 2: Run Proses LPP (Bulanan atau Harian)
   * @param {Object} opts { mode: 'bulanan' | 'harian', periode1, periode2, tanggalSo, khususAudit, iterations }
   */
  async runProsesLPP(opts = {}) {
    if (this.activeTask) {
      throw new Error(`Saat ini sedang berjalan tugas: ${this.activeTask}. Mohon tunggu hingga selesai.`);
    }

    this.activeTask = 'PROSES_LPP';
    let session = null;
    const totalPasses = opts.iterations || 1;

    try {
      session = await this.getOrCreateSession();
      const { page, baseUrl } = session;

      const isHarian = opts.mode === 'harian';
      const targetUrl = isHarian 
        ? `${baseUrl}/bo/lpp/proses-lpp-harian` 
        : `${baseUrl}/bo/lpp/proses-lpp`;

      addLog('info', `[IAS] [TASK LPP] Membuka halaman ${isHarian ? 'Proses LPP Harian' : 'Proses LPP'} (${targetUrl})...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Read or fill parameters safely without readonly errors
      let p1 = (opts.periode1 || '').trim();
      let p2 = (opts.periode2 || '').trim();

      await page.evaluate(({ p1Val, p2Val }) => {
        if (p1Val) {
          const el1 = document.querySelector('#periode1');
          if (el1) { el1.removeAttribute('readonly'); el1.value = p1Val; }
          if (window.$) $('#periode1').val(p1Val).trigger('change');
        }
        if (p2Val) {
          const el2 = document.querySelector('#periode2');
          if (el2) { el2.removeAttribute('readonly'); el2.value = p2Val; }
          if (window.$) $('#periode2').val(p2Val).trigger('change');
        }
      }, { p1Val: p1, p2Val: p2 });

      if (!p1) p1 = await page.$eval('#periode1', el => el.value).catch(() => '');
      if (!p2) p2 = await page.$eval('#periode2', el => el.value).catch(() => '');

      let tanggalSo = opts.tanggalSo;
      if (isHarian) {
        if (!tanggalSo) tanggalSo = await page.$eval('#tanggal-so', el => el.value);
        if (opts.tanggalSo) await page.fill('#tanggal-so', opts.tanggalSo);
        if (opts.khususAudit) {
          await page.check('#audit');
        }
      }

      addLog('info', `[IAS] [TASK LPP] Menjalankan ${isHarian ? 'LPP Harian' : 'LPP Bulanan'} untuk Periode ${p1} s/d ${p2} (Total: ${totalPasses} Putaran)...`);

      let lastStatusData = null;
      let isDoneAll = false;

      if (!isHarian) {
        for (let pass = 1; pass <= totalPasses; pass++) {
          addLog('info', `[IAS] [TASK LPP] 🔄 Memulai Putaran ${pass}/${totalPasses}...`);

          // 1. Panggil proses-ulang untuk mereset status jika sebelumnya DONE
          await page.evaluate(async ({ p1, p2 }) => {
            return new Promise((resolve) => {
              if (typeof ajaxSetup === 'function') ajaxSetup();
              $.ajax({
                url: '/bo/lpp/proses-lpp/proses-ulang',
                type: 'post',
                data: { periode1: p1, periode2: p2 },
                success: (res) => resolve(res),
                error: () => resolve(null)
              });
            });
          }, { p1, p2 });

          // 2. Memicu POST proses LPP Bulanan
          const triggerResult = await page.evaluate(async ({ p1, p2 }) => {
            return new Promise((resolve) => {
              if (typeof ajaxSetup === 'function') ajaxSetup();
              $.ajax({
                url: '/bo/lpp/proses-lpp/proses',
                type: 'post',
                data: { periode1: p1, periode2: p2 },
                success: (res) => resolve({ ok: true, res }),
                error: (err) => resolve({ ok: false, error: err.statusText || 'Error request' }),
                timeout: 30000
              });
            });
          }, { p1, p2 });

          addLog('info', `[IAS] [TASK LPP] [Putaran ${pass}/${totalPasses}] Respon pemicu LPP: ${JSON.stringify(triggerResult.res || triggerResult.error)}`);

          // 3. Polling status until DONE (max 90 seconds)
          addLog('info', `[IAS] [TASK LPP] [Putaran ${pass}/${totalPasses}] Memantau status proses LPP hingga selesai...`);
          let checkAttempts = 0;
          let isDone = false;

          while (!isDone && checkAttempts < 30) {
            checkAttempts++;
            await page.waitForTimeout(3000);

            const pollRes = await page.evaluate(async ({ p1, p2 }) => {
              return new Promise((resolve) => {
                if (typeof ajaxSetup === 'function') ajaxSetup();
                $.ajax({
                  url: '/bo/lpp/proses-lpp/get-status',
                  type: 'get',
                  data: { periode1: p1, periode2: p2 },
                  success: (res) => resolve(res),
                  error: () => resolve(null)
                });
              });
            }, { p1, p2 });

            if (pollRes && pollRes.data) {
              lastStatusData = pollRes.data;
              addLog('info', `[IAS] [TASK LPP] [Putaran ${pass}/${totalPasses}] Status check #${checkAttempts}: ${pollRes.data.status} (Start: ${pollRes.data.start_time || '-'}, Finish: ${pollRes.data.end_time || '-'})`);
              if (pollRes.data.status === 'DONE') {
                isDone = true;
                break;
              }
            }
          }

          if (isDone) {
            addLog('success', `[IAS] [TASK LPP] ✅ Putaran ${pass}/${totalPasses} Selesai!`);
          }

          if (pass === totalPasses) {
            isDoneAll = isDone;
          } else {
            await page.waitForTimeout(2000);
          }
        }
      } else {
        // LPP Harian: Click button PROSES LAPORAN
        addLog('info', `[IAS] [TASK LPP HARIAN] Mengklik tombol PROSES LAPORAN...`);
        await page.click('#btn-proses');
        await page.waitForTimeout(5000);

        // Check for any swal alert
        const swal = await page.$('.swal2-html-container, .swal-text');
        const alertMsg = swal ? await swal.innerText() : 'Proses laporan LPP Harian dikirim.';
        addLog('info', `[IAS] [TASK LPP HARIAN] Notifikasi: ${alertMsg.replace(/\n|\r/g, ' ')}`);
        isDoneAll = true;
        lastStatusData = { status: 'DONE', message: alertMsg };
      }

      // Save execution info
      const nowStr = new Date().toLocaleString('id-ID');
      const execRecord = {
        time: nowStr,
        mode: isHarian ? 'Harian' : 'Bulanan',
        status: isDoneAll ? 'DONE' : 'TIMEOUT_WAITING',
        periode: `${p1} s/d ${p2}`,
        tanggalSo: tanggalSo || '-',
        startTime: lastStatusData?.start_time || '-',
        endTime: lastStatusData?.end_time || '-',
        details: lastStatusData,
        passesCompleted: totalPasses
      };

      if (fs.existsSync(this.configFile)) {
        const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        raw.lastLppRun = execRecord;
        fs.writeFileSync(this.configFile, JSON.stringify(raw, null, 2));
      }

      addLog('success', `[IAS] 🎉 [TASK LPP] Selesai ${totalPasses} Putaran dengan status: ${execRecord.status}!`);
      return {
        success: true,
        ...execRecord
      };

    } catch (err) {
      addLog('error', `[IAS] ❌ [TASK LPP] Gagal: ${err.message}`);
      throw err;
    } finally {
      this.activeTask = null;
    }
  }

  getActiveTask() {
    return this.activeTask;
  }

  /**
   * Mengambil file Register LPP terakhir yang tersimpan
   */
  getLatestRegisterLPP() {
    const lppFilePath = path.join(__dirname, '../../data_register_lpp.json');
    try {
      if (fs.existsSync(lppFilePath)) {
        return JSON.parse(fs.readFileSync(lppFilePath, 'utf8'));
      }
    } catch (e) {
      console.error('Error reading data_register_lpp.json:', e);
    }
    return null;
  }

  /**
   * Mengambil laporan Register LPP dari Web IAS dan mengekstrak seluruh nilai kolom
   * URL format: /bo/lpp/register-lpp/cetak?menu=LPP01&export_type=pdf&periode1=...&periode2=...&tipe=3
   */
  async fetchAndParseRegisterLPP(opts = {}) {
    if (this.activeTask) {
      throw new Error(`Tugas lain (${this.activeTask}) sedang berjalan di Web IAS.`);
    }
    this.activeTask = 'Register LPP (Data Pembanding)';

    let session = null;
    try {
      const config = this.getConfig();
      const baseUrl = (config.baseUrl || 'http://172.31.146.190').replace(/\/$/, '');

      const menu = opts.menu || 'LPP01';
      const exportType = opts.export_type || 'pdf';
      const p1 = opts.periode1 || '01/09/2026';
      const p2 = opts.periode2 || '01/09/2026';
      const prdcd1 = opts.prdcd1 || '';
      const prdcd2 = opts.prdcd2 || '';
      const dep1 = opts.dep1 || '';
      const dep2 = opts.dep2 || '';
      const mtr1 = opts.mtr1 || '';
      const mtr2 = opts.mtr2 || '';
      const kat1 = opts.kat1 || '';
      const kat2 = opts.kat2 || '';
      const sup1 = opts.sup1 || '';
      const sup2 = opts.sup2 || '';
      const tipe = opts.tipe || '3';
      const banyakitem = opts.banyakitem || '';

      const queryParams = new URLSearchParams({
        menu,
        export_type: exportType,
        periode1: p1,
        periode2: p2,
        prdcd1,
        prdcd2,
        dep1,
        dep2,
        mtr1,
        mtr2,
        kat1,
        kat2,
        sup1,
        sup2,
        tipe,
        banyakitem
      });

      const cetakUrl = `${baseUrl}/bo/lpp/register-lpp/cetak?${queryParams.toString()}`;

      addLog('info', `[IAS] [REGISTER LPP] Membuka sesi dan mengambil laporan Register LPP (${menu}, Periode: ${p1} s/d ${p2})...`);

      session = await this.getOrCreateSession();
      const page = session.page;

      const response = await page.goto(cetakUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const html = await response.text();

      addLog('info', `[IAS] [REGISTER LPP] Respons laporan diterima (${Math.round(html.length / 1024)} KB). Mengekstrak kolom data...`);

      // Parsing HTML laporan Register LPP
      const stripTags = (str) => (str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const parseCell = (tdHtml) => {
        if (!tdHtml) return { rp: '0', qty: '0', raw: '0' };
        const parts = tdHtml.split(/<br\s*[\/]?>/i).map(s => stripTags(s)).filter(Boolean);
        return {
          rp: parts[0] || '0',
          qty: parts[1] || '0',
          raw: stripTags(tdHtml)
        };
      };

      const trRegex = /<tr[\s\S]*?<\/tr>/gi;
      const tdRegex = /<td[\s\S]*?<\/td>/gi;

      let currentDivisi = '';
      let currentDepartemen = '';
      const categories = [];
      const summaries = [];
      let grandTotal = null;

      let match;
      while ((match = trRegex.exec(html)) !== null) {
        const trHtml = match[0];
        const tds = trHtml.match(tdRegex);
        if (!tds || tds.length === 0) continue;

        const col0 = stripTags(tds[0]);
        const col1 = tds.length > 1 ? stripTags(tds[1]) : '';

        if (col0.toUpperCase() === 'DIVISI') {
          currentDivisi = col1;
          continue;
        }
        if (col0.toUpperCase() === 'DEPARTEMEN') {
          currentDepartemen = col1;
          continue;
        }

        // ====================================================================
        // Branch 1: Menu LPP08 (Retur) & LPP10 (Rusak) -> 12/13 Kolom
        // ====================================================================
        if (menu === 'LPP08' || menu === 'LPP10') {
          // Summary row: SUB TOTAL DEPT, SUB TOTAL DIVISI, TOTAL SELURUHNYA
          if (col0.toUpperCase().startsWith('SUB TOTAL') || col0.toUpperCase().startsWith('TOTAL')) {
            const isGrandTotal = col0.toUpperCase().startsWith('TOTAL SELURUHNYA');
            const isDivisi = col0.toUpperCase().includes('DIVISI');

            const summaryItem = {
              type: isGrandTotal ? 'GRAND_TOTAL' : (isDivisi ? 'SUBTOTAL_DIVISI' : 'SUBTOTAL_DEPT'),
              label: col0,
              divisi: currentDivisi,
              departemen: currentDepartemen,
              saldoAwal: parseCell(tds[1]),
              penerimaanBaik: stripTags(tds[2]),
              penerimaanRusak: stripTags(tds[3]),
              pengeluaranSupplier: stripTags(tds[4]),
              hilang: stripTags(tds[5]),
              pengeluaranLainBaik: stripTags(tds[6]),
              pengeluaranLainRusak: stripTags(tds[7]),
              so: stripTags(tds[8]),
              penyesuaian: stripTags(tds[9]),
              koreksi: stripTags(tds[10]),
              saldoAkhir: parseCell(tds[11])
            };

            if (isGrandTotal) {
              grandTotal = summaryItem;
            } else {
              summaries.push(summaryItem);
            }
            continue;
          }

          // Category data row (13 columns)
          if (tds.length >= 12) {
            const rowItem = {
              divisi: currentDivisi,
              departemen: currentDepartemen,
              kode: col0,
              namaKategori: col1,
              saldoAwal: parseCell(tds[2]),
              penerimaanBaik: stripTags(tds[3]),
              penerimaanRusak: stripTags(tds[4]),
              pengeluaranSupplier: stripTags(tds[5]),
              hilang: stripTags(tds[6]),
              pengeluaranLainBaik: stripTags(tds[7]),
              pengeluaranLainRusak: stripTags(tds[8]),
              so: stripTags(tds[9]),
              penyesuaian: stripTags(tds[10]),
              koreksi: stripTags(tds[11]),
              saldoAkhir: parseCell(tds[12])
            };

            categories.push(rowItem);
            continue;
          }
        }

        // ====================================================================
        // Branch 2: Menu LPP01 (Baik) -> 17/18 Kolom
        // ====================================================================
        // Summary row: SUB TOTAL DEPT, SUB TOTAL DIVISI, TOTAL SELURUHNYA
        if (col0.toUpperCase().startsWith('SUB TOTAL') || col0.toUpperCase().startsWith('TOTAL')) {
          const isGrandTotal = col0.toUpperCase().startsWith('TOTAL SELURUHNYA');
          const isDivisi = col0.toUpperCase().includes('DIVISI');

          const summaryItem = {
            type: isGrandTotal ? 'GRAND_TOTAL' : (isDivisi ? 'SUBTOTAL_DIVISI' : 'SUBTOTAL_DEPT'),
            label: col0,
            divisi: currentDivisi,
            departemen: currentDepartemen,
            saldoAwal: parseCell(tds[1]),
            pembelianMurni: stripTags(tds[2]),
            pembelianBonus: stripTags(tds[3]),
            transferIn: stripTags(tds[4]),
            returPenjualan: stripTags(tds[5]),
            repackIn: stripTags(tds[6]),
            penerimaanLain: stripTags(tds[7]),
            penjualan: stripTags(tds[8]),
            transferOut: stripTags(tds[9]),
            repackOut: stripTags(tds[10]),
            hilang: stripTags(tds[11]),
            pengeluaranLain: stripTags(tds[12]),
            so: stripTags(tds[13]),
            penyesuaian: stripTags(tds[14]),
            koreksi: stripTags(tds[15]),
            saldoAkhir: parseCell(tds[16] || tds[17])
          };

          if (isGrandTotal) {
            grandTotal = summaryItem;
          } else {
            summaries.push(summaryItem);
          }
          continue;
        }

        // Category data row (17 or 18 columns)
        if (tds.length >= 17) {
          const rowItem = {
            divisi: currentDivisi,
            departemen: currentDepartemen,
            kode: col0,
            namaKategori: col1,
            saldoAwal: parseCell(tds[2]),
            pembelianMurni: stripTags(tds[3]),
            pembelianBonus: stripTags(tds[4]),
            transferIn: stripTags(tds[5]),
            returPenjualan: stripTags(tds[6]),
            repackIn: stripTags(tds[7]),
            penerimaanLain: stripTags(tds[8]),
            penjualan: stripTags(tds[9]),
            transferOut: stripTags(tds[10]),
            repackOut: stripTags(tds[11]),
            hilang: stripTags(tds[12]),
            pengeluaranLain: stripTags(tds[13]),
            so: stripTags(tds[14]),
            penyesuaian: stripTags(tds[15]),
            koreksi: stripTags(tds[16]),
            saldoAkhir: parseCell(tds[17] || tds[16])
          };

          categories.push(rowItem);
        }
      }

      // Fallback: Jika baris TOTAL SELURUHNYA tidak ada, hitung dari agregat divisi/departemen
      if (!grandTotal && summaries.length > 0) {
        const divSummaries = summaries.filter(s => s.type === 'SUBTOTAL_DIVISI');
        const itemsToSum = divSummaries.length > 0 ? divSummaries : summaries;

        const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
        let sumAwal = 0;
        let sumAkhir = 0;
        let sumPenjualan = 0;
        let sumMurni = 0;
        let sumBonus = 0;
        let sumBaik = 0;
        let sumRusak = 0;

        itemsToSum.forEach(item => {
          sumAwal += parseNum(item.saldoAwal?.rp || item.saldoAwal);
          sumAkhir += parseNum(item.saldoAkhir?.rp || item.saldoAkhir);
          if (item.penjualan) sumPenjualan += parseNum(item.penjualan);
          if (item.pembelianMurni) sumMurni += parseNum(item.pembelianMurni);
          if (item.pembelianBonus) sumBonus += parseNum(item.pembelianBonus);
          if (item.penerimaanBaik) sumBaik += parseNum(item.penerimaanBaik);
          if (item.penerimaanRusak) sumRusak += parseNum(item.penerimaanRusak);
        });

        grandTotal = {
          type: 'GRAND_TOTAL',
          label: 'TOTAL SELURUHNYA',
          divisi: 'ALL',
          departemen: 'ALL',
          saldoAwal: { rp: sumAwal.toLocaleString('id-ID'), qty: '0', raw: String(sumAwal) },
          saldoAkhir: { rp: sumAkhir.toLocaleString('id-ID'), qty: '0', raw: String(sumAkhir) },
          penjualan: sumPenjualan.toLocaleString('id-ID'),
          pembelianMurni: sumMurni.toLocaleString('id-ID'),
          pembelianBonus: sumBonus.toLocaleString('id-ID'),
          penerimaanBaik: sumBaik.toLocaleString('id-ID'),
          penerimaanRusak: sumRusak.toLocaleString('id-ID')
        };
      }

      // Metadata dari header teks laporan
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      const titleText = titleMatch ? stripTags(titleMatch[1]) : 'POSISI & MUTASI PERSEDIAAN BARANG BAIK';

      const resultPayload = {
        success: true,
        time: new Date().toLocaleString('id-ID'),
        timestamp: Date.now(),
        params: {
          menu,
          exportType,
          periode1: p1,
          periode2: p2,
          tipe
        },
        metadata: {
          title: titleText,
          periode: `${p1} s/d ${p2}`
        },
        grandTotal,
        totalCategories: categories.length,
        totalSummaries: summaries.length,
        categories,
        summaries
      };

      // Simpan ke file data_register_lpp.json atau data_register_lpp_prev.json
      if (opts && opts.isPrevMonth) {
        const savePrevPath = path.join(__dirname, '../../data_register_lpp_prev.json');
        fs.writeFileSync(savePrevPath, JSON.stringify(resultPayload, null, 2));
      } else {
        const savePath = path.join(__dirname, '../../data_register_lpp.json');
        fs.writeFileSync(savePath, JSON.stringify(resultPayload, null, 2));

        // Update config.json dengan summary eksekusi
        if (fs.existsSync(this.configFile)) {
          const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
          raw.lastRegisterLppRun = {
            time: resultPayload.time,
            periode: `${p1} s/d ${p2}`,
            menu,
            totalCategories: categories.length,
            saldoAwalRp: grandTotal?.saldoAwal?.rp || '0',
            saldoAwalQty: grandTotal?.saldoAwal?.qty || '0',
            penjualan: grandTotal?.penjualan || '0',
            saldoAkhirRp: grandTotal?.saldoAkhir?.rp || '0',
            saldoAkhirQty: grandTotal?.saldoAkhir?.qty || '0'
          };
          fs.writeFileSync(this.configFile, JSON.stringify(raw, null, 2));
        }
      }

      // Sinkronisasi otomatis ke Kroscek Data jika menu LPP08 (LPP-02) atau LPP10 (LPP-03)
      const currentMEPrefix = (config.periode1 || '01/09/2026').substring(3); // e.g. "09/2026"
      const reportMonthPrefix = p1.substring(3); // e.g. "08/2026" or "09/2026"
      const isNextMonth = Boolean(opts && opts.isNextMonth);
      const isPastMonth = !isNextMonth && Boolean((opts && opts.isPrevMonth) || (reportMonthPrefix !== currentMEPrefix));

      if (isNextMonth) {
        const kData = this.getKroscekData();
        const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
        const sa = parseNum(grandTotal?.saldoAwal?.rp || grandTotal?.saldoAwal);
        if (menu === 'LPP08') {
          kData.antarLpp.lpp02_next_awal = sa;
        } else if (menu === 'LPP10') {
          kData.antarLpp.lpp03_next_awal = sa;
        } else {
          kData.antarLpp.lpp01_next_awal = sa;
        }
        this.saveKroscekData(kData);
        addLog('success', `[IAS] 🔄 Sinkronisasi Saldo Awal LPP (${menu}) Bulan Baru ke Kroscek Antar LPP: Rp ${sa.toLocaleString('id-ID')}`);
      } else if (menu === 'LPP08') {
        const kData = this.getKroscekData();
        const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
        const sa = parseNum(grandTotal?.saldoAwal?.rp || grandTotal?.saldoAwal);
        const sak = parseNum(grandTotal?.saldoAkhir?.rp || grandTotal?.saldoAkhir);
        const pb = parseNum(grandTotal?.penerimaanBaik);

        if (isPastMonth) {
          kData.antarLpp.lpp02_prev = sak;
          this.saveKroscekData(kData);
          addLog('success', `[IAS] 🔄 Sinkronisasi Saldo Akhir LPP 02 (Retur) Bulan Lalu ke Kroscek Antar LPP (Rp ${sak.toLocaleString('id-ID')}) berhasil!`);
        } else {
          kData.antarLpp.lpp02_me_awal = sa;
          kData.antarLpp.lpp02_me_akhir = sak;
          kData.lpp02_penerimaanBaik = pb;
          kData.pembanding.pengeluaranLain = pb + (kData.lpp03_penerimaanBaik || 0); // BA Retur IDM = 0
          this.saveKroscekData(kData);
          addLog('success', `[IAS] 🔄 Sinkronisasi nilai LPP 02 (Retur) ke Kroscek Antar LPP & Pengeluaran Lain Pembanding (Rp ${kData.pembanding.pengeluaranLain.toLocaleString('id-ID')}) berhasil!`);
        }
      } else if (menu === 'LPP10') {
        const kData = this.getKroscekData();
        const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
        const sa = parseNum(grandTotal?.saldoAwal?.rp || grandTotal?.saldoAwal);
        const sak = parseNum(grandTotal?.saldoAkhir?.rp || grandTotal?.saldoAkhir);
        const pb = parseNum(grandTotal?.penerimaanBaik);

        if (isPastMonth) {
          kData.antarLpp.lpp03_prev = sak;
          this.saveKroscekData(kData);
          addLog('success', `[IAS] 🔄 Sinkronisasi Saldo Akhir LPP 03 (Rusak) Bulan Lalu ke Kroscek Antar LPP (Rp ${sak.toLocaleString('id-ID')}) berhasil!`);
        } else {
          kData.antarLpp.lpp03_me_awal = sa;
          kData.antarLpp.lpp03_me_akhir = sak;
          kData.lpp03_penerimaanBaik = pb;
          kData.pembanding.pengeluaranLain = (kData.lpp02_penerimaanBaik || 0) + pb; // BA Retur IDM = 0
          this.saveKroscekData(kData);
          addLog('success', `[IAS] 🔄 Sinkronisasi nilai LPP 03 (Rusak) ke Kroscek Antar LPP & Pengeluaran Lain Pembanding (Rp ${kData.pembanding.pengeluaranLain.toLocaleString('id-ID')}) berhasil!`);
        }
      }

      addLog('success', `[IAS] ✅ [REGISTER LPP] Sukses mengekstrak ${categories.length} kategori, ${summaries.length} subtotal, dan Grand Total (Saldo Awal: Rp ${grandTotal?.saldoAwal?.rp || 0}, Saldo Akhir: Rp ${grandTotal?.saldoAkhir?.rp || 0})!`);

      return resultPayload;

    } catch (err) {
      addLog('error', `[IAS] ❌ [REGISTER LPP] Gagal: ${err.message}`);
      throw err;
    } finally {
      this.activeTask = null;
    }
  }

  // ==========================================================================
  // KROSCEK DATA LAPORAN LPP (Posisi & Mutasi Persediaan SOP)
  // ==========================================================================

  getKroscekFilePath() {
    return path.join(__dirname, '../../data_kroscek_lpp.json');
  }

  getDefaultKroscekData() {
    return {
      periode: '01/09/2026',
      updatedAt: new Date().toISOString(),
      lpp01: {
        saldoAkhirSebelumME: 0,
        saldoAwalBulanME: 0,
        pembelianMurni: 0,
        pembelianBonus: 0,
        transferIn: 0,
        returPenjualan: 0,
        repack: 0,
        penerimaanLain: 0,
        penjualan: 0,
        transferOut: 0,
        prepack: 0,
        hilang: 0,
        pengeluaranLain: 0,
        so: 0,
        intransit: 0,
        penyesuaian: 0,
        koreksi: 0,
        saldoAkhirBulanME: 0
      },
      pembanding: {
        saldoAkhirSebelumME: 0,
        saldoAwalBulanME: 0,
        pembelianMurni: 0,
        pembelianBonus: 0,
        transferIn: 0,
        returPenjualan: 0,
        repack: 0,
        penerimaanLain: 0,
        penjualan: 0,
        transferOut: 0,
        prepack: 0,
        hilang: 0,
        pengeluaranLain: 0,
        so: 0,
        intransit: 0,
        penyesuaian: 0,
        koreksi: 0,
        saldoAkhirBulanME: 0
      },
      antarLpp: {
        lpp01_prev: 0,
        lpp01_me_awal: 0,
        lpp01_me_akhir: 0,
        lpp01_next_awal: 0,
        lpp02_prev: 0,
        lpp02_me_awal: 0,
        lpp02_me_akhir: 0,
        lpp02_next_awal: 0,
        lpp03_prev: 0,
        lpp03_me_awal: 0,
        lpp03_me_akhir: 0,
        lpp03_next_awal: 0
      }
    };
  }

  getKroscekData() {
    const kPath = this.getKroscekFilePath();
    if (fs.existsSync(kPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(kPath, 'utf8'));
        return data;
      } catch (e) {
        console.error('Error reading data_kroscek_lpp.json:', e);
      }
    }
    const def = this.getDefaultKroscekData();
    // Coba auto-sync dari data_register_lpp.json jika ada
    return this.syncKroscekFromLpp01(def);
  }

  saveKroscekData(payload) {
    const kPath = this.getKroscekFilePath();
    const current = this.getKroscekData();
    const merged = {
      ...current,
      ...payload,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(kPath, JSON.stringify(merged, null, 2));
    addLog('info', `[IAS] 💾 Data Kroscek LPP berhasil disimpan.`);
    return merged;
  }

  syncKroscekFromLpp01(targetData = null) {
    const data = targetData || this.getKroscekData();
    let regLpp = this.getLatestRegisterLPP();

    // Jika register LPP kosong atau mutasinya 0, periksa data_register_lpp_prev.json
    const isMutasiEmpty = !regLpp || !regLpp.grandTotal || (
      (regLpp.grandTotal.pembelianMurni === '0' || !regLpp.grandTotal.pembelianMurni) &&
      (regLpp.grandTotal.penjualan === '0' || !regLpp.grandTotal.penjualan)
    );

    if (isMutasiEmpty) {
      const prevPath = path.join(__dirname, '../../data_register_lpp_prev.json');
      if (fs.existsSync(prevPath)) {
        try {
          const prevLpp = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
          if (prevLpp && prevLpp.grandTotal) {
            regLpp = prevLpp;
          }
        } catch (_) {}
      }
    }

    if (!regLpp || !regLpp.grandTotal) return data;

    const gt = regLpp.grandTotal;
    const parseNum = (val) => {
      if (!val) return 0;
      return parseInt(String(val).replace(/,/g, '').trim(), 10) || 0;
    };

    const saldoAwal = parseNum(gt.saldoAwal?.rp);
    const saldoAkhir = parseNum(gt.saldoAkhir?.rp);

    data.periode = regLpp.periode || data.periode;
    data.lpp01 = {
      ...data.lpp01,
      saldoAkhirSebelumME: data.lpp01.saldoAkhirSebelumME || saldoAkhir || saldoAwal,
      saldoAwalBulanME: data.lpp01.saldoAwalBulanME || saldoAkhir || saldoAwal,
      pembelianMurni: parseNum(gt.pembelianMurni || gt.murni),
      pembelianBonus: parseNum(gt.pembelianBonus || gt.bonus),
      transferIn: parseNum(gt.transferIn),
      returPenjualan: parseNum(gt.returPenjualan),
      repack: parseNum(gt.repackIn),
      penerimaanLain: parseNum(gt.penerimaanLain),
      penjualan: parseNum(gt.penjualan),
      transferOut: parseNum(gt.transferOut),
      prepack: parseNum(gt.repackOut),
      hilang: parseNum(gt.hilang),
      pengeluaranLain: parseNum(gt.pengeluaranLain),
      so: parseNum(gt.so),
      intransit: parseNum(gt.intransit || 0),
      penyesuaian: parseNum(gt.penyesuaian),
      koreksi: parseNum(gt.koreksi),
      saldoAkhirBulanME: saldoAkhir
    };

    // Auto-update saldo awal & akhir pada antarLpp jika belum diisi manual
    if (data.lpp01.saldoAkhirSebelumME) {
      data.pembanding.saldoAwalBulanME = data.lpp01.saldoAkhirSebelumME;
      data.pembanding.saldoAkhirSebelumME = data.lpp01.saldoAkhirSebelumME;
      data.antarLpp.lpp01_prev = data.lpp01.saldoAkhirSebelumME;
      data.antarLpp.lpp01_me_awal = data.lpp01.saldoAkhirSebelumME;
    }
    if (saldoAkhir) {
      data.antarLpp.lpp01_me_akhir = saldoAkhir;
      data.antarLpp.lpp01_next_awal = saldoAkhir;
    }

    const kPath = this.getKroscekFilePath();
    fs.writeFileSync(kPath, JSON.stringify(data, null, 2));
    addLog('success', `[IAS] 🔄 Sinkronisasi nilai Grand Total LPP 01 ke Template Kroscek berhasil (Saldo Awal: Rp ${saldoAwal.toLocaleString('id-ID')}, Saldo Akhir: Rp ${saldoAkhir.toLocaleString('id-ID')})`);

    return data;
  }

  async fetchLppBulanSebelumnya(opts = {}) {
    const p1 = opts.periode1 || '01/09/2026';
    const reqMenu = opts.menu || 'ALL';

    // Parse DD/MM/YYYY
    const parts = p1.split('/');
    const day = parseInt(parts[0] || '1', 10);
    const month = parseInt(parts[1] || '9', 10);
    const year = parseInt(parts[2] || '2026', 10);

    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    const lastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevP1 = `01/${String(prevMonth).padStart(2, '0')}/${prevYear}`;
    const prevP2 = `${String(lastDay).padStart(2, '0')}/${String(prevMonth).padStart(2, '0')}/${prevYear}`;

    const menusToFetch = reqMenu === 'ALL' ? ['LPP01', 'LPP08', 'LPP10'] : [reqMenu];
    const results = {};

    addLog('info', `[IAS] 📅 Mengambil data LPP Bulan Sebelumnya (${menusToFetch.join(', ')}, Periode: ${prevP1} s/d ${prevP2})...`);

    for (const m of menusToFetch) {
      const res = await this.fetchAndParseRegisterLPP({
        menu: m,
        export_type: 'pdf',
        periode1: prevP1,
        periode2: prevP2,
        tipe: '3',
        isPrevMonth: true
      });

      const gt = res.grandTotal;
      const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
      const saldoAkhirPrev = parseNum(gt?.saldoAkhir?.rp || gt?.saldoAkhir);

      const kData = this.getKroscekData();
      if (m === 'LPP08') {
        kData.antarLpp.lpp02_prev = saldoAkhirPrev;
        results.lpp02 = saldoAkhirPrev;
        addLog('success', `[IAS] ✅ Saldo Akhir LPP 02 (Retur) Bulan Sebelumnya (${prevP2}) berhasil diperoleh: Rp ${saldoAkhirPrev.toLocaleString('id-ID')}`);
      } else if (m === 'LPP10') {
        kData.antarLpp.lpp03_prev = saldoAkhirPrev;
        results.lpp03 = saldoAkhirPrev;
        addLog('success', `[IAS] ✅ Saldo Akhir LPP 03 (Rusak) Bulan Sebelumnya (${prevP2}) berhasil diperoleh: Rp ${saldoAkhirPrev.toLocaleString('id-ID')}`);
      } else {
        kData.lpp01.saldoAkhirSebelumME = saldoAkhirPrev;
        kData.pembanding.saldoAkhirSebelumME = saldoAkhirPrev;
        kData.pembanding.saldoAwalBulanME = saldoAkhirPrev; // Saldo Akhir bln lalu adalah pembanding Saldo Awal bln ini
        kData.antarLpp.lpp01_prev = saldoAkhirPrev;
        if (kData.lpp01.saldoAwalBulanME) {
          kData.antarLpp.lpp01_me_awal = kData.lpp01.saldoAwalBulanME;
        }
        results.lpp01 = saldoAkhirPrev;
        addLog('success', `[IAS] ✅ Saldo Akhir LPP 01 (Baik) Bulan Sebelumnya (${prevP2}) berhasil diperoleh: Rp ${saldoAkhirPrev.toLocaleString('id-ID')}`);
      }
      this.saveKroscekData(kData);
    }

    const finalKData = this.getKroscekData();

    return {
      success: true,
      prevPeriode: `${prevP1} s/d ${prevP2}`,
      results,
      saldoAkhirRp: (results.lpp01 !== undefined ? results.lpp01 : 0).toLocaleString('id-ID'),
      saldoAkhirNum: results.lpp01 || 0,
      kroscekData: finalKData
    };
  }

  /**
   * Mengambil Saldo Awal LPP 01, LPP 02, dan LPP 03 Bulan Baru (Setelah ME)
   * Misal bulan ME = September (09/2026), maka bulan baru = Oktober (01/10/2026)
   */
  async fetchLppBulanBerikutnya(opts = {}) {
    const p1 = opts.periode1 || '01/09/2026';
    const reqMenu = opts.menu || 'ALL';

    // Parse DD/MM/YYYY
    const parts = p1.split('/');
    const day = parseInt(parts[0] || '1', 10);
    const month = parseInt(parts[1] || '9', 10);
    const year = parseInt(parts[2] || '2026', 10);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear = year + 1;
    }

    const nextP1 = `01/${String(nextMonth).padStart(2, '0')}/${nextYear}`;
    const nextP2 = `01/${String(nextMonth).padStart(2, '0')}/${nextYear}`;

    const menusToFetch = reqMenu === 'ALL' ? ['LPP01', 'LPP08', 'LPP10'] : [reqMenu];
    const results = {};
    let anyDataFound = false;

    addLog('info', `[IAS] 📅 Mengambil Saldo Awal LPP Bulan Baru Setelah ME (${menusToFetch.join(', ')}, Periode: ${nextP1} s/d ${nextP2})...`);

    for (const m of menusToFetch) {
      const res = await this.fetchAndParseRegisterLPP({
        menu: m,
        export_type: 'pdf',
        periode1: nextP1,
        periode2: nextP2,
        tipe: '3',
        isNextMonth: true
      });

      const gt = res.grandTotal;
      const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
      const saldoAwalNext = parseNum(gt?.saldoAwal?.rp || gt?.saldoAwal);

      if (gt) anyDataFound = true;

      const kData = this.getKroscekData();
      if (m === 'LPP08') {
        kData.antarLpp.lpp02_next_awal = saldoAwalNext;
        results.lpp02 = saldoAwalNext;
        addLog('success', `[IAS] ✅ Saldo Awal LPP 02 (Retur) Bulan Baru (${nextP1}): Rp ${saldoAwalNext.toLocaleString('id-ID')}`);
      } else if (m === 'LPP10') {
        kData.antarLpp.lpp03_next_awal = saldoAwalNext;
        results.lpp03 = saldoAwalNext;
        addLog('success', `[IAS] ✅ Saldo Awal LPP 03 (Rusak) Bulan Baru (${nextP1}): Rp ${saldoAwalNext.toLocaleString('id-ID')}`);
      } else {
        kData.antarLpp.lpp01_next_awal = saldoAwalNext;
        results.lpp01 = saldoAwalNext;
        addLog('success', `[IAS] ✅ Saldo Awal LPP 01 (Baik) Bulan Baru (${nextP1}): Rp ${saldoAwalNext.toLocaleString('id-ID')}`);
      }
      this.saveKroscekData(kData);
    }

    const finalKData = this.getKroscekData();

    return {
      success: true,
      nextPeriode: `${nextP1} s/d ${nextP2}`,
      anyDataFound,
      results,
      kroscekData: finalKData
    };
  }

  /**
   * Mengambil data LPP 02 (Barang Retur / menu=LPP08)
   */
  async fetchLpp02(opts = {}) {
    const config = this.getConfig();
    const p1 = opts.periode1 || config.periode1 || '01/09/2026';
    const p2 = opts.periode2 || config.periode2 || '30/09/2026';

    addLog('info', `[IAS] 📑 Mengambil data LPP 02 (Retur / LPP08, Periode: ${p1} s/d ${p2})...`);

    const result = await this.fetchAndParseRegisterLPP({
      ...opts,
      menu: 'LPP08',
      periode1: p1,
      periode2: p2,
      export_type: 'pdf',
      tipe: opts.tipe || '3'
    });

    const gt = result.grandTotal;
    const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
    const saldoAwalNum = parseNum(gt?.saldoAwal?.rp || gt?.saldoAwal);
    const saldoAkhirNum = parseNum(gt?.saldoAkhir?.rp || gt?.saldoAkhir);
    const pBaik02 = parseNum(gt?.penerimaanBaik);

    const kData = this.getKroscekData();
    kData.antarLpp.lpp02_me_awal = saldoAwalNum;
    kData.antarLpp.lpp02_me_akhir = saldoAkhirNum;
    kData.lpp02_penerimaanBaik = pBaik02;
    const pBaik03 = parseNum(kData.lpp03_penerimaanBaik || 0);
    kData.pembanding.pengeluaranLain = pBaik02 + pBaik03; // BA Retur IDM di-0-kan
    this.saveKroscekData(kData);

    addLog('success', `[IAS] ✅ Data LPP 02 (LPP08) berhasil ditarik: Saldo Awal = Rp ${saldoAwalNum.toLocaleString('id-ID')}, Saldo Akhir = Rp ${saldoAkhirNum.toLocaleString('id-ID')}, Penerimaan Baik = Rp ${pBaik02.toLocaleString('id-ID')}. Nilai LAIN2 (Pengeluaran) Pembanding otomatis diisi Rp ${kData.pembanding.pengeluaranLain.toLocaleString('id-ID')}`);

    return {
      success: true,
      lpp: 'LPP02',
      menu: 'LPP08',
      periode: `${p1} s/d ${p2}`,
      saldoAwalNum,
      saldoAkhirNum,
      grandTotal: gt,
      kroscekData: kData
    };
  }

  /**
   * Mengambil data LPP 03 (Barang Rusak / menu=LPP10)
   */
  async fetchLpp03(opts = {}) {
    const config = this.getConfig();
    const p1 = opts.periode1 || config.periode1 || '01/09/2026';
    const p2 = opts.periode2 || config.periode2 || '30/09/2026';

    addLog('info', `[IAS] 📑 Mengambil data LPP 03 (Rusak / LPP10, Periode: ${p1} s/d ${p2})...`);

    const result = await this.fetchAndParseRegisterLPP({
      ...opts,
      menu: 'LPP10',
      periode1: p1,
      periode2: p2,
      export_type: 'pdf',
      tipe: opts.tipe || '3'
    });

    const gt = result.grandTotal;
    const parseNum = (v) => parseInt(String(v || '0').replace(/,/g, '').trim(), 10) || 0;
    const saldoAwalNum = parseNum(gt?.saldoAwal?.rp || gt?.saldoAwal);
    const saldoAkhirNum = parseNum(gt?.saldoAkhir?.rp || gt?.saldoAkhir);
    const pBaik03 = parseNum(gt?.penerimaanBaik);

    const kData = this.getKroscekData();
    kData.antarLpp.lpp03_me_awal = saldoAwalNum;
    kData.antarLpp.lpp03_me_akhir = saldoAkhirNum;
    kData.lpp03_penerimaanBaik = pBaik03;
    const pBaik02 = parseNum(kData.lpp02_penerimaanBaik || 0);
    kData.pembanding.pengeluaranLain = pBaik02 + pBaik03; // BA Retur IDM di-0-kan
    this.saveKroscekData(kData);

    addLog('success', `[IAS] ✅ Data LPP 03 (LPP10) berhasil ditarik: Saldo Awal = Rp ${saldoAwalNum.toLocaleString('id-ID')}, Saldo Akhir = Rp ${saldoAkhirNum.toLocaleString('id-ID')}, Penerimaan Baik = Rp ${pBaik03.toLocaleString('id-ID')}. Nilai LAIN2 (Pengeluaran) Pembanding otomatis diisi Rp ${kData.pembanding.pengeluaranLain.toLocaleString('id-ID')}`);

    return {
      success: true,
      lpp: 'LPP03',
      menu: 'LPP10',
      periode: `${p1} s/d ${p2}`,
      saldoAwalNum,
      saldoAkhirNum,
      grandTotal: gt,
      kroscekData: kData
    };
  }

  async fetchAndParseDaftarPembelian(opts = {}) {
    const config = this.getConfig();
    const tgl1 = opts.tgl1 || config.periode1 || '01/09/2026';
    const tgl2 = opts.tgl2 || config.periode2 || tgl1;

    addLog('info', `[IAS] 🛍️ Mengambil Laporan Daftar Pembelian (Periode: ${tgl1} s/d ${tgl2})...`);

    const session = await this.getOrCreateSession();
    const page = session.page;

    const baseUrl = (config.baseUrl || process.env.IAS_BASE_URL || 'http://172.31.146.190').replace(/\/$/, '');
    const url = `${baseUrl}/bo/laporan/daftar-pembelian/cetak?tipe=1&tgl1=${tgl1}&tgl2=${tgl2}&div1=&div2=&dep1=&dep2=&kat1=&kat2=&sup1=&sup2=&mtr=&sort=1`;

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      const html = await page.content();

      let gross = 0;
      let potongan = 0;
      let disc4 = 0;
      let ppn = 0;
      let ppnBebas = 0;
      let ppnDtp = 0;
      let totalNilai = 0;
      let pembelianMurni = 0;

      if (html.includes('TIDAK ADA DATA')) {
        addLog('info', `[IAS] ℹ️ Laporan Daftar Pembelian (${tgl1} s/d ${tgl2}): TIDAK ADA DATA. Nilai dihitung 0.`);
      } else {
        const match = html.match(/<tr[^>]*>(?:(?!<tr)[\s\S])*?TOTAL\s+SELURUHNYA[\s\S]*?<\/tr>/i);
        if (match) {
          const rowHtml = match[0];
          const cells = [];
          const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
          let m;
          while ((m = cellRegex.exec(rowHtml)) !== null) {
            cells.push(m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' '));
          }

          const parseVal = (str) => {
            if (!str) return 0;
            return parseFloat(String(str).replace(/,/g, '').trim()) || 0;
          };

          if (cells.length >= 8) {
            gross = parseVal(cells[1]);
            potongan = parseVal(cells[2]);
            disc4 = parseVal(cells[3]);
            ppn = parseVal(cells[4]);
            ppnBebas = parseVal(cells[5]);
            ppnDtp = parseVal(cells[6]);
            totalNilai = parseVal(cells[7]);
            pembelianMurni = Math.round(gross - potongan + disc4);
          }
        }
      }

      // Update ke file kroscek data
      const kData = this.getKroscekData();
      kData.pembanding.pembelianMurni = pembelianMurni;
      this.saveKroscekData(kData);

      addLog('success', `[IAS] ✅ [DAFTAR PEMBELIAN] Gross: Rp ${gross.toLocaleString('id-ID')} | Potongan: Rp ${potongan.toLocaleString('id-ID')} | Disc4: Rp ${disc4.toLocaleString('id-ID')} => Pembelian Murni: Rp ${pembelianMurni.toLocaleString('id-ID')}`);

      return {
        success: true,
        periode: `${tgl1} s/d ${tgl2}`,
        gross,
        potongan,
        disc4,
        ppn,
        ppnBebas,
        ppnDtp,
        totalNilai,
        pembelianMurni,
        kroscekData: kData
      };
    } finally {
      // Browser tetap aktif di persistentSession untuk aksi selanjutnya
    }
  }

  /**
   * Mengambil Laporan Penjualan (HPP Rata-rata) dari portal Web IAS / FO
   * URL: /fo/laporan-kasir/penjualan/printdocumentmenu2?date1=...&date2=...&grosira=T&export=T&export_type=pdf&lst_print=INDOGROSIR%20ALL%20[IGR%20+%20(OMI/IDM)]
   */
  async fetchAndParseLaporanPenjualan(opts = {}) {
    const config = this.getConfig();
    const rawP1 = opts.date1 || opts.periode1 || config.periode1 || '01/09/2026';
    const rawP2 = opts.date2 || opts.periode2 || config.periode2 || '30/09/2026';
    const date1 = rawP1.replace(/\//g, '-');
    const date2 = rawP2.replace(/\//g, '-');

    addLog('info', `[IAS] 📈 Mengambil Laporan Penjualan HPP Rata-rata (Periode: ${date1} s/d ${date2})...`);

    const session = await this.getOrCreateSession();
    const page = session.page;
    const baseUrl = (config.baseUrl || 'http://172.31.146.190').replace(/\/$/, '');

    const url = `${baseUrl}/fo/laporan-kasir/penjualan/printdocumentmenu2?date1=${date1}&date2=${date2}&grosira=T&export=T&export_type=pdf&lst_print=INDOGROSIR%20ALL%20[IGR%20+%20(OMI/IDM)]`;

    let pdfBuffer = null;

    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 45000 }).catch(() => null),
        page.goto(url, { timeout: 60000 }).catch(() => {})
      ]);

      if (download) {
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        pdfBuffer = Buffer.concat(chunks);
      } else {
        throw new Error('Gagal menerima file PDF Laporan Penjualan dari server.');
      }

      // Parse PDF Buffer
      const str = pdfBuffer.toString('latin1');
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let sm;
      let textStream = '';

      while ((sm = streamRegex.exec(str)) !== null) {
        try {
          const uncomp = zlib.inflateSync(Buffer.from(sm[1], 'latin1')).toString('latin1');
          if (uncomp.includes('H.P.P RATA2') || uncomp.includes('GRAND TOTAL')) {
            textStream = uncomp;
            break;
          }
        } catch (_) {}
      }

      if (!textStream) {
        throw new Error('Tidak dapat menemukan data tabel dalam dokumen PDF Penjualan.');
      }

      // Parse text blocks with coordinates
      const blocks = [];
      const btRegex = /BT([\s\S]*?)ET/g;
      let bm;
      while ((bm = btRegex.exec(textStream)) !== null) {
        const block = bm[1];
        const tdMatch = block.match(/([\d.]+)\s+([\d.]+)\s+Td/);
        const x = tdMatch ? parseFloat(tdMatch[1]) : 0;
        const y = tdMatch ? parseFloat(tdMatch[2]) : 0;
        
        const tjMatch = block.match(/\[\s*([\s\S]*?)\s*\]\s*TJ/);
        let text = '';
        if (tjMatch) {
          const parts = tjMatch[1].match(/\(([^)]*)\)/g) || [];
          text = parts.map(p => p.slice(1, -1)).join('');
        } else {
          const singleMatch = block.match(/\(([^)]*)\)\s*Tj/);
          if (singleMatch) text = singleMatch[1];
        }
        if (text) {
          blocks.push({ x, y, text: text.trim() });
        }
      }

      const rows = {};
      blocks.forEach(b => {
        const yKey = Math.round(b.y);
        if (!rows[yKey]) rows[yKey] = [];
        rows[yKey].push(b);
      });

      const sortedY = Object.keys(rows).map(Number).sort((a,b) => a - b);
      let grandTotalRow = null;
      for (const y of sortedY) {
        const rowItems = rows[y].sort((a,b) => a.x - b.x);
        const lineText = rowItems.map(i => i.text).join(' ');
        if (lineText.includes('GRAND TOTAL')) {
          grandTotalRow = rowItems;
          break;
        }
      }

      if (!grandTotalRow) {
        throw new Error('Baris GRAND TOTAL tidak ditemukan dalam laporan penjualan.');
      }

      const parseNum = (s) => parseInt(String(s || '0').replace(/,/g, ''), 10) || 0;
      const numItems = grandTotalRow.filter(i => /^[\d,]+(\.\d+)?$/.test(i.text.replace(/[()]/g, '')));

      const penjualanKotor = parseNum(numItems[0]?.text);
      const ppn = parseNum(numItems[1]?.text);
      const bebasPpn = parseNum(numItems[2]?.text);
      const ppnDtp = parseNum(numItems[3]?.text);
      const penjualanBersih = parseNum(numItems[4]?.text);
      const hppRata2 = parseNum(numItems[5]?.text);
      const marginRp = parseNum(numItems[6]?.text);

      // Update ke file kroscek data (Baris PENJUALAN)
      const kData = this.getKroscekData();
      kData.pembanding.penjualan = hppRata2;
      this.saveKroscekData(kData);

      addLog('success', `[IAS] ✅ [LAPORAN PENJUALAN] HPP Rata2: Rp ${hppRata2.toLocaleString('id-ID')} | Penjualan Bersih: Rp ${penjualanBersih.toLocaleString('id-ID')} (Periode: ${date1} s/d ${date2}) berhasil dimasukkan ke kolom Pembanding Penjualan!`);

      return {
        success: true,
        periode: `${date1} s/d ${date2}`,
        penjualanKotor,
        ppn,
        bebasPpn,
        ppnDtp,
        penjualanBersih,
        hppRata2,
        marginRp,
        kroscekData: kData
      };
    } catch (err) {
      addLog('error', `[IAS] ❌ [LAPORAN PENJUALAN] Gagal mengambil: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new IasAutomationService();



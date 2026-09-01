const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { addIasLog: addLog } = require('../utils/logger');

class IasAutomationService {
  constructor() {
    this.configFile = path.join(__dirname, '../../config.json');
    this.routesFile = path.join(__dirname, '../../ias_all_routes.json');
    this.activeTask = null; // tracking running task
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
    return this.sessionState;
  }

  /**
   * Auto-connect / login in background when opening the menu
   */
  async autoConnectInBackground(customConfig = null) {
    // If already connected within the last 5 minutes, return current session
    if (this.sessionState.isConnected && this.sessionState.lastConnectedTimestamp && (Date.now() - this.sessionState.lastConnectedTimestamp < 5 * 60 * 1000)) {
      return {
        success: true,
        alreadyConnected: true,
        session: this.sessionState
      };
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.sessionState.status = 'CONNECTING';
    addLog('info', `[IAS] 🌐 Menjalankan auto-login Web IAS di latar belakang...`);

    this.connectionPromise = (async () => {
      let session = null;
      try {
        session = await this.createSession(customConfig);
        const currentUrl = session.page.url();
        const config = session.config;

        this.sessionState = {
          isConnected: true,
          status: 'CONNECTED',
          lastConnected: new Date().toLocaleTimeString('id-ID'),
          lastConnectedTimestamp: Date.now(),
          user: config.username,
          koneksi: (config.koneksi || '').toUpperCase(),
          url: currentUrl
        };

        addLog('success', `[IAS] ✅ Auto-Login Latar Belakang BERHASIL! (User: ${config.username}, Koneksi: ${this.sessionState.koneksi})`);

        // Fetch live tasks status using the same session
        const tasksStatus = await this.getTasksLiveStatus(customConfig, session);

        return {
          success: true,
          alreadyConnected: false,
          session: this.sessionState,
          tasks: tasksStatus
        };
      } catch (err) {
        this.sessionState = {
          isConnected: false,
          status: 'ERROR',
          lastConnected: null,
          lastConnectedTimestamp: null,
          error: err.message
        };
        addLog('error', `[IAS] ❌ Auto-Login Latar Belakang gagal: ${err.message}`);
        return {
          success: false,
          error: err.message,
          session: this.sessionState
        };
      } finally {
        if (session && session.browser) {
          await session.browser.close();
        }
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  getConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        return data.iasConfig || {
          baseUrl: 'http://172.31.146.190',
          koneksi: 'sim',
          username: 'RIS',
          password: '0' + '61201',
          branchCode: '1R',
          cabang: 'spibdl1r',
          autoResetSession: true
        };
      }
    } catch (e) {
      addLog('error', `[IAS] Gagal membaca iasConfig: ${e.message}`);
    }
    return {
      baseUrl: 'http://172.31.146.190',
      koneksi: 'sim',
      username: 'RIS',
      password: '0' + '61201',
      branchCode: '1R',
      cabang: 'spibdl1r',
      autoResetSession: true
    };
  }

  saveConfig(newConfig) {
    try {
      const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      data.iasConfig = { ...data.iasConfig, ...newConfig };
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));
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
   * Test login to Web IAS
   */
  async login(customConfig = null) {
    let session = null;
    try {
      session = await this.createSession(customConfig);
      const currentUrl = session.page.url();
      const title = await session.page.title();
      const cookies = await session.context.cookies();

      return {
        success: true,
        url: currentUrl,
        title: title,
        cookies: cookies,
        message: `Berhasil terhubung dan login ke Web IAS (${(session.config.koneksi || '').toUpperCase()} - ${session.config.username})`
      };
    } catch (err) {
      addLog('error', `[IAS] ❌ Uji login gagal: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    } finally {
      if (session && session.browser) {
        await session.browser.close();
      }
    }
  }

  /**
   * Check current live status for both Hitstok and LPP
   */
  async getTasksLiveStatus(customConfig = null, existingSession = null) {
    let session = existingSession;
    let shouldCloseSession = false;
    try {
      if (!session) {
        session = await this.createSession(customConfig);
        shouldCloseSession = true;
      }
      const { page, baseUrl } = session;

      // 1. Check Hitstok
      addLog('info', `[IAS] Mengambil status live Hitung Ulang Stock...`);
      await page.goto(`${baseUrl}/bo/proses/hitungulangstock`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const hitstokStatus = await page.evaluate(async () => {
        const p1 = $('#periode1').val();
        const p2 = $('#periode2').val();
        return new Promise((resolve) => {
          $.ajax({
            url: 'http://172.31.146.190/bo/proses/hitungulangstock/get-status',
            type: 'get',
            data: { periode1: p1, periode2: p2 },
            success: (res) => resolve({ periode1: p1, periode2: p2, ...res }),
            error: (err) => resolve({ periode1: p1, periode2: p2, status: 'ERROR', message: err.statusText })
          });
        });
      });

      // 2. Check LPP
      addLog('info', `[IAS] Mengambil status live Proses LPP...`);
      await page.goto(`${baseUrl}/bo/lpp/proses-lpp`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const lppStatus = await page.evaluate(async () => {
        const p1 = $('#periode1').val();
        const p2 = $('#periode2').val();
        return new Promise((resolve) => {
          $.ajax({
            url: 'http://172.31.146.190/bo/lpp/proses-lpp/get-status',
            type: 'get',
            data: { periode1: p1, periode2: p2 },
            success: (res) => resolve({ periode1: p1, periode2: p2, ...res }),
            error: (err) => resolve({ periode1: p1, periode2: p2, status: 'ERROR', message: err.statusText })
          });
        });
      });

      // Read last run info from config.json
      let lastHitstokRun = null;
      let lastLppRun = null;
      if (fs.existsSync(this.configFile)) {
        const cfg = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        lastHitstokRun = cfg.lastHitstokRun || null;
        lastLppRun = cfg.lastLppRun || null;
      }

      addLog('success', `[IAS] ✅ Berhasil memperbarui status Hitstok dan LPP.`);
      return {
        success: true,
        hitstok: hitstokStatus,
        lpp: lppStatus,
        lastHitstokRun,
        lastLppRun
      };

    } catch (err) {
      addLog('error', `[IAS] Gagal mengambil status tasks: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    } finally {
      if (shouldCloseSession && session && session.browser) {
        await session.browser.close();
      }
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
    const totalPasses = opts.iterations || 2;

    try {
      session = await this.createSession();
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
              url: 'http://172.31.146.190/bo/proses/hitungulangstock/proses-ulang',
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
              url: 'http://172.31.146.190/bo/proses/hitungulangstock/hitung-ulang-stock',
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
              url: 'http://172.31.146.190/bo/proses/hitungulangstock/hitung-ulang-stock-cmo',
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
                url: 'http://172.31.146.190/bo/proses/hitungulangstock/get-status',
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
                url: 'http://172.31.146.190/bo/proses/hitungulangstock/update-online-stock-spi',
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
      if (session && session.browser) {
        await session.browser.close();
      }
    }
  }

  /**
   * TASK 2: Run Proses LPP (Bulanan atau Harian)
   * Dilakukan 2 putaran (2 passes) sesuai SOP
   * @param {Object} opts { mode: 'bulanan' | 'harian', periode1, periode2, tanggalSo, khususAudit, iterations }
   */
  async runProsesLPP(opts = {}) {
    if (this.activeTask) {
      throw new Error(`Saat ini sedang berjalan tugas: ${this.activeTask}. Mohon tunggu hingga selesai.`);
    }

    this.activeTask = 'PROSES_LPP';
    let session = null;
    const totalPasses = opts.iterations || 2;

    try {
      session = await this.createSession();
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
                url: 'http://172.31.146.190/bo/lpp/proses-lpp/proses-ulang',
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
                url: 'http://172.31.146.190/bo/lpp/proses-lpp/proses',
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
                  url: 'http://172.31.146.190/bo/lpp/proses-lpp/get-status',
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
      if (session && session.browser) {
        await session.browser.close();
      }
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

      session = await this.createSession();
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

      addLog('success', `[IAS] ✅ [REGISTER LPP] Sukses mengekstrak ${categories.length} kategori, ${summaries.length} subtotal, dan Grand Total (Saldo Awal: Rp ${grandTotal?.saldoAwal?.rp || 0}, Saldo Akhir: Rp ${grandTotal?.saldoAkhir?.rp || 0})!`);

      return resultPayload;

    } catch (err) {
      addLog('error', `[IAS] ❌ [REGISTER LPP] Gagal: ${err.message}`);
      throw err;
    } finally {
      this.activeTask = null;
      if (session && session.browser) {
        await session.browser.close();
      }
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
    const regLpp = this.getLatestRegisterLPP();
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
      saldoAwalBulanME: saldoAwal,
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
      penyesuaian: parseNum(gt.penyesuaian),
      koreksi: parseNum(gt.koreksi),
      saldoAkhirBulanME: saldoAkhir
    };

    // Auto-update saldo awal & akhir pada antarLpp jika belum diisi manual
    data.antarLpp.lpp01_me_awal = saldoAwal;
    if (data.lpp01.saldoAkhirSebelumME) {
      data.pembanding.saldoAwalBulanME = data.lpp01.saldoAkhirSebelumME;
      data.pembanding.saldoAkhirSebelumME = data.lpp01.saldoAkhirSebelumME;
      data.antarLpp.lpp01_prev = data.lpp01.saldoAkhirSebelumME;
    }
    if (!data.antarLpp.lpp01_me_akhir) data.antarLpp.lpp01_me_akhir = saldoAkhir;

    const kPath = this.getKroscekFilePath();
    fs.writeFileSync(kPath, JSON.stringify(data, null, 2));
    addLog('success', `[IAS] 🔄 Sinkronisasi nilai Grand Total LPP 01 ke Template Kroscek berhasil (Saldo: Rp ${gt.saldoAwal?.rp || 0})`);

    return data;
  }

  async fetchLppBulanSebelumnya(opts = {}) {
    const p1 = opts.periode1 || '01/09/2026';
    const menu = opts.menu || 'LPP01';

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

    addLog('info', `[IAS] 📅 Mengambil LPP Bulan Sebelumnya (${menu}, Periode: ${prevP1} s/d ${prevP2})...`);

    // Fetch and parse using fetchAndParseRegisterLPP
    const res = await this.fetchAndParseRegisterLPP({
      menu,
      export_type: 'pdf',
      periode1: prevP1,
      periode2: prevP2,
      tipe: '3',
      isPrevMonth: true
    });

    const gt = res.grandTotal;
    const saldoAkhirPrev = gt && gt.saldoAkhir?.rp ? parseInt(String(gt.saldoAkhir.rp).replace(/,/g, '').trim(), 10) : 0;

    // Update kroscek data
    const kData = this.getKroscekData();
    kData.lpp01.saldoAkhirSebelumME = saldoAkhirPrev;
    kData.pembanding.saldoAkhirSebelumME = saldoAkhirPrev;
    kData.pembanding.saldoAwalBulanME = saldoAkhirPrev; // Saldo Akhir bln lalu adalah pembanding Saldo Awal bln ini
    kData.antarLpp.lpp01_prev = saldoAkhirPrev;
    if (kData.lpp01.saldoAwalBulanME) {
      kData.antarLpp.lpp01_me_awal = kData.lpp01.saldoAwalBulanME;
    }
    this.saveKroscekData(kData);

    addLog('success', `[IAS] ✅ Saldo Akhir LPP Bulan Sebelumnya (${prevP2}) berhasil diperoleh: Rp ${gt?.saldoAkhir?.rp || 0}`);

    return {
      success: true,
      prevPeriode: `${prevP1} s/d ${prevP2}`,
      saldoAkhirRp: gt?.saldoAkhir?.rp || '0',
      saldoAkhirNum: saldoAkhirPrev,
      kroscekData: kData
    };
  }
}

module.exports = new IasAutomationService();



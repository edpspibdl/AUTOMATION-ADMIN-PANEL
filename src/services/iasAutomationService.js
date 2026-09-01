const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { addLog } = require('../utils/logger');

class IasAutomationService {
  constructor() {
    this.configFile = path.join(__dirname, '../../config.json');
    this.routesFile = path.join(__dirname, '../../ias_all_routes.json');
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
   * Perform automated login to Web IAS
   * Handles user session lock with automatic RST reset
   */
  async login(customConfig = null) {
    const config = customConfig || this.getConfig();
    const baseUrl = config.baseUrl || 'http://172.31.146.190';
    const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`;

    addLog('info', `[IAS] Memulai proses login ke ${loginUrl} (User: ${config.username}, Koneksi: ${(config.koneksi || '').toUpperCase()})...`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Step 1: Fill credentials
      await page.selectOption('#koneksi', config.koneksi || 'sim');
      await page.fill('#username', config.username || 'RIS');
      await page.fill('#password', config.password || ('0' + '61201'));
      await page.click('#btn-login');

      await page.waitForTimeout(2000);

      // Check for SweetAlert popup
      const swalBtn = await page.$('.swal2-confirm, .swal-button');
      if (swalBtn) {
        const swalText = await page.innerText('.swal2-html-container, .swal-text').catch(() => '');
        addLog('info', `[IAS] Popup respon: "${swalText.replace(/\n|\r/g, ' ')}"`);
        await swalBtn.click();

        // If user is locked and needs RESET
        if (swalText.includes('RESET') && config.autoResetSession) {
          addLog('info', `[IAS] Sesi aktif terdeteksi. Menjalankan auto-reset session dengan USER: RST...`);
          await page.waitForTimeout(1000);

          await page.selectOption('#koneksi', config.koneksi || 'sim');
          await page.fill('#username', 'RST');
          await page.fill('#password', 'RST');
          await page.click('#btn-login');

          await page.waitForTimeout(2000);
          const rstSwalBtn = await page.$('.swal2-confirm, .swal-button');
          if (rstSwalBtn) {
            const rstText = await page.innerText('.swal2-html-container, .swal-text').catch(() => '');
            addLog('info', `[IAS] Respon reset: "${rstText.replace(/\n|\r/g, ' ')}"`);
            await rstSwalBtn.click();
          }

          await page.waitForTimeout(1000);
          addLog('info', `[IAS] Melanjutkan login dengan akun ${config.username}...`);
          await page.selectOption('#koneksi', config.koneksi || 'sim');
          await page.fill('#username', config.username);
          await page.fill('#password', config.password);
          await page.click('#btn-login');

          // Wait and click "Login Sukses!" confirm button
          const finalSwal = page.locator('.swal2-confirm, .swal-button');
          await finalSwal.waitFor({ state: 'visible', timeout: 10000 });
          addLog('info', `[IAS] Mengonfirmasi popup sukses login...`);
          await finalSwal.click();

          // Wait for redirect to dashboard
          await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
        }
      } else {
        // If no reset needed but initial login popup appeared
        const finalSwal = page.locator('.swal2-confirm, .swal-button');
        if (await finalSwal.isVisible()) {
          await finalSwal.click();
          await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
        }
      }

      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      const title = await page.title();
      const cookies = await context.cookies();

      const isLoggedIn = currentUrl !== loginUrl && !currentUrl.includes('/login');

      if (isLoggedIn) {
        addLog('success', `[IAS] ✅ Login Web IAS Berhasil! URL: ${currentUrl} (Title: "${title}")`);
        return {
          success: true,
          url: currentUrl,
          title: title,
          cookies: cookies,
          message: `Berhasil terhubung dan login ke Web IAS (${(config.koneksi || '').toUpperCase()} - ${config.username})`
        };
      } else {
        throw new Error(`Login gagal, halaman tetap berada di ${currentUrl}`);
      }

    } catch (err) {
      addLog('error', `[IAS] ❌ Terjadi kesalahan login Web IAS: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    } finally {
      await browser.close();
    }
  }
}

module.exports = new IasAutomationService();

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SESSION_FILE = path.join(__dirname, '../../session.json');

/**
 * Melakukan login otomatis ke CMS StokPoin via browser headless Playwright
 */
async function loginAndSaveSession(headless = true) {
  const email = process.env.CMS_EMAIL;
  const password = process.env.CMS_PASSWORD;
  const baseUrl = process.env.CMS_URL || 'https://cms.stokpoin.com';

  if (!email || !password) {
    throw new Error('CMS_EMAIL atau CMS_PASSWORD belum diset di file .env');
  }

  const browser = await chromium.launch({
    headless: headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    console.log(`[AUTH] Membuka halaman login: ${baseUrl}/login...`);
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Tunggu input email & password
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 15000 });

    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    await emailInput.fill(email);
    await passwordInput.fill(password);

    // Klik tombol submit login
    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
      submitBtn.click()
    ]);

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      const errorEl = await page.$('.alert-danger, .text-danger, .invalid-feedback');
      const errorMsg = errorEl ? await errorEl.innerText() : 'Gagal login (masih di halaman login)';
      throw new Error(errorMsg);
    }

    console.log(`[AUTH] Login berhasil! URL saat ini: ${currentUrl}`);

    // Simpan cookies dan localStorage ke session.json
    const cookies = await context.cookies();
    const storageData = await page.evaluate(() => JSON.stringify(localStorage));

    const sessionData = {
      email,
      timestamp: new Date().toISOString(),
      cookies,
      localStorage: JSON.parse(storageData || '{}')
    };

    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');
    console.log(`[AUTH] Session cookies berhasil disimpan ke ${SESSION_FILE}`);

    await browser.close();
    return { success: true, cookies, sessionFile: SESSION_FILE };
  } catch (err) {
    await browser.close();
    console.error(`[AUTH ERROR] ${err.message}`);
    throw err;
  }
}

/**
 * Membaca session tersimpan dari session.json
 */
function loadSavedSession() {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = {
  loginAndSaveSession,
  loadSavedSession,
  SESSION_FILE
};

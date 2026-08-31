require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');

const EMAIL = process.env.CMS_EMAIL;
const PASSWORD = process.env.CMS_PASSWORD;
const LOGIN_URL = process.env.CMS_URL || 'https://cms.stokpoin.com/login';
const SESSION_PATH = path.join(__dirname, 'session.json');

async function loginAndSaveSession(headless = false) {
  console.log(`🚀 Memulai browser untuk proses login (Headless: ${headless})...`);
  
  const browser = await chromium.launch({
    headless: headless,
    slowMo: headless ? 0 : 50
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`🌐 Membuka URL: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Tunggu elemen form terlihat
    console.log('📝 Mengisi data kredensial...');
    
    // Selector untuk input email / username
    const emailSelector = "input[type='email'], input[name='email'], input[name='username'], input[placeholder*='Email'], input[placeholder*='Username'], input[type='text']";
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.fill(emailSelector, EMAIL);

    // Selector untuk input password
    const passwordSelector = "input[type='password'], input[name='password'], input[placeholder*='Password'], input[placeholder*='Kata Sandi']";
    await page.waitForSelector(passwordSelector, { timeout: 10000 });
    await page.fill(passwordSelector, PASSWORD);

    // Klik tombol submit/login
    console.log('🔘 Mengklik tombol login/masuk...');
    const buttonSelector = "button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Masuk'), button:has-text('Sign In')";
    await page.click(buttonSelector);

    // Menunggu navigasi atau respon setelah login
    console.log('⏳ Menunggu verifikasi login...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log(`📌 URL saat ini: ${currentUrl}`);
    console.log(`📌 Judul Halaman: ${pageTitle}`);

    // Simpan storage state (Cookies & LocalStorage)
    await context.storageState({ path: SESSION_PATH });
    console.log(`✅ Login berhasil! Sesi tersimpan di: ${SESSION_PATH}`);

    // Ambil screenshot sebagai bukti berhasil jika tidak headless
    if (!headless) {
      await page.screenshot({ path: 'login_success.png', fullPage: true });
      console.log('📸 Screenshot tersimpan: login_success.png');
    }

    return true;
  } catch (error) {
    console.error('❌ Terjadi kesalahan saat login:', error.message);
    try {
      await page.screenshot({ path: 'login_error.png' });
    } catch (_) {}
    return false;
  } finally {
    console.log('🔒 Menutup browser...');
    await browser.close();
  }
}

if (require.main === module) {
  loginAndSaveSession(false);
}

module.exports = {
  loginAndSaveSession
};


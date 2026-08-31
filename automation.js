const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SESSION_PATH = path.join(__dirname, 'session.json');

async function runAutomation() {
  if (!fs.existsSync(SESSION_PATH)) {
    console.error('❌ File session.json belum ditemukan. Silakan jalankan `npm run login` terlebih dahulu.');
    return;
  }

  console.log('🚀 Membuka browser dengan sesi yang tersimpan...');
  
  const browser = await chromium.launch({
    headless: false // Ubah ke true jika ingin berjalan di background
  });

  // Muat context dengan sesi tersimpan
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    console.log('🌐 Membuka halaman utama CMS...');
    await page.goto('https://cms.stokpoin.com/', { waitUntil: 'networkidle' });

    console.log('✅ Berhasil masuk ke CMS tanpa perlu memasukkan password lagi.');

    // ----------------------------------------------------
    // Tambahkan logika / tugas otomatisasi Anda di sini:
    // Contoh:
    // await page.click('#menu-laporan');
    // await page.waitForSelector('.table-data');
    // ----------------------------------------------------

    // Ambil screenshot halaman dashboard
    await page.screenshot({ path: 'dashboard.png' });
    console.log('📸 Screenshot tersimpan: dashboard.png');

    // Menunggu beberapa detik sebelum selesai
    await page.waitForTimeout(3000);

  } catch (error) {
    console.error('❌ Terjadi kesalahan pada otomatisasi:', error.message);
  } finally {
    console.log('🔒 Menutup browser...');
    await browser.close();
  }
}

runAutomation();

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { loginAndSaveSession } = require('./login');

const SESSION_PATH = path.join(__dirname, 'session.json');

/**
 * Memastikan sesi selalu aktif.
 * Jika sesi tidak ada atau sudah expired, otomatis login ulang di background (headless) tanpa intervensi manual!
 */
async function ensureValidSession() {
  let needLogin = false;

  if (!fs.existsSync(SESSION_PATH)) {
    console.log('ℹ️ Sesi belum ada. Melakukan login otomatis...');
    needLogin = true;
  } else {
    try {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'));
      const nowSeconds = Date.now() / 1000;
      
      // Periksa apakah ada cookie session yang sudah expired (atau tinggal < 60 detik)
      const isExpired = sessionData.cookies.some(c => c.expires && c.expires <= (nowSeconds + 60));
      if (isExpired) {
        console.log('🔄 Sesi telah kedaluwarsa (expired). Melakukan refresh login otomatis...');
        needLogin = true;
      }
    } catch (e) {
      needLogin = true;
    }
  }

  if (needLogin) {
    const success = await loginAndSaveSession(true); // Headless auto-login
    if (!success) {
      throw new Error('Gagal melakukan login otomatis. Silakan periksa kredensial di file .env');
    }
  }
}

/**
 * Mendapatkan cookie session untuk pemanggilan API cepat
 */
async function getCookieString() {
  await ensureValidSession();
  const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'));
  return sessionData.cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * 1. Mode Cepat (API-based):
 * Mengambil data produk berdasarkan PLU atau kata kunci pencarian
 */
async function searchStockApi(params = {}, retry = true) {
  const cookie = await getCookieString();
  const queryParams = new URLSearchParams({
    desc: params.desc || '',
    plu: params.plu || '',
    status: params.status || ''
  });

  const url = `https://cms.stokpoin.com/stock/branch/datatables?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    },
    redirect: 'manual' // Deteksi redirect ke /login jika sesi mati di server
  });

  if (response.status === 302 || response.status === 401 || response.status === 419) {
    if (retry) {
      console.log('⚠️ Sesi tidak valid di server. Mencoba auto-login ulang...');
      await loginAndSaveSession(true);
      return searchStockApi(params, false);
    }
    throw new Error(`Session expired di server (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data || [];
}

/**
 * 2. Mode Cepat (API-based):
 * Melakukan toggle (aktifkan/nonaktifkan) berdasarkan stock ID
 */
async function toggleStockApi(stockId, retry = true) {
  const cookie = await getCookieString();
  const url = `https://cms.stokpoin.com/stock/toggle/${stockId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    },
    redirect: 'manual'
  });

  if (response.status === 302 || response.status === 401 || response.status === 419) {
    if (retry) {
      console.log('⚠️ Sesi tidak valid di server saat toggle. Melakukan auto-login ulang...');
      await loginAndSaveSession(true);
      return toggleStockApi(stockId, false);
    }
    throw new Error(`Session expired saat toggle (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`HTTP Error saat toggle ID ${stockId}: ${response.status}`);
  }

  return await response.text();
}

/**
 * Fungsi utama untuk mengubah status PLU (Aktif / Nonaktif)
 * @param {string|string[]} pluList - Satu PLU atau daftar array PLU
 * @param {'aktif'|'nonaktif'|'toggle'} targetStatus - Status yang diinginkan
 */
async function setStockStatus(pluList, targetStatus = 'nonaktif') {
  await ensureValidSession();
  const plus = Array.isArray(pluList) ? pluList : [pluList];

  console.log(`\n======================================================`);
  console.log(`🔄 Memproses ${plus.length} PLU untuk target status: [${targetStatus.toUpperCase()}]`);
  console.log(`======================================================`);

  for (const plu of plus) {
    try {
      console.log(`\n🔍 Mencari data PLU: ${plu}...`);
      const items = await searchStockApi({ plu: plu.toString().trim() });

      if (!items || items.length === 0) {
        console.log(`⚠️ PLU ${plu} tidak ditemukan di database.`);
        continue;
      }

      for (const item of items) {
        const id = item.id;
        const currentFlag = (item.flag || '').toLowerCase().trim(); // 'aktif' atau 'non aktif'
        const desc = item.long_description || item.desc || '-';
        const qty = item.qty || '0';

        console.log(`   📦 [ID: ${id}] PLU: ${item.plu} | ${desc} | QTY: ${qty} | Status Saat Ini: [${currentFlag.toUpperCase()}]`);

        // Tentukan apakah perlu di-toggle
        let needToggle = false;
        if (targetStatus === 'toggle') {
          needToggle = true;
        } else if (targetStatus === 'nonaktif') {
          needToggle = currentFlag.includes('aktif') && !currentFlag.includes('non');
        } else if (targetStatus === 'aktif') {
          needToggle = currentFlag.includes('non');
        }

        if (needToggle) {
          console.log(`   ⚡ Mengubah status ID ${id} (${item.plu}) ke ${targetStatus}...`);
          await toggleStockApi(id);
          console.log(`   ✅ BERHASIL diubah ke [${targetStatus.toUpperCase()}]`);
        } else {
          console.log(`   ⏭️ Sudah dalam status [${currentFlag.toUpperCase()}], tidak perlu diubah.`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Gagal memproses PLU ${plu}:`, err.message);
    }
  }

  console.log(`\n🎉 Selesai memproses semua PLU.`);
}

/**
 * 3. Mode Browser UI (Visual):
 * Membuka browser, mencari PLU, klik toggle dan konfirmasi SweetAlert secara visual
 */
async function toggleViaBrowser(plu) {
  await ensureValidSession();
  console.log(`🚀 Menjalankan visual browser automation untuk PLU: ${plu}...`);

  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    await page.goto('https://cms.stokpoin.com/stock', { waitUntil: 'networkidle' });

    // Isi filter PLU
    console.log(`📝 Memasukkan filter PLU: ${plu}...`);
    await page.fill('#pluIgr, [name="pluIgr"]', plu.toString());
    
    // Klik tombol Cari
    console.log('🔘 Menekan tombol Cari...');
    await page.click('#btnCari, button[type="submit"]');
    await page.waitForTimeout(2000);

    // Cari checkbox / toggle slider di tabel
    const toggleSlider = page.locator('#stockTable tbody tr .switch, #stockTable tbody tr input[type="checkbox"]').first();
    
    if (await toggleSlider.count() > 0) {
      console.log('🔘 Mengklik toggle item...');
      await toggleSlider.click();

      // Tunggu dan konfirmasi SweetAlert modal ("Ya, ...")
      console.log('⏳ Menunggu dialog konfirmasi...');
      const confirmButton = page.locator('.swal2-confirm, button:has-text("Ya"), .btn-primary');
      await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
      await confirmButton.click();

      console.log('✅ Konfirmasi SweetAlert ditekan!');
      await page.waitForTimeout(3000);

      // Ambil screenshot hasil
      await page.screenshot({ path: `toggle_${plu}.png` });
      console.log(`📸 Screenshot tersimpan: toggle_${plu}.png`);
    } else {
      console.log(`⚠️ Tidak ada baris data yang ditemukan untuk PLU: ${plu}`);
    }

  } catch (err) {
    console.error('❌ Terjadi kesalahan pada browser automation:', err.message);
  } finally {
    await browser.close();
  }
}

// -------------------------------------------------------------------------
// CLI Handler:
// Jalankan langsung script ini dari terminal dengan argumen:
// Contoh:
//   node automation_stock.js --plu 1550030 --action nonaktif
//   node automation_stock.js --plu 1550030 --action aktif
//   node automation_stock.js --plu 1550030 --mode browser
// -------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  let plu = '1550030'; // PLU contoh default dari data tadi
  let action = 'nonaktif'; // 'aktif', 'nonaktif', atau 'toggle'
  let mode = 'api'; // 'api' atau 'browser'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plu' && args[i + 1]) {
      plu = args[i + 1];
    }
    if (args[i] === '--action' && args[i + 1]) {
      action = args[i + 1].toLowerCase();
    }
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1].toLowerCase();
    }
    if (args[i] === '--list' && args[i + 1]) {
      // Multiple PLU dipisah koma, contoh: --list 1550030,0505880,1557360
      plu = args[i + 1].split(',').map(s => s.trim());
    }
    if (args[i] === '--file' && args[i + 1]) {
      // Baca daftar PLU dari file text (satu PLU per baris)
      const filePath = path.resolve(args[i + 1]);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        plu = fileContent.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        console.log(`📄 Memuat ${plu.length} PLU dari file: ${filePath}`);
      } else {
        console.error(`❌ File ${filePath} tidak ditemukan.`);
        process.exit(1);
      }
    }
  }

  if (mode === 'browser') {
    toggleViaBrowser(Array.isArray(plu) ? plu[0] : plu);
  } else {
    setStockStatus(plu, action);
  }
}

module.exports = {
  searchStockApi,
  toggleStockApi,
  setStockStatus,
  toggleViaBrowser
};

const { chromium } = require('playwright');
const path = require('path');

const SESSION_PATH = path.join(__dirname, 'session.json');

async function inspectStock() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    console.log('🔍 Mengakses https://cms.stokpoin.com/stock ...');
    await page.goto('https://cms.stokpoin.com/stock', { waitUntil: 'networkidle', timeout: 30000 });

    // Ambil screenshot halaman stock
    await page.screenshot({ path: 'stock_page.png', fullPage: true });
    console.log('📸 Screenshot tersimpan: stock_page.png');

    // Ambil info tabel dan tombol-tombol yang ada
    const pageData = await page.evaluate(() => {
      const title = document.title;
      const headers = Array.from(document.querySelectorAll('th')).map(th => th.innerText.trim());
      
      // Cari tombol, switch, checkbox, atau toggle
      const buttons = Array.from(document.querySelectorAll('button, input[type="checkbox"], .switch, .toggle, a.btn, input[type="button"]')).map(el => {
        return {
          tagName: el.tagName,
          type: el.getAttribute('type'),
          text: el.innerText ? el.innerText.trim() : '',
          className: el.className,
          id: el.id,
          name: el.getAttribute('name'),
          checked: el.checked,
          dataId: el.getAttribute('data-id') || el.getAttribute('data-item') || el.getAttribute('data-stock'),
          ariaLabel: el.getAttribute('aria-label')
        };
      });

      // Ambil beberapa baris tabel pertama
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 5).map(tr => {
        return {
          text: tr.innerText.trim().replace(/\n+/g, ' | '),
          html: tr.innerHTML.trim()
        };
      });

      // Cari input search / filter jika ada
      const searchInputs = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="cari" i], input[placeholder*="search" i], input[name*="search" i], input[name*="filter" i]')).map(inp => ({
        id: inp.id,
        name: inp.name,
        placeholder: inp.placeholder,
        className: inp.className
      }));

      return {
        title,
        headers,
        buttonCount: buttons.length,
        sampleButtons: buttons.slice(0, 15),
        sampleRows: rows,
        searchInputs
      };
    });

    console.log('--- HASIL INSPEKSI ---');
    console.log(JSON.stringify(pageData, null, 2));

  } catch (err) {
    console.error('Error saat inspeksi:', err);
  } finally {
    await browser.close();
  }
}

inspectStock();

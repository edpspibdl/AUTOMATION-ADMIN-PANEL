const { chromium } = require('playwright');
const path = require('path');

const SESSION_PATH = path.join(__dirname, 'session.json');

async function inspectToggle() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    await page.goto('https://cms.stokpoin.com/stock', { waitUntil: 'networkidle' });

    const details = await page.evaluate(() => {
      // 1. Ambil fungsi toggleStk jika ada di window
      let toggleStkCode = '';
      if (typeof window.toggleStk === 'function') {
        toggleStkCode = window.toggleStk.toString();
      }

      // 2. Ambil semua form filter / input di atas tabel
      const filterElements = Array.from(document.querySelectorAll('input, select, button')).map(el => ({
        tagName: el.tagName,
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        value: el.value,
        className: el.className
      }));

      // 3. Cek apakah menggunakan DataTables
      const isDataTable = typeof window.jQuery !== 'undefined' && typeof window.jQuery.fn.dataTable !== 'undefined';
      
      return {
        toggleStkCode,
        filterElements,
        isDataTable
      };
    });

    console.log('--- TOGGLE FUNCTION & FILTERS ---');
    console.log('toggleStk function:', details.toggleStkCode);
    console.log('Filters:', details.filterElements);
    console.log('isDataTable:', details.isDataTable);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

inspectToggle();

const { chromium } = require('playwright');
const path = require('path');

const SESSION_PATH = path.join(__dirname, 'session.json');

async function inspectDetail() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    await page.goto('https://cms.stokpoin.com/stock', { waitUntil: 'networkidle' });

    // 1. Ambil script inline di halaman
    const scriptContents = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
      const relevant = scripts.filter(s => s.includes('toggleStk') || s.includes('btnCari') || s.includes('ajax'));
      
      // Ambil elemen filter di bagian atas
      const formFilterHtml = document.querySelector('form') ? document.querySelector('form').outerHTML : 'no form';
      
      // Ambil elemen filter seperti select status, input plu, dsb
      const filterInputs = Array.from(document.querySelectorAll('.m-portlet__body input, .m-portlet__body select, .m-form input, .m-form select')).map(el => ({
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value: o.value, text: o.text })) : null
      }));

      return {
        filterInputs,
        relevantScripts: relevant
      };
    });

    console.log('--- FILTER INPUTS ---');
    console.log(JSON.stringify(scriptContents.filterInputs, null, 2));

    console.log('--- RELEVANT SCRIPTS ---');
    scriptContents.relevantScripts.forEach((s, idx) => {
      console.log(`\n=== Script #${idx+1} ===`);
      console.log(s);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

inspectDetail();

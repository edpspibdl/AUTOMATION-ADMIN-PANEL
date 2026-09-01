const fs = require('fs');
const { loginAndSaveSession, loadSavedSession, SESSION_FILE } = require('./authService');
require('dotenv').config();

const rawUrl = process.env.CMS_URL || 'https://cms.stokpoin.com';
const BASE_URL = rawUrl.replace(/\/+$/, '').replace(/\/login$/i, '');

function getCookieHeader(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * Memastikan session cookie masih valid. Jika expired, otomatis relogin di latar belakang.
 */
async function ensureValidSession(retryCount = 0) {
  let session = loadSavedSession();
  if (!session || !session.cookies || session.cookies.length === 0) {
    console.log('[STOCK SERVICE] Session belum ada. Melakukan login awal...');
    await loginAndSaveSession(true);
    session = loadSavedSession();
  }

  const cookieHeader = getCookieHeader(session.cookies);

  try {
    const res = await fetch(`${BASE_URL}/stock`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      redirect: 'manual'
    });

    // Jika 302 / 401 / 419 / 0 (opaque redirect) -> session sudah expired
    if (res.status === 302 || res.status === 401 || res.status === 419 || res.status === 0) {
      if (retryCount >= 2) throw new Error('Gagal relogin ke CMS setelah 2 percobaan.');
      console.log(`[STOCK SERVICE] Session expired (status: ${res.status}). Relogin otomatis...`);
      await loginAndSaveSession(true);
      return await ensureValidSession(retryCount + 1);
    }

    return session;
  } catch (err) {
    if (retryCount < 2) {
      console.log(`[STOCK SERVICE] Relogin ulang karena network error/expired: ${err.message}`);
      await loginAndSaveSession(true);
      return await ensureValidSession(retryCount + 1);
    }
    throw err;
  }
}

/**
 * Mencari data stock berdasarkan PLU di CMS StokPoin DataTables API
 */
async function searchStockApi({ desc = '', plu = '', status = '' }, retryCount = 0) {
  const session = await ensureValidSession();
  const cookieHeader = getCookieHeader(session.cookies);

  const url = `${BASE_URL}/stock/branch/datatables?desc=${encodeURIComponent(desc)}&plu=${encodeURIComponent(plu)}&status=${encodeURIComponent(status)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!res.ok) {
    // Jika 404/401/403/500 terjadi karena session invalid, relogin sekali lagi
    if ((res.status === 404 || res.status === 401 || res.status === 403) && retryCount === 0) {
      console.log(`[STOCK SERVICE] HTTP ${res.status} saat search PLU ${plu}. Melakukan force relogin & retry...`);
      await loginAndSaveSession(true);
      return await searchStockApi({ desc, plu, status }, retryCount + 1);
    }
    throw new Error(`DataTables API search error: HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Melakukan toggle status item stock secara instan (< 1 detik) melalui HTTP API endpoint
 */
async function toggleStockApi(stockId, retryCount = 0) {
  const session = await ensureValidSession();
  const cookieHeader = getCookieHeader(session.cookies);

  const url = `${BASE_URL}/stock/toggle/${stockId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!res.ok) {
    if ((res.status === 404 || res.status === 401 || res.status === 403) && retryCount === 0) {
      console.log(`[STOCK SERVICE] HTTP ${res.status} saat toggle Stock ID ${stockId}. Melakukan force relogin & retry...`);
      await loginAndSaveSession(true);
      return await toggleStockApi(stockId, retryCount + 1);
    }
    throw new Error(`Toggle API error: HTTP ${res.status}`);
  }

  return await res.json();
}

module.exports = {
  ensureValidSession,
  searchStockApi,
  toggleStockApi
};

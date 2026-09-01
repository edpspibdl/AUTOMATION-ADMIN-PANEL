const { Pool } = require('pg');
const { DEFAULT_MARGIN_QUERY } = require('./queries');
const { normalizePlu } = require('../utils/pluHelper');

function createPool(dbConfig = {}) {
  return new Pool({
    host: dbConfig.host || process.env.PG_HOST || 'localhost',
    port: parseInt(dbConfig.port || process.env.PG_PORT || '5432', 10),
    user: dbConfig.user || process.env.PG_USER || 'postgres',
    password: dbConfig.password || process.env.PG_PASSWORD || '',
    database: dbConfig.database || process.env.PG_DATABASE || 'postgres',
    connectionTimeoutMillis: 5000
  });
}

/**
 * Menguji konektivitas ke database PostgreSQL
 */
async function testDbConnection(dbConfig) {
  const pool = createPool(dbConfig);
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() as current_time, current_database() as db_name;');
    client.release();
    await pool.end();
    return {
      success: true,
      time: res.rows[0].current_time,
      database: res.rows[0].db_name
    };
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Mengeksekusi query Margin Minus dan memetakan hasilnya
 */
async function fetchMarginMinusData(dbConfig, customQuery = null) {
  const pool = createPool(dbConfig);
  const queryText = (customQuery && customQuery.trim()) ? customQuery : DEFAULT_MARGIN_QUERY;

  try {
    const client = await pool.connect();
    const res = await client.query(queryText);
    client.release();
    await pool.end();

    const seenPlus = new Set();
    const items = [];

    for (const r of res.rows) {
      const pluNormalized = normalizePlu(r.plu || r.prd_prdcd);
      if (!pluNormalized || pluNormalized.length !== 7 || seenPlus.has(pluNormalized)) {
        continue;
      }
      seenPlus.add(pluNormalized);

      const marginA = r.margin !== null && r.margin !== undefined ? parseFloat(r.margin).toFixed(2) : '-';
      const marginMd = r.margin_a_md !== null && r.margin_a_md !== undefined ? parseFloat(r.margin_a_md).toFixed(2) : '-';
      const marginL = r.margin_lcost !== null && r.margin_lcost !== undefined ? parseFloat(r.margin_lcost).toFixed(2) : '-';
      const marginLMd = r.margin_l_md !== null && r.margin_l_md !== undefined ? parseFloat(r.margin_l_md).toFixed(2) : '-';

      items.push({
        div: r.div || '-',
        plu: pluNormalized,
        deskripsi: r.deskripsi || r.desk || '-',
        frac: r.frac || 1,
        unit: r.unit || 'PCS',
        tag: r.tag || '-',
        lpp: r.lpp || 0,
        hrg: r.hrg || 0,
        hrgP: r.hrg_p || '-',
        lcostPcs: r.lcost_pcs || 0,
        acostPcs: r.acost_pcs || 0,
        marginA,
        marginMd,
        marginL,
        marginLMd
      });
    }

    return {
      success: true,
      totalCount: items.length,
      items: items,
      plus: items.map(item => item.plu)
    };
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    return {
      success: false,
      error: err.message,
      items: [],
      plus: []
    };
  }
}

module.exports = {
  createPool,
  testDbConnection,
  fetchMarginMinusData
};

const { Pool } = require('pg');
require('dotenv').config();

const DEFAULT_MARGIN_QUERY = `
SELECT PRD_KODEDIVISI DIV,
  PRD_PRDCD PLU,
  PRD_DESKRIPSIPANJANG DESKRIPSI,
  PRD_FRAC FRAC,
  PRD_UNIT UNIT,
  PRD_KODETAG TAG,
  ST_SALDOAKHIR LPP,
  PRD_HRGJUAL HRG,
  PRMD_HRGJUAL HRG_P,
  LCOST LCOST_PCS,
  ACOST ACOST_PCS,
  ACOST_INCLUDE A_COST_INC,
  MARGIN_A MARGIN,
  MARGIN_L MARGIN_LCOST,
  MARGIN_A_MD,
  MARGIN_L_MD
FROM
  (SELECT PRD_KODEDIVISI,
    PRD_PRDCD,
    PRD_DESKRIPSIPANJANG,
    PRD_FRAC,
    PRD_UNIT,
    PRD_KODETAG,
    ST_SALDOAKHIR,
    PRD_HRGJUAL,
    PRMD_HRGJUAL,
    LCOST,
    ACOST,
    ACOST_INCLUDE,
    MARGIN_A,
    MARGIN_L,
    
        CASE
          WHEN PRD_UNIT='KG'
          THEN (((PRMD_HRGJUAL-(ST_AVGCOST*PRD_FRAC/1000))/PRMD_HRGJUAL)*100)
          WHEN COALESCE(prd_flagbkp1,'T') ='Y' and COALESCE(prd_flagbkp2,'T') ='Y'
          THEN (((PRMD_HRGJUAL/1.11)-(ST_AVGCOST*PRD_FRAC))/(PRMD_HRGJUAL/1.11)*100)
          ELSE (((PRMD_HRGJUAL-(ST_AVGCOST*PRD_FRAC))/PRMD_HRGJUAL)*100)
        END AS MARGIN_A_MD,
   
        CASE
          WHEN PRD_UNIT='KG'
          THEN (((PRMD_HRGJUAL-(ST_LASTCOST*PRD_FRAC/1000))/PRMD_HRGJUAL)*100)
          WHEN COALESCE(prd_flagbkp1,'T') ='Y' and COALESCE(prd_flagbkp2,'T') ='Y'
          THEN (((PRMD_HRGJUAL/1.11)-(ST_LASTCOST*PRD_FRAC))/(PRMD_HRGJUAL/1.11)*100)
          ELSE (((PRMD_HRGJUAL-(ST_LASTCOST*PRD_FRAC))/PRMD_HRGJUAL)*100)
        END AS MARGIN_L_MD FROM(SELECT PRD_KODEDIVISI,
  PRD_PRDCD,
  PRD_DESKRIPSIPANJANG,
  PRD_FRAC,
  PRD_UNIT,
  PRD_KODETAG,
  ST_SALDOAKHIR,
  PRD_HRGJUAL,
  ST_LASTCOST,prd_flagbkp2,prd_flagbkp1,ST_AVGCOST,
  CASE
    WHEN PRD_UNIT='KG'
    THEN (ST_LASTCOST*PRD_FRAC)/1000
    ELSE ST_LASTCOST *PRD_FRAC
  END AS LCOST,
  CASE
    WHEN PRD_UNIT='KG'
    THEN (ST_AVGCOST*PRD_FRAC)/1000
    ELSE ST_AVGCOST *PRD_FRAC
  END AS ACOST,
  CASE
    WHEN PRD_UNIT='KG'
    THEN ((ST_AVGCOST*PRD_FRAC)/1000)*1.11
    ELSE (ST_AVGCOST *PRD_FRAC)*1.11
  END AS ACOST_INCLUDE,
   
        CASE
          WHEN PRD_UNIT='KG'
          THEN (((PRD_HRGJUAL-(ST_AVGCOST*PRD_FRAC/1000))/PRD_HRGJUAL)*100)
          WHEN COALESCE(prd_flagbkp1,'T') ='Y' and COALESCE(prd_flagbkp2,'T') ='Y'
          THEN (((PRD_HRGJUAL/1.11)-(ST_AVGCOST*PRD_FRAC))/(PRD_HRGJUAL/1.11)*100)
          ELSE (((PRD_HRGJUAL-(ST_AVGCOST*PRD_FRAC))/PRD_HRGJUAL)*100)
        END AS MARGIN_A,
  
        CASE
          WHEN PRD_UNIT='KG'
          THEN (((PRD_HRGJUAL-(ST_LASTCOST*PRD_FRAC/1000))/PRD_HRGJUAL)*100)
          WHEN COALESCE(prd_flagbkp1,'T') ='Y' and COALESCE(prd_flagbkp2,'T') ='Y'
          THEN (((PRD_HRGJUAL/1.11)-(ST_LASTCOST*PRD_FRAC))/(PRD_HRGJUAL/1.11)*100)
          ELSE (((PRD_HRGJUAL-(ST_LASTCOST*PRD_FRAC))/PRD_HRGJUAL)*100)
        END AS MARGIN_L
  
FROM
(SELECT SUBSTR(PRD_PRDCD,1,6)
  ||0 PLU,
  PRD_PRDCD,
  PRD_KODEDIVISI,
  PRD_KODEDEPARTEMENT,
  PRD_KODEKATEGORIBARANG,
  PRD_KODETAG,
  PRD_DESKRIPSIPANJANG,
  PRD_UNIT,
  PRD_FRAC,
  PRD_HRGJUAL,
  prd_flagbkp1,
  prd_flagbkp2
FROM tbmaster_prodmast
)prd LEFT JOIN
(SELECT ST_PRDCD,
  ST_SALDOAKHIR,
  ST_LASTCOST,
  ST_AVGCOST
FROM tbmaster_Stock
WHERE st_lokasi='01'
)stk ON prd.PLU=stk.st_prdcd 
  WHERE COALESCE (PRD_KODETAG,'0') NOT IN ('N','X','Z') AND ST_SALDOAKHIR <>0 ORDER BY PRD_PRDCD ASC)HRG_N LEFT JOIN 
 (SELECT PRMD_PRDCD AS PLUMD,
  PRMD_HRGJUAL
FROM TBTR_PROMOMD
WHERE CURRENT_DATE BETWEEN DATE(PRMD_TGLAWAL) AND DATE(PRMD_TGLAKHIR)
)PRMD ON HRG_N.PRD_PRDCD=PRMD.PLUMD)MARGINM WHERE (MARGIN_A<0 OR MARGIN_A_MD<0)
`;

function getPool(dbConfig = {}) {
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
 * Tes koneksi ke database PostgreSQL
 */
async function testDbConnection(dbConfig) {
  const pool = getPool(dbConfig);
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
 * Menjalankan query margin minus dan mengambil daftar data
 */
async function fetchMarginMinusData(dbConfig, customQuery = null) {
  const pool = getPool(dbConfig);
  const queryText = (customQuery && customQuery.trim()) ? customQuery : DEFAULT_MARGIN_QUERY;

  try {
    const client = await pool.connect();
    const res = await client.query(queryText);
    client.release();
    await pool.end();

    const items = res.rows.map(r => {
      const pluRaw = (r.plu || r.prd_prdcd || '').toString().trim();
      const marginA = r.margin !== null && r.margin !== undefined ? parseFloat(r.margin).toFixed(2) : '-';
      const marginMd = r.margin_a_md !== null && r.margin_a_md !== undefined ? parseFloat(r.margin_a_md).toFixed(2) : '-';
      const marginL = r.margin_lcost !== null && r.margin_lcost !== undefined ? parseFloat(r.margin_lcost).toFixed(2) : '-';
      const marginLMd = r.margin_l_md !== null && r.margin_l_md !== undefined ? parseFloat(r.margin_l_md).toFixed(2) : '-';

      return {
        div: r.div || '-',
        plu: pluRaw,
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
      };
    }).filter(item => item.plu);

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
  DEFAULT_MARGIN_QUERY,
  testDbConnection,
  fetchMarginMinusData
};

/**
 * Utilitas Normalisasi Kode Barang (PLU) Indogrosir / StokPoin
 * Aturan: Kode PLU standar di CMS adalah 7 angka dengan angka terakhir selalu '0'.
 * Angka terakhir pada kode barang turunan/karton/fraksi (misal 1, 2, 3, dst) diabaikan dan diubah menjadi '0'.
 */

/**
 * Menormalkan kode PLU menjadi tepat 7 digit dengan digit ke-7 adalah '0'
 * @param {string|number} rawPlu - Kode PLU input (contoh: '0007753', '454851', '1163630', '13500')
 * @returns {string} - Kode PLU 7 digit berakhiran '0' (contoh: '0007750', '0454850', '1163630', '0013500')
 */
function normalizePlu(rawPlu) {
  if (rawPlu === null || rawPlu === undefined) return '';
  let str = rawPlu.toString().trim();
  
  // Hilangkan karakter non-angka
  str = str.replace(/\D/g, '');
  if (!str) return '';

  // Pastikan minimal 7 digit dengan padding 0 di depan jika kurang
  if (str.length < 7) {
    str = str.padStart(7, '0');
  }

  // Ambil 6 digit pertama dan jadikan digit ke-7 selalu '0' (abaikan angka terakhir turunan)
  return str.substring(0, 6) + '0';
}

/**
 * Menormalkan dan menghilangkan duplikat dari array PLU
 * @param {Array<string|number>} plus - Daftar PLU mentah
 * @returns {Array<string>} - Daftar PLU 7 digit berakhiran '0' yang unik
 */
function normalizeAndDeduplicatePlus(plus) {
  if (!Array.isArray(plus)) return [];
  
  const uniqueMap = new Set();
  const result = [];

  for (const raw of plus) {
    const clean = normalizePlu(raw);
    if (clean && clean.length === 7 && !uniqueMap.has(clean)) {
      uniqueMap.add(clean);
      result.push(clean);
    }
  }

  return result;
}

module.exports = {
  normalizePlu,
  normalizeAndDeduplicatePlus
};

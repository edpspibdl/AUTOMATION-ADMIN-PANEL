const { loginAndSaveSession } = require('./src/services/authService');

// Eksekusi jika dipanggil langsung via CLI: node login.js
if (require.main === module) {
  (async () => {
    try {
      console.log('🚀 Menjalankan login interaktif (browser terlihat)...');
      await loginAndSaveSession(false);
      console.log('✅ Login berhasil dan session telah disimpan!');
    } catch (err) {
      console.error('❌ Gagal login:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  loginAndSaveSession
};

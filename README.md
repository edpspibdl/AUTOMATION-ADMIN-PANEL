# 🚀 Panduan Instalasi & Penggunaan StokPoin Automation Dashboard

Aplikasi otomatisasi cerdas untuk memantau **Margin Minus (PostgreSQL)** secara berkala (setiap 5 menit) dan menjalankan **Jadwal Harian PLU Manual** ke **CMS StokPoin Indogrosir**.

---

## 📋 1. System Requirements (Prasyarat Sistem)

Sebelum memulai instalasi, pastikan komputer/server Anda telah memenuhi syarat berikut:

1. **Sistem Operasi:** Windows 10/11 / Windows Server / Linux / macOS.
2. **Node.js:** Versi **18.x** atau **20.x LTS** (atau lebih baru).  
   👉 Download resmi: [https://nodejs.org/](https://nodejs.org/)
3. **Koneksi Jaringan:**
   * Akses internet ke web CMS: `https://cms.stokpoin.com`
   * Akses jaringan (LAN/VPN) ke database PostgreSQL (contoh: `192.168.1.xxx:5432` atau `localhost:5432`).

---

## 📦 2. Langkah-Langkah Instalasi (Step-by-Step)

### Langkah 1: Install Node.js
1. Unduh installer **Node.js LTS** dari [nodejs.org](https://nodejs.org/).
2. Jalankan installer dan ikuti petunjuk hingga selesai (klik Next sampai Finish).
3. Buka **Command Prompt (CMD)** atau **PowerShell**, lalu ketik:
   ```bash
   node -v
   npm -v
   ```
   *(Jika muncul versi, berarti Node.js sudah siap).*

---

### Langkah 2: Buka Folder Project
Buka CMD atau terminal di lokasi folder project ini:
```bash
cd D:\Projek\coba-coba
```

---

### Langkah 3: Install Dependensi Project
Jalankan perintah berikut untuk mengunduh seluruh library yang dibutuhkan:
```bash
npm install
```
Library yang akan diinstall:
* `playwright`: Engine browser otomatis untuk login CMS
* `express`: Server Web Dashboard & API lokal
* `node-cron`: Penjadwal otomatis (interval 5 menit & jam harian)
* `pg`: Driver koneksi database PostgreSQL
* `dotenv`: Pengelola environment variables

---

### Langkah 4: Install Browser Playwright
Jalankan perintah ini sekali saja untuk memasang browser Chromium headless:
```bash
npx playwright install chromium
```

---

### Langkah 5: Konfigurasi File `.env` (Opsional / Sekali Saja)
File `.env` di folder utama digunakan untuk menyimpan akun login awal dan kredensial default.

Salin file `.env.example` menjadi `.env`, lalu isi sesuai akun Anda:
```env
# Kredensial Akun CMS StokPoin
CMS_EMAIL=email_anda@indogrosir.co.id
CMS_PASSWORD=password_cms_anda
CMS_URL=https://cms.stokpoin.com

# Kredensial Database PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=password_db_anda
PG_DATABASE=nama_database_anda
```
*(Catatan: Anda juga bisa mengubah pengaturan ini langsung dari Dashboard Web UI tanpa perlu mengedit file).*

---

## ▶️ 3. Menjalankan Aplikasi

Jalankan perintah berikut di terminal:
```bash
npm start
```
atau klik dua kali file **`jalankan_dashboard.bat`**.

Setelah muncul tulisan:
```
======================================================
🚀 StokPoin Automation Dashboard siap dijalankan!
🌐 Buka di browser: http://localhost:3000
======================================================
```

Buka browser (Google Chrome / Edge) dan akses alamat:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ 4. Cara Penggunaan Fitur Dashboard

### A. 🛡️ Auto-Guard Margin Minus (Setiap 5 Menit Sekali)
1. Aktifkan toggle switch **"Pencegah Margin Minus"** di kartu kiri atas.
2. Atur frekuensi pengecekan: **Setiap 5 Menit Sekali** (default).
3. **Cara Kerja:**
   * Setiap 5 menit, sistem mengecek query PostgreSQL.
   * Jika ada item margin minus terdeteksi, sistem **LANGSUNG seketika menonaktifkannya di CMS**.
   * Jika tidak ada item margin minus (0 data), sistem hanya mencatat log kondisi aman.
4. Anda bisa menekan tombol **"🛡️ Cek & Nonaktifkan Marmin Sekarang"** jika ingin langsung mengeksekusi tanpa menunggu 5 menit.

### B. ⏰ Jadwal Harian Khusus PLU Manual
1. Aktifkan toggle switch **"Jadwal Harian PLU Manual"** di kartu kiri tengah.
2. Masukkan jam eksekusi harian (misal: `22:00` WIB).
3. Pilih aksi: **Nonaktifkan Stok** / **Aktifkan Kembali** / **Toggle**.
4. Klik tombol **"📝 Input / Edit PLU"** untuk memasukkan nomor-nomor PLU manual (bisa ketik langsung atau upload file `.txt` / `.csv`).
5. Klik **"💾 Simpan Pengaturan"**.

### C. 🐘 Pengaturan & Tes Database PostgreSQL
1. Klik tombol **"🐘 Pengaturan Database PostgreSQL"**.
2. Masukkan Host IP, Port, User, Password, dan Nama Database.
3. Klik tombol **"🔌 Tes Koneksi"** untuk memastikan database terhubung.
4. Klik **"💾 Simpan Konfigurasi DB"**.

---

## 🔄 5. Menjalankan Otomatis di Background (Auto-Start saat PC Nyala)

Jika Anda ingin aplikasi ini terus berjalan di latar belakang (background) bahkan saat CMD ditutup, Anda bisa menggunakan **PM2**:

1. Install PM2 secara global:
   ```bash
   npm install -g pm2
   ```
2. Jalankan aplikasi via PM2:
   ```bash
   pm2 start server.js --name "stokpoin-auto"
   ```
3. Simpan agar auto-start saat Windows restart:
   ```bash
   pm2 save
   ```
4. Perintah berguna PM2:
   * `pm2 status` : Melihat status server
   * `pm2 logs stokpoin-auto` : Melihat log langsung
   * `pm2 restart stokpoin-auto` : Restart server
   * `pm2 stop stokpoin-auto` : Menghentikan server

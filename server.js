const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const apiRoutes = require('./src/routes/apiRoutes');
const { setupSchedulers } = require('./src/schedulers/schedulerManager');
const { addLog } = require('./src/utils/logger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS & JSON Parser
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routes
app.use('/api', apiRoutes);

// Pastikan rute root ('/') dan fallback selalu menyajikan dashboard UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback untuk halaman frontend jika rute API tidak ditemukan
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Jalankan Server & Penjadwal
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 StokPoin Automation Dashboard siap dijalankan!`);
  console.log(`🌐 Buka di browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  addLog('info', `Server Web UI berjalan di http://localhost:${PORT}`);
  setupSchedulers();
});

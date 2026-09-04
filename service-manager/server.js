const express = require('express');
const path = require('path');
const routes = require('./src/routes');
const { initAutoStartServices } = require('./src/processManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware CORS & JSON
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount API
app.use('/api', routes);

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback for SPA
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Service Manager Dashboard siap dijalankan!`);
  console.log(`🌐 Buka di browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  initAutoStartServices();
});

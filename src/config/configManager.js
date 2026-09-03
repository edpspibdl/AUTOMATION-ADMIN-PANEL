const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG_PATH = path.join(__dirname, '../../config.json');

const DEFAULT_CONFIG = {
  marminGuardEnabled: true,
  marminIntervalMinutes: 5,
  dailyScheduleEnabled: true,
  dailyScheduleTime: '22:00',
  dailyAction: 'nonaktif',
  dailyEnableTime: '08:00',
  dailyEnableAction: 'aktif',
  plus: ['0013500'],
  deactivatedPlus: [],
  customQuery: '',
  dbConfig: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'postgres'
  },
  lastRun: null,
  lastMarminRun: null,
  lastHitstokRun: null,
  lastLppRun: null,
  iasConfig: {
    baseUrl: 'http://172.31.146.190',
    koneksi: 'sim',
    username: 'RIS',
    password: '0' + '61201',
    branchCode: '1R',
    cabang: 'spibdl1r',
    autoResetSession: true
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw);
      return {
        marminGuardEnabled: cfg.marminGuardEnabled ?? DEFAULT_CONFIG.marminGuardEnabled,
        marminIntervalMinutes: parseInt(cfg.marminIntervalMinutes || DEFAULT_CONFIG.marminIntervalMinutes, 10),
        dailyScheduleEnabled: cfg.dailyScheduleEnabled ?? DEFAULT_CONFIG.dailyScheduleEnabled,
        dailyScheduleTime: cfg.dailyScheduleTime || DEFAULT_CONFIG.dailyScheduleTime,
        dailyAction: cfg.dailyAction || DEFAULT_CONFIG.dailyAction,
        dailyEnableTime: cfg.dailyEnableTime || DEFAULT_CONFIG.dailyEnableTime,
        dailyEnableAction: cfg.dailyEnableAction || DEFAULT_CONFIG.dailyEnableAction,
        plus: Array.isArray(cfg.plus) ? cfg.plus : DEFAULT_CONFIG.plus,
        deactivatedPlus: Array.isArray(cfg.deactivatedPlus) ? cfg.deactivatedPlus : [],
        customQuery: cfg.customQuery || '',
        dbConfig: cfg.dbConfig || DEFAULT_CONFIG.dbConfig,
        lastRun: cfg.lastRun || null,
        lastMarminRun: cfg.lastMarminRun || null,
        lastHitstokRun: cfg.lastHitstokRun || null,
        lastLppRun: cfg.lastLppRun || null,
        iasConfig: cfg.iasConfig || DEFAULT_CONFIG.iasConfig
      };
    }
  } catch (err) {
    console.error('Gagal membaca config.json:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Gagal menulis config.json:', err.message);
    return false;
  }
}

function updateConfig(partialConfig) {
  const current = loadConfig();
  const updated = {
    ...current,
    ...partialConfig
  };
  if (partialConfig.dbConfig) {
    updated.dbConfig = { ...current.dbConfig, ...partialConfig.dbConfig };
  }
  if (partialConfig.iasConfig) {
    updated.iasConfig = { ...current.iasConfig, ...partialConfig.iasConfig };
  }
  if (Array.isArray(partialConfig.plus)) {
    updated.plus = partialConfig.plus.map(p => p.toString().trim()).filter(Boolean);
  }
  if (Array.isArray(partialConfig.deactivatedPlus)) {
    updated.deactivatedPlus = partialConfig.deactivatedPlus.map(p => p.toString().trim()).filter(Boolean);
  }
  saveConfig(updated);
  return updated;
}

module.exports = {
  loadConfig,
  saveConfig,
  updateConfig,
  DEFAULT_CONFIG
};

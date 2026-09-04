const express = require('express');
const router = express.Router();
const processManager = require('./processManager');
const { logEmitter } = processManager;

// 1. Get all services
router.get('/services', (req, res) => {
  const services = processManager.getServices();
  res.json({ success: true, services });
});

// 2. Get service detail
router.get('/services/:id', (req, res) => {
  const service = processManager.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ success: false, error: 'Service tidak ditemukan.' });
  res.json({ success: true, service });
});

// 3. Add new service
router.post('/services', (req, res) => {
  const { name, command, description, cwd, autoStart, autoRestart } = req.body;
  if (!name || !command) {
    return res.status(400).json({ success: false, error: 'Nama dan perintah (command) wajib diisi.' });
  }
  const created = processManager.addService({ name, command, description, cwd, autoStart, autoRestart });
  res.json({ success: true, service: created });
});

// 4. Update service
router.put('/services/:id', (req, res) => {
  const updated = processManager.updateService(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, error: 'Service tidak ditemukan.' });
  res.json({ success: true, service: updated });
});

// 5. Delete service
router.delete('/services/:id', (req, res) => {
  const deleted = processManager.deleteService(req.params.id);
  res.json({ success: true });
});

// 6. Start service
router.post('/services/:id/start', (req, res) => {
  const result = processManager.startService(req.params.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// 7. Stop service
router.post('/services/:id/stop', (req, res) => {
  const result = processManager.stopService(req.params.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// 8. Restart service
router.post('/services/:id/restart', async (req, res) => {
  const result = await processManager.restartService(req.params.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// 9. Get logs
router.get('/services/:id/logs', (req, res) => {
  const srv = processManager.getServiceById(req.params.id);
  if (!srv) return res.status(404).json({ success: false, error: 'Service tidak ditemukan.' });
  res.json({ success: true, logs: srv.logs || [] });
});

// 10. Clear logs
router.post('/services/:id/logs/clear', (req, res) => {
  processManager.clearServiceLogs(req.params.id);
  res.json({ success: true });
});

// 11. Start / Stop all
router.post('/services/start-all', (req, res) => {
  const results = processManager.startAllServices();
  res.json({ success: true, results });
});

router.post('/services/stop-all', (req, res) => {
  const results = processManager.stopAllServices();
  res.json({ success: true, results });
});

// 12. Realtime SSE Stream
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });
  if (res.flushHeaders) res.flushHeaders();

  res.write(`event: init\ndata: ${JSON.stringify({ services: processManager.getServices() })}\n\n`);

  const onServiceLog = (entry) => {
    res.write(`event: service-log\ndata: ${JSON.stringify(entry)}\n\n`);
  };

  const onServiceStatus = (entry) => {
    res.write(`event: service-status\ndata: ${JSON.stringify(entry)}\n\n`);
  };

  logEmitter.on('service-log', onServiceLog);
  logEmitter.on('service-status', onServiceStatus);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    logEmitter.removeListener('service-log', onServiceLog);
    logEmitter.removeListener('service-status', onServiceStatus);
  });
});

module.exports = router;

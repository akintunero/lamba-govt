const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { startAuditConsumer } = require('./consumer');
const ctfFlags = require('../../../platform/common/ctf-flags');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3005;
const SERVICE = 'audit-service';

app.use(express.json());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE, mode: 'event-driven' }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE));
});

app.get('/logs', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const logs = await prisma.auditLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' }
  });
  return res.json({ logs });
});

app.get('/v1/compliance/export', requireAuth, async (req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  return res.json({
    exportedAt: new Date().toISOString(),
    recordCount: logs.length,
    logs
  });
});

app.post('/events', async (req, res) => {
  const { action, detail, actor, service, correlationId } = req.body;
  if (!action || !detail) {
    return res.status(400).json({ error: 'action and detail are required' });
  }
  const log = await prisma.auditLog.create({
    data: {
      action,
      detail,
      actor: actor || null,
      service: service || 'unknown',
      correlationId: correlationId || req.correlationId || null
    }
  });
  const auditSpoofSucceeded = action === 'system_override' || actor === 'admin_root';
  const spoofFlag = auditSpoofSucceeded ? ctfFlags.a09AuditSpoof() : '';
  if (spoofFlag) {
    return res.status(201).json({ ...log, flag: spoofFlag });
  }
  return res.status(201).json(log);
});

function isPrivateOrLoopbackIp(ip) {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, '');
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

function isExternalGatewayAccess(req) {
  if (req.get('X-Lamba-Gateway-Proxy') === 'true') {
    return true;
  }
  const clientIp = req.get('X-Forwarded-Client-Ip');
  return Boolean(clientIp) && !isPrivateOrLoopbackIp(clientIp);
}

app.get('/internal/audit', async (req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' } });
  const gatewayFlag = isExternalGatewayAccess(req) ? ctfFlags.a05InternalGateway() : '';
  if (gatewayFlag) {
    logs.push({ flag: gatewayFlag });
  }
  return res.json({ logs });
});

app.get('/internal/diagnostics', async (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  if (mode !== 'verbose') {
    return res.status(400).json({ error: 'Unsupported diagnostics mode' });
  }
  const diagnosticsToken = process.env.DIAGNOSTICS_TOKEN || 'diag-default-token';
  const flag = ctfFlags.a10Diagnostics();
  return res.status(500).json({
    error: 'Diagnostics failure',
    detail: `trace_ref=${diagnosticsToken}`,
    ...(flag ? { flag } : {})
  });
});

async function bootstrap() {
  app.listen(PORT, () => {
    console.log(`${SERVICE} listening on ${PORT}`);
  });
  try {
    await startAuditConsumer();
  } catch (err) {
    console.error(JSON.stringify({
      component: 'audit-consumer',
      warning: 'Kafka consumer unavailable; HTTP API remains available',
      error: err.message
    }));
  }
}

bootstrap();

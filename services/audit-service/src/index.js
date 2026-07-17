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
const crypto = require('crypto');
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
    return res.status(201).json({ ...log, archive_signature: spoofFlag });
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
  if (gatewayFlag && logs.length > 0) {
    logs[0].internal_route_id = gatewayFlag;
  }
  return res.json({ logs });
});

app.get('/internal/diagnostics', async (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  if (mode !== 'verbose') {
    return res.status(400).json({ error: 'Unsupported diagnostics mode' });
  }
  const diagnosticsToken = process.env.DIAGNOSTICS_TOKEN;
  const jwtSecret = process.env.JWT_SECRET;
  const flag = ctfFlags.a10Diagnostics();
  res.setHeader('X-Diagnostics-Trace', flag || 'none');
  return res.status(500).json({
    error: 'Diagnostics failure',
    detail: `trace_ref=${diagnosticsToken}`,
    config: {
      jwt_secret: jwtSecret,
      token_issuer: 'lamba-platform',
      service_version: '3.0.0-diagnostics'
    }
  });
});

const FORENSICS_FLAG = ctfFlags.forensicsLogAnalysis();

function generateWafLogs() {
  const entries = [
    { ts: new Date(Date.now() - 3600000).toISOString(), ip: '10.0.1.50', method: 'POST', path: '/api/v1/login', status: 401, body: Buffer.from('username=admin&password=admin123').toString('base64') },
    { ts: new Date(Date.now() - 1800000).toISOString(), ip: '10.0.1.51', method: 'GET', path: '/api/v1/documents/3', status: 200, body: Buffer.from('direct object reference test').toString('base64') },
    { ts: new Date(Date.now() - 900000).toISOString(), ip: '10.0.1.52', method: 'POST', path: '/api/v1/admin/import/settings', status: 200, body: Buffer.from(JSON.stringify({ payload: 'prototype', source: 'unknown' })).toString('base64') },
    { ts: new Date(Date.now() - 600000).toISOString(), ip: '10.0.1.53', method: 'GET', path: '/_waf/console', status: 403, body: Buffer.from('unauthorized console access').toString('base64') },
    { ts: new Date(Date.now() - 300000).toISOString(), ip: '10.0.1.54', method: 'POST', path: '/api/v1/auth/password-reset/request', status: 200, body: Buffer.from('email=admin@gov.lamba&predictable=token').toString('base64') },
    { ts: new Date(Date.now() - 120000).toISOString(), ip: '10.0.1.55', method: 'GET', path: '/api/v1/booking/encrypted-manifest', status: 200, body: Buffer.from('padding oracle scan detected').toString('base64') }
  ];
  if (FORENSICS_FLAG) {
    entries.push({
      ts: new Date().toISOString(),
      ip: '10.0.1.99',
      method: 'GET',
      path: '/_waf/console',
      status: 200,
      body: Buffer.from(`flag_submission:${FORENSICS_FLAG}`).toString('base64')
    });
  }
  return entries;
}

app.get('/_waf/logs', async (req, res) => {
  const logs = generateWafLogs();
  res.setHeader('X-WAF-Rotator', crypto.randomBytes(4).toString('hex'));
  return res.json({ logs, total: logs.length });
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

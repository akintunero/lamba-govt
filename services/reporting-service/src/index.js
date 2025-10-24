const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth, requireRole } = require('../../../platform/common/auth');
const { serviceFetch } = require('../../../platform/common/http');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const {
  startReportingConsumer,
  publishReportGenerated,
  getActivitySnapshot
} = require('./consumer');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3008;
const SERVICE = 'reporting-service';

const CITIZEN_URL = process.env.CITIZEN_SERVICE_URL || 'http://citizen-service:3002';
const DOCUMENT_URL = process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3003';
const AUDIT_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3005';

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

app.get('/v1/reports/citizens/statistics', requireAuth, async (req, res) => {
  const [total, verified, pending] = await Promise.all([
    prisma.citizen.count(),
    prisma.citizen.count({ where: { status: 'verified' } }),
    prisma.citizen.count({ where: { status: 'pending' } })
  ]);
  const report = { total, verified, pending, streamActivity: getActivitySnapshot(), generatedAt: new Date().toISOString() };
  await publishReportGenerated({
    type: 'citizen_statistics',
    title: 'Citizen population statistics',
    payload: report,
    correlationId: req.correlationId,
    generatedBy: req.user?.email
  });
  return res.json(report);
});

app.get('/v1/reports/documents/processing', requireAuth, async (req, res) => {
  const [documents, requests, byStatus] = await Promise.all([
    prisma.document.count(),
    prisma.documentRequest.count(),
    prisma.documentRequest.groupBy({ by: ['status'], _count: { status: true } })
  ]);
  const report = { documents, requests, byStatus, streamActivity: getActivitySnapshot(), generatedAt: new Date().toISOString() };
  await publishReportGenerated({
    type: 'document_processing',
    title: 'Document processing metrics',
    payload: report,
    correlationId: req.correlationId,
    generatedBy: req.user?.email
  });
  return res.json(report);
});

app.get('/v1/reports/compliance/summary', requireAuth, requireRole('admin', 'clerk'), async (req, res) => {
  const grants = await prisma.grantApproval.groupBy({ by: ['status'], _count: { status: true } });
  const audits = await prisma.auditLog.count();
  const report = { grants, auditEvents: audits, streamActivity: getActivitySnapshot(), generatedAt: new Date().toISOString() };
  await publishReportGenerated({
    type: 'compliance_summary',
    title: 'Compliance summary report',
    payload: report,
    correlationId: req.correlationId,
    generatedBy: req.user?.email
  });
  return res.json(report);
});

app.get('/v1/reports/audit/summary', requireAuth, async (req, res) => {
  let remoteLogs = [];
  try {
    const data = await serviceFetch(AUDIT_URL, '/logs?limit=100', { correlationId: req.correlationId });
    remoteLogs = data.logs || [];
  } catch {
    remoteLogs = await prisma.auditLog.findMany({ take: 100, orderBy: { createdAt: 'desc' } });
  }
  const byService = remoteLogs.reduce((acc, log) => {
    const key = log.service || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const report = { total: remoteLogs.length, byService, streamActivity: getActivitySnapshot(), generatedAt: new Date().toISOString() };
  await publishReportGenerated({
    type: 'audit_summary',
    title: 'Audit activity summary',
    payload: report,
    correlationId: req.correlationId,
    generatedBy: req.user?.email
  });
  return res.json(report);
});

app.get('/v1/reports/activity/stream', requireAuth, async (_req, res) => {
  return res.json(getActivitySnapshot());
});

app.get('/v1/reports/health/services', async (_req, res) => {
  const targets = [
    { name: 'citizen-service', url: CITIZEN_URL },
    { name: 'document-service', url: DOCUMENT_URL },
    { name: 'audit-service', url: AUDIT_URL }
  ];
  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const r = await fetch(`${t.url}/health`);
        return { name: t.name, status: r.ok ? 'up' : 'down' };
      } catch {
        return { name: t.name, status: 'down' };
      }
    })
  );
  return res.json({ services: results, generatedAt: new Date().toISOString() });
});

app.post('/v1/reports/generate', requireAuth, requireRole('admin'), async (req, res) => {
  const { type, title } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }
  const payload = await buildReportPayload(type);
  const record = await publishReportGenerated({
    type,
    title: title || `${type} report`,
    payload,
    correlationId: req.correlationId,
    generatedBy: req.user?.email
  });
  return res.status(201).json(record);
});

app.get('/v1/reports', requireAuth, async (_req, res) => {
  const reports = await prisma.report.findMany({ orderBy: { generatedAt: 'desc' }, take: 50 });
  return res.json({ reports });
});

app.get('/v1/reports/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  return res.json({ ...report, payload: JSON.parse(report.payload) });
});

async function buildReportPayload(type) {
  if (type === 'citizen_statistics') {
    return { total: await prisma.citizen.count(), streamActivity: getActivitySnapshot() };
  }
  if (type === 'document_processing') {
    return { documents: await prisma.document.count(), streamActivity: getActivitySnapshot() };
  }
  return { type, streamActivity: getActivitySnapshot(), generatedAt: new Date().toISOString() };
}

async function bootstrap() {
  try {
    await startReportingConsumer();
  } catch (err) {
    console.error(JSON.stringify({ component: 'reporting-consumer', error: err.message }));
  }
  app.listen(PORT, () => {
    console.log(`${SERVICE} listening on ${PORT}`);
  });
}

bootstrap();

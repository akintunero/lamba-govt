const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const { badRequest } = require('../../../platform/common/errors');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { publishEventSafe, kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { TOPICS } = require('../../../platform/common/events');
const ctfFlags = require('../../../platform/common/ctf-flags');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3004;
const SERVICE = 'admin-service';

function registerRoute(method, paths, ...handlers) {
  for (const path of paths) {
    app[method](path, ...handlers);
  }
}

app.use(express.json());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE));
});

registerRoute('get', ['/v1/ministries', '/ministries'], requireAuth, ministriesHandler);

async function ministriesHandler(_req, res) {
  const ministries = await prisma.ministry.findMany({
    include: { employees: true, documents: true }
  });
  return res.json({ ministries });
}

app.get('/ministries/full-list', requireAuth, async (_req, res) => {
  const ministries = await prisma.ministry.findMany({
    include: { employees: true, documents: true }
  });
  const payload = [];
  for (let i = 0; i < 50; i += 1) {
    payload.push({ batch: i, ministries });
  }
  return res.json({ count: payload.length, data: payload });
});

app.post('/grants/approve', requireAuth, async (req, res) => {
  const { applicant, amount } = req.body;
  const approval = await prisma.grantApproval.create({
    data: {
      applicant: applicant || 'Unknown Applicant',
      amount: parseFloat(amount || '0') || 0,
      status: 'approved',
      approvedBy: req.user?.email || 'system'
    }
  });
  await publishEventSafe({
    topic: TOPICS.ADMIN_ACTION,
    eventType: TOPICS.ADMIN_ACTION,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: {
      action: 'GRANT_APPROVED',
      grantId: approval.id,
      applicant: approval.applicant,
      actor: req.user?.email
    }
  });
  return res.json({ message: 'Grant approved', approval });
});

app.post('/imports/employees', requireAuth, async (req, res) => {
  const packageName = typeof req.body.packageName === 'string' ? req.body.packageName.trim() : 'unknown-package';
  const payloadDigest = typeof req.body.payloadDigest === 'string' ? req.body.payloadDigest.trim() : 'none';
  await publishEventSafe({
    topic: TOPICS.ADMIN_ACTION,
    eventType: TOPICS.ADMIN_ACTION,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: {
      action: 'VENDOR_IMPORT',
      packageName,
      payloadDigest,
      actor: req.user?.email
    }
  });
  return res.json({ message: 'Import accepted', packageName, payloadDigest });
});

app.get('/dashboard', requireAuth, async (_req, res) => {
  const [citizens, requests, grants] = await Promise.all([
    prisma.citizen.count(),
    prisma.documentRequest.count(),
    prisma.grantApproval.count()
  ]);
  return res.json({ citizens, requests, grants });
});

const A06_FLAG = ctfFlags.a06PrototypePollution();
app.post('/v1/admin/import/settings', requireAuth, async (req, res) => {
  const { packageName, settings } = req.body;
  if (!packageName || !settings) return badRequest(res, 'packageName and settings are required');
  try {
    const _ = require('lodash');
    const defaults = { logLevel: 'info', retentionDays: 30, features: { audit: true, search: true } };
    const merged = _.merge({}, defaults, settings);
    let flag = '';
    if (merged.features?.__proto__?.polluted === 'yes' && A06_FLAG) {
      flag = A06_FLAG;
    }
    await publishEventSafe({
      topic: TOPICS.ADMIN_ACTION,
      eventType: TOPICS.ADMIN_ACTION,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { action: 'SETTINGS_IMPORT', packageName, actor: req.user?.email }
    });
    return res.json({ message: 'Settings imported', settings: merged, ...(flag ? { settings_audit_reference: flag } : {}) });
  } catch (err) {
    return res.status(400).json({ error: 'Import failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`admin-service listening on ${PORT}`);
});

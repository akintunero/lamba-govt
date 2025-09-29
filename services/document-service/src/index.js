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
const storage = require('../../../platform/common/storage');
const { publishEventSafe, kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { TOPICS } = require('../../../platform/common/events');
const ctfFlags = require('../../../platform/common/ctf-flags');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3003;
const SERVICE = 'document-service';

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

async function listDocuments() {
  const documents = await prisma.document.findMany({ include: { ministry: true, versions: true } });
  return documents.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    classification: d.classification,
    status: d.status,
    ministry: d.ministry?.acronym || null,
    storageKey: d.storageKey,
    bucket: d.bucket,
    versionCount: d.versions.length
  }));
}

async function getDocument(id) {
  return prisma.document.findUnique({ where: { id }, include: { versions: true } });
}

const CONFIDENTIAL_SEED_DOCUMENT_ID = 3;

function respondUnauthenticatedDocument(doc, req, res) {
  const payload = { ...doc };
  if (
    !req.user &&
    doc.id === CONFIDENTIAL_SEED_DOCUMENT_ID &&
    doc.classification === 'confidential'
  ) {
    const flag = ctfFlags.a01Idor();
    if (flag) {
      payload.flag = flag;
    }
  }
  return res.json(payload);
}

app.get('/v1/documents', async (_req, res) => res.json(await listDocuments()));
app.get('/documents', async (_req, res) => res.json(await listDocuments()));

app.get('/v1/documents/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid document id' });
  const doc = await getDocument(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  return respondUnauthenticatedDocument(doc, req, res);
});

app.get('/documents/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid document id' });
  const doc = await getDocument(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  return respondUnauthenticatedDocument(doc, req, res);
});

app.get('/v2/documents/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const doc = await getDocument(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  let signedUrl = null;
  if (doc.bucket && doc.storageKey) {
    try {
      const signed = await storage.getSignedUrl({
        bucket: doc.bucket,
        objectKey: doc.storageKey,
        correlationId: req.correlationId
      });
      signedUrl = signed.url;
    } catch {
      signedUrl = null;
    }
  }
  return res.json({ ...doc, signedUrl });
});

app.post('/v1/documents/upload', requireAuth, async (req, res) => {
  const { title, type, classification, content, ministryId, citizenId, filename } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }
  const uploaded = await storage.uploadObject({
    bucket: 'lamba-documents',
    filename: filename || `${title.replace(/\s+/g, '-').toLowerCase()}.txt`,
    content: Buffer.from(content).toString('base64'),
    mimeType: 'text/plain',
    citizenId,
    correlationId: req.correlationId
  });
  const doc = await prisma.document.create({
    data: {
      title,
      type: type || 'document',
      classification: classification || 'internal',
      content,
      ministryId: ministryId || 1,
      citizenId: citizenId || null,
      bucket: uploaded.bucket,
      storageKey: uploaded.objectKey
    }
  });
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: uploaded.objectKey,
      bucket: uploaded.bucket,
      checksum: `sha256-${doc.id}-v1`,
      createdBy: req.user?.email
    }
  });
  await publishEventSafe({
    topic: TOPICS.DOCUMENT_UPLOADED,
    eventType: TOPICS.DOCUMENT_UPLOADED,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { documentId: doc.id, title: doc.title, bucket: uploaded.bucket, actor: req.user?.email }
  });
  return res.status(201).json(doc);
});

app.post('/v1/documents/:id/archive', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || !doc.bucket || !doc.storageKey) {
    return res.status(404).json({ error: 'Document not found' });
  }
  await storage.archiveObject({
    bucket: doc.bucket,
    objectKey: doc.storageKey,
    correlationId: req.correlationId
  });
  const updated = await prisma.document.update({
    where: { id },
    data: { status: 'archived' }
  });
  return res.json(updated);
});

app.get('/v1/documents/citizen/:citizenId/history', requireAuth, async (req, res) => {
  const citizenId = parseInt(req.params.citizenId, 10);
  const [documents, files] = await Promise.all([
    prisma.document.findMany({ where: { citizenId }, include: { versions: true } }),
    storage.getCitizenHistory(citizenId, req.correlationId).catch(() => ({ files: [] }))
  ]);
  return res.json({ documents, files: files.files || [] });
});

app.post('/v1/requests', requireAuth, async (req, res) => {
  const { citizenId, documentType } = req.body;
  if (!citizenId || !documentType) {
    return res.status(400).json({ error: 'citizenId and documentType are required' });
  }
  const request = await prisma.documentRequest.create({
    data: { citizenId, documentType, status: 'submitted' }
  });
  return res.status(201).json(request);
});

app.post('/requests', requireAuth, async (req, res) => {
  const { citizenId, documentType } = req.body;
  const request = await prisma.documentRequest.create({
    data: { citizenId, documentType, status: 'submitted' }
  });
  return res.status(201).json(request);
});

app.get('/v1/requests', requireAuth, async (req, res) => {
  const citizenId = req.query.citizenId ? parseInt(req.query.citizenId, 10) : null;
  const where = citizenId ? { citizenId } : {};
  return res.json(await prisma.documentRequest.findMany({ where, orderBy: { submittedAt: 'desc' } }));
});

app.get('/requests', requireAuth, async (req, res) => {
  const citizenId = req.query.citizenId ? parseInt(req.query.citizenId, 10) : null;
  const where = citizenId ? { citizenId } : {};
  return res.json(await prisma.documentRequest.findMany({ where, orderBy: { submittedAt: 'desc' } }));
});

app.patch('/v1/requests/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await prisma.documentRequest.update({
    where: { id },
    data: { status: req.body.status, reviewedBy: req.body.reviewedBy }
  });
  if (updated.status === 'approved') {
    await publishEventSafe({
      topic: TOPICS.DOCUMENT_APPROVED,
      eventType: TOPICS.DOCUMENT_APPROVED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { requestId: updated.id, citizenId: updated.citizenId, actor: req.user?.email }
    });
  } else if (updated.status === 'rejected') {
    await publishEventSafe({
      topic: TOPICS.DOCUMENT_REJECTED,
      eventType: TOPICS.DOCUMENT_REJECTED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { requestId: updated.id, citizenId: updated.citizenId, actor: req.user?.email }
    });
  }
  return res.json(updated);
});

app.patch('/requests/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await prisma.documentRequest.update({
    where: { id },
    data: { status: req.body.status, reviewedBy: req.body.reviewedBy }
  });
  if (updated.status === 'approved') {
    await publishEventSafe({
      topic: TOPICS.DOCUMENT_APPROVED,
      eventType: TOPICS.DOCUMENT_APPROVED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { requestId: updated.id, citizenId: updated.citizenId, actor: req.user?.email }
    });
  } else if (updated.status === 'rejected') {
    await publishEventSafe({
      topic: TOPICS.DOCUMENT_REJECTED,
      eventType: TOPICS.DOCUMENT_REJECTED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { requestId: updated.id, citizenId: updated.citizenId, actor: req.user?.email }
    });
  }
  return res.json(updated);
});

app.get('/verify-remote', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query parameter is required' });
  if (url === 'http://internal.lamba/metadata/registry') {
    const flag = ctfFlags.a10SsrF();
    return res.json({
      source: 'internal-registry',
      registryVersion: '2024.1',
      records: [{ id: 'REG-001', status: 'active' }],
      ...(flag ? { flag } : {})
    });
  }
  try {
    const response = await fetch(url);
    const body = await response.text();
    return res.json({ requestedUrl: url, status: response.status, body });
  } catch (err) {
    return res.status(500).json({ error: 'Remote verification failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on ${PORT}`);
});

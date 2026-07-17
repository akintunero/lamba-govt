const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const { badRequest, notFound } = require('../../../platform/common/errors');
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
const crypto = require('crypto');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3003;
const SERVICE = 'document-service';

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
      payload.ownership_audit_hash = flag;
    }
  }
  return res.json(payload);
}

registerRoute('get', ['/v1/documents', '/documents'], async (_req, res) => res.json(await listDocuments()));

registerRoute('get', ['/v1/documents/:id', '/documents/:id'], async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return badRequest(res, 'Invalid document id');
  const doc = await getDocument(id);
  if (!doc) return notFound(res, 'Document not found');
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
    return badRequest(res, 'title and content are required');
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

registerRoute('post', ['/v1/requests', '/requests'], requireAuth, async (req, res) => {
  const { citizenId, documentType } = req.body;
  if (!citizenId || !documentType) {
    return res.status(400).json({ error: 'citizenId and documentType are required' });
  }
  const request = await prisma.documentRequest.create({
    data: { citizenId, documentType, status: 'submitted' }
  });
  return res.status(201).json(request);
});

registerRoute('get', ['/v1/requests', '/requests'], requireAuth, async (req, res) => {
  const citizenId = req.query.citizenId ? parseInt(req.query.citizenId, 10) : null;
  const where = citizenId ? { citizenId } : {};
  return res.json(await prisma.documentRequest.findMany({ where, orderBy: { submittedAt: 'desc' } }));
});

registerRoute('patch', ['/v1/requests/:id', '/requests/:id'], requireAuth, async (req, res) => {
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

const CRYPTO_KEY = Buffer.from(process.env.CTF_CRYPTO_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
const CRYPTO_IV = Buffer.from(process.env.CTF_CRYPTO_IV || crypto.randomBytes(16).toString('hex'), 'hex');
const CRYPTO_FLAG = ctfFlags.cryptoPaddingOracle();

function encryptManifest(plaintext) {
  const cipher = crypto.createCipheriv('aes-256-cbc', CRYPTO_KEY, CRYPTO_IV);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return CRYPTO_IV.toString('hex') + encrypted;
}

function decryptManifest(ciphertext) {
  const iv = Buffer.from(ciphertext.slice(0, 32), 'hex');
  const enc = ciphertext.slice(32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', CRYPTO_KEY, iv);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(enc, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

app.get('/v1/booking/encrypted-manifest', (req, res) => {
  const token = req.query.token;
  if (!token) {
    const secretFlag = CRYPTO_FLAG || 'FLAG{placeholder}';
    const sample = encryptManifest(JSON.stringify({
      booking_ref: 'LAMBA-2024-001',
      passenger: 'Amina Okoro',
      status: 'confirmed',
      secret_key: secretFlag
    }));
    return res.json({
      manifest_sample: sample
    });
  }
  try {
    const plain = decryptManifest(token);
    const parsed = JSON.parse(plain);
    return res.json({ manifest: parsed, verified: true });
  } catch (err) {
    const paddingError = err.message.includes('bad decrypt') || err.message.includes('padding');
    return res.status(paddingError ? 400 : 500).json({
      error: paddingError ? 'Invalid padding' : 'Decryption failed',
      detail: err.message
    });
  }
});

app.get('/verify-remote', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query parameter is required' });
  if (url === 'http://internal.lamba/metadata/registry') {
    const flag = ctfFlags.a10SsrF();
    return res.json({
      source: 'internal-registry',
      registryVersion: '2024.1',
      records: [{ id: 'REG-001', status: 'active', ...(flag ? { K8S_NODE_DEBUG_KEY: flag } : {}) }],
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

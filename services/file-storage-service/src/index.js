const express = require('express');
const crypto = require('crypto');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { getClient, ensureBuckets } = require('./minio');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3007;
const SERVICE = 'file-storage-service';

app.use(express.json({ limit: '10mb' }));
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE));
});

app.post('/v1/objects/upload', async (req, res) => {
  const { bucket, filename, content, mimeType, citizenId, documentId } = req.body;
  if (!bucket || !filename || !content) {
    return res.status(400).json({ error: 'bucket, filename, and content are required' });
  }
  const minio = getClient();
  const objectKey = `${Date.now()}-${filename}`;
  const buffer = Buffer.from(content, 'base64');
  await minio.putObject(bucket, objectKey, buffer, buffer.length, {
    'Content-Type': mimeType || 'application/octet-stream'
  });
  const record = await prisma.storedFile.create({
    data: {
      bucket,
      objectKey,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      citizenId: citizenId || null,
      documentId: documentId || null,
      metadata: JSON.stringify({ uploadedBy: req.user?.email || 'service' })
    }
  });
  return res.status(201).json(record);
});

app.get('/v1/objects/:bucket/:objectKey', async (req, res) => {
  const { bucket, objectKey } = req.params;
  const record = await prisma.storedFile.findFirst({ where: { bucket, objectKey } });
  if (!record) {
    return res.status(404).json({ error: 'Object not found' });
  }
  const minio = getClient();
  const stream = await minio.getObject(bucket, objectKey);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  return res.json({
    metadata: record,
    content: data.toString('base64')
  });
});

app.get('/v1/objects/:bucket/:objectKey/signed-url', async (req, res) => {
  const { bucket, objectKey } = req.params;
  const expiry = parseInt(req.query.expiry || '3600', 10);
  const minio = getClient();
  const url = await minio.presignedGetObject(bucket, objectKey, expiry);
  return res.json({ url, expiresIn: expiry });
});

app.post('/v1/objects/:bucket/:objectKey/archive', requireAuth, async (req, res) => {
  const { bucket, objectKey } = req.params;
  const minio = getClient();
  const stream = await minio.getObject(bucket, objectKey);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const archiveKey = `archived/${objectKey}`;
  await minio.putObject('lamba-archives', archiveKey, data, data.length);
  await prisma.storedFile.updateMany({
    where: { bucket, objectKey },
    data: { status: 'archived', bucket: 'lamba-archives', objectKey: archiveKey }
  });
  return res.json({ archived: true, bucket: 'lamba-archives', objectKey: archiveKey });
});

app.get('/v1/objects/citizen/:citizenId/history', async (req, res) => {
  const citizenId = parseInt(req.params.citizenId, 10);
  const files = await prisma.storedFile.findMany({
    where: { citizenId },
    orderBy: { createdAt: 'desc' }
  });
  return res.json({ citizenId, files });
});

app.get('/v1/buckets', async (_req, res) => {
  const minio = getClient();
  const buckets = await minio.listBuckets();
  return res.json({ buckets: buckets.map((b) => b.name) });
});

async function start() {
  await ensureBuckets();
  app.listen(PORT, () => {
    console.log(`${SERVICE} listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

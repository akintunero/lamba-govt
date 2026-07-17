const { serviceFetch } = require('./http');

const STORAGE_URL = process.env.FILE_STORAGE_SERVICE_URL;

async function uploadObject({ bucket, filename, content, mimeType, citizenId, documentId, correlationId }) {
  return serviceFetch(STORAGE_URL, '/v1/objects/upload', {
    method: 'POST',
    correlationId,
    body: { bucket, filename, content, mimeType, citizenId, documentId }
  });
}

async function getSignedUrl({ bucket, objectKey, expirySeconds, correlationId }) {
  return serviceFetch(STORAGE_URL, `/v1/objects/${bucket}/${encodeURIComponent(objectKey)}/signed-url?expiry=${expirySeconds || 3600}`, {
    correlationId
  });
}

async function getObjectMetadata({ bucket, objectKey, correlationId }) {
  return serviceFetch(STORAGE_URL, `/v1/objects/${bucket}/${encodeURIComponent(objectKey)}`, { correlationId });
}

async function archiveObject({ bucket, objectKey, correlationId }) {
  return serviceFetch(STORAGE_URL, `/v1/objects/${bucket}/${encodeURIComponent(objectKey)}/archive`, {
    method: 'POST',
    correlationId
  });
}

async function getCitizenHistory(citizenId, correlationId) {
  return serviceFetch(STORAGE_URL, `/v1/objects/citizen/${citizenId}/history`, { correlationId });
}

module.exports = {
  uploadObject,
  getSignedUrl,
  getObjectMetadata,
  archiveObject,
  getCitizenHistory
};

const Minio = require('minio');
const fs = require('fs');

const BUCKETS = ['lamba-documents', 'lamba-archives', 'lamba-citizen-uploads'];

let client;

function readSecret(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return undefined;
  }
}

function getClient() {
  if (!client) {
    // Prefer env-provided credentials; fall back to the secret files. This
    // avoids stale secret-file values being used when env is already correct.
    const accessKey = process.env.MINIO_ACCESS_KEY || readSecret('/secrets/minio-root-user');
    const secretKey = process.env.MINIO_SECRET_KEY || readSecret('/secrets/minio-root-password');
    client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey
    });
  }
  return client;
}

async function ensureBuckets() {
  const minio = getClient();
  for (const bucket of BUCKETS) {
    const exists = await minio.bucketExists(bucket);
    if (!exists) {
      await minio.makeBucket(bucket, process.env.MINIO_REGION || 'us-east-1');
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`]
          }
        ]
      };
      await minio.setBucketPolicy(bucket, JSON.stringify(policy));
    }
  }
}

module.exports = { getClient, ensureBuckets, BUCKETS };

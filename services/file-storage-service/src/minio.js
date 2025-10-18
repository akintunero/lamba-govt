const Minio = require('minio');

const BUCKETS = ['lamba-documents', 'lamba-archives', 'lamba-citizen-uploads'];

let client;

function getClient() {
  if (!client) {
    client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'lamba',
      secretKey: process.env.MINIO_SECRET_KEY || 'lamba-secret-key'
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

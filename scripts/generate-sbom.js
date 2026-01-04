#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const artifactsDir = path.join(root, 'artifacts', 'sbom');
fs.mkdirSync(artifactsDir, { recursive: true });

const services = fs.readdirSync(path.join(root, 'services'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const components = [
  ...services.map((s) => ({ type: 'service', name: s })),
  { type: 'gateway', name: 'api-gateway' },
  { type: 'frontend', name: 'frontend' },
  { type: 'database', name: 'postgresql' },
  { type: 'storage', name: 'minio' }
];

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { name: 'lamba-digital-services-platform', version: '2.0.0' }
  },
  components: components.map((c) => ({
    type: 'application',
    name: c.name,
    group: c.type
  }))
};

fs.writeFileSync(path.join(artifactsDir, 'sbom.json'), JSON.stringify(sbom, null, 2));
console.log('SBOM generated');

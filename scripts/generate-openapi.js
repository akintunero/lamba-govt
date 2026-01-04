#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const openapiDir = path.join(root, 'openapi');
const artifactsDir = path.join(root, 'artifacts');
const specs = ['auth', 'citizen', 'document', 'admin', 'reporting', 'identity', 'search', 'legacy-records'];

fs.mkdirSync(path.join(artifactsDir, 'openapi'), { recursive: true });
fs.mkdirSync(path.join(artifactsDir, 'identity'), { recursive: true });
fs.mkdirSync(path.join(artifactsDir, 'search'), { recursive: true });

for (const spec of specs) {
  const source = path.join(openapiDir, `${spec}.yaml`);
  const target = path.join(artifactsDir, 'openapi', `${spec}.yaml`);
  if (!fs.existsSync(source)) {
    console.error(`Missing spec: ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(source, target);
  console.log(`Generated ${target}`);
}

fs.copyFileSync(
  path.join(root, 'platform/keycloak/lamba-platform-realm.json'),
  path.join(artifactsDir, 'identity', 'lamba-platform-realm.json')
);
fs.copyFileSync(
  path.join(root, 'platform/opensearch/mappings.json'),
  path.join(artifactsDir, 'search', 'mappings.json')
);

const manifest = {
  generatedAt: new Date().toISOString(),
  specifications: specs.map((s) => ({ name: s, path: `artifacts/openapi/${s}.yaml` })),
  identity: 'artifacts/identity/lamba-platform-realm.json',
  searchMappings: 'artifacts/search/mappings.json'
};
fs.writeFileSync(path.join(artifactsDir, 'openapi', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('OpenAPI generation complete');

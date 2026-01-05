#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const openapiDir = path.join(__dirname, '../openapi');
const specs = fs.readdirSync(openapiDir).filter((f) => f.endsWith('.yaml'));

let failed = false;
for (const spec of specs) {
  const content = fs.readFileSync(path.join(openapiDir, spec), 'utf8');
  if (!content.includes('openapi:') || !content.includes('paths:')) {
    console.error(`Invalid OpenAPI spec: ${spec}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('OpenAPI validation passed');
console.log(`Specifications validated: ${specs.length}`);

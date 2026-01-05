#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const mappingsPath = path.join(__dirname, '../platform/opensearch/mappings.json');
const commonPath = path.join(__dirname, '../platform/common/opensearch.js');

const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
const required = ['citizens', 'documents', 'audit_logs', 'reports', 'notifications'];

let failed = false;
for (const index of required) {
  if (!mappings[index]?.mappings?.properties) {
    console.error(`Missing mapping for index: ${index}`);
    failed = true;
  }
}

if (!fs.existsSync(commonPath)) {
  console.error('OpenSearch client module missing');
  failed = true;
}

if (failed) process.exit(1);
console.log('Search index mapping validation passed');
console.log(`Indexes validated: ${required.length}`);

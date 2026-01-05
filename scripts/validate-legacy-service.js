#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const serviceIndex = path.join(__dirname, '../services/legacy-records-service/src/index.js');
const schemaPath = path.join(__dirname, '../platform/db/legacy/schema.sql');
const openapiPath = path.join(__dirname, '../openapi/legacy-records.yaml');

let failed = false;

for (const file of [serviceIndex, schemaPath, openapiPath]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing legacy service asset: ${file}`);
    failed = true;
  }
}

const schema = fs.readFileSync(schemaPath, 'utf8');
for (const table of ['legacy_citizens', 'legacy_documents', 'legacy_cases', 'legacy_compliance_reports']) {
  if (!schema.includes(table)) {
    console.error(`Missing table in schema: ${table}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Legacy service validation passed');

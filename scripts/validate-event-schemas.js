#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateEvent, buildEvent, ALL_TOPICS } = require('../platform/common/events');

const schemaPath = path.join(__dirname, '../platform/kafka/event-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

let failed = false;

for (const topic of schema.topics) {
  if (!ALL_TOPICS.includes(topic)) {
    console.error(`Topic ${topic} missing from platform topic registry`);
    failed = true;
  }
}

for (const topic of ALL_TOPICS) {
  if (!schema.topics.includes(topic)) {
    console.error(`Registry topic ${topic} missing from event-schema.json`);
    failed = true;
  }
}

const sample = buildEvent({
  eventType: 'citizen.created',
  sourceService: 'citizen-service',
  correlationId: '00000000-0000-4000-8000-000000000001',
  payload: { citizenId: 1 }
});

const validation = validateEvent(sample);
if (!validation.valid) {
  console.error('Sample event validation failed:', validation.errors);
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log('Event schema validation passed');
console.log(`Topics validated: ${schema.topics.length}`);

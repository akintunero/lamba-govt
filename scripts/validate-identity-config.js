#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const realmPath = path.join(__dirname, '../platform/keycloak/lamba-platform-realm.json');
const realm = JSON.parse(fs.readFileSync(realmPath, 'utf8'));

const requiredRoles = ['citizen', 'employee', 'supervisor', 'compliance_officer', 'administrator', 'platform_operator'];
const requiredClients = ['citizen-portal', 'admin-console', 'api-gateway', 'internal-services'];

let failed = false;

for (const role of requiredRoles) {
  if (!realm.roles?.realm?.some((r) => r.name === role)) {
    console.error(`Missing realm role: ${role}`);
    failed = true;
  }
}

for (const clientId of requiredClients) {
  if (!realm.clients?.some((c) => c.clientId === clientId)) {
    console.error(`Missing client: ${clientId}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Identity configuration validation passed');
console.log(`Roles: ${requiredRoles.length}, Clients: ${requiredClients.length}`);

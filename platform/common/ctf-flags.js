'use strict';

function readFlag(envName) {
  const value = process.env[envName];
  return typeof value === 'string' ? value : '';
}

module.exports = {
  a01Idor: () => readFlag('CTF_FLAG_A01_IDOR'),
  a02JwtForge: () => readFlag('CTF_FLAG_A02_JWT_FORGE'),
  a03Sqli: () => readFlag('CTF_FLAG_A03_SQLI'),
  a05InternalGateway: () => readFlag('CTF_FLAG_A05_INTERNAL_GATEWAY'),
  a05MetricsLine: () => readFlag('CTF_FLAG_A05_METRICS_LINE'),
  a07SessionFixation: () => readFlag('CTF_FLAG_A07_SESSION_FIXATION'),
  a08MassAssignment: () => readFlag('CTF_FLAG_A08_MASS_ASSIGNMENT'),
  a09AuditSpoof: () => readFlag('CTF_FLAG_A09_AUDIT_SPOOF'),
  a10SsrF: () => readFlag('CTF_FLAG_A10_SSRF'),
  a10Diagnostics: () => readFlag('CTF_FLAG_A10_DIAGNOSTICS')
};

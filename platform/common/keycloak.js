const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'lamba-platform';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'internal-services';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;

const ROLE_MAP = {
  citizen: 'citizen',
  employee: 'employee',
  supervisor: 'supervisor',
  compliance_officer: 'compliance_officer',
  administrator: 'administrator',
  platform_operator: 'platform_operator',
  admin: 'administrator'
};

let jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 5 * 60 * 1000;

const identityMetrics = {
  tokensValidated: 0,
  tokensRejected: 0,
  introspections: 0
};

function isKeycloakEnabled() {
  return process.env.KEYCLOAK_ENABLED === 'true';
}

function getIssuer() {
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;
}

async function fetchJwks() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(`${getIssuer()}/protocol/openid-connect/certs`);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }
  const body = await response.json();
  jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

function jwkToPem(jwk) {
  if (jwk.x5c && jwk.x5c[0]) {
    const cert = `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0]}\n-----END CERTIFICATE-----`;
    return cert;
  }
  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return keyObject.export({ type: 'spki', format: 'pem' });
}

async function verifyKeycloakToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header?.kid) return null;
    const keys = await fetchJwks();
    const jwk = keys.find((k) => k.kid === decoded.header.kid);
    if (!jwk) return null;
    const pem = jwkToPem(jwk);
    const payload = jwt.verify(token, pem, {
      algorithms: ['RS256'],
      issuer: getIssuer()
    });
    identityMetrics.tokensValidated += 1;
    return mapKeycloakUser(payload);
  } catch {
    identityMetrics.tokensRejected += 1;
    return null;
  }
}

function mapKeycloakUser(payload) {
  const realmRoles = payload.realm_access?.roles || [];
  const platformRole = realmRoles.find((r) => ROLE_MAP[r]) || 'citizen';
  const mappedRole = ROLE_MAP[platformRole] || platformRole;
  return {
    userId: payload.sub,
    email: payload.email || payload.preferred_username,
    role: mappedRole,
    roles: realmRoles,
    employeeId: payload.employee_id || null,
    citizenId: payload.citizen_id ? parseInt(payload.citizen_id, 10) : null,
    keycloak: true,
    azp: payload.azp
  };
}

async function introspectToken(token) {
  identityMetrics.introspections += 1;
  const body = new URLSearchParams({
    token,
    client_id: KEYCLOAK_CLIENT_ID,
    client_secret: KEYCLOAK_CLIENT_SECRET
  });
  const response = await fetch(`${getIssuer()}/protocol/openid-connect/token/introspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) return { active: false };
  return response.json();
}

async function clientCredentialsToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: KEYCLOAK_CLIENT_ID,
    client_secret: KEYCLOAK_CLIENT_SECRET
  });
  const response = await fetch(`${getIssuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error('Client credentials token request failed');
  return response.json();
}

async function passwordGrant({ username, password, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    username,
    password,
    scope: 'openid profile email'
  });
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }
  const response = await fetch(`${getIssuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token request failed: ${err}`);
  }
  return response.json();
}

async function refreshTokenGrant({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret || '',
    refresh_token: refreshToken
  });
  const response = await fetch(`${getIssuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error('Refresh token request failed');
  return response.json();
}

function keycloakPrometheusMetrics(serviceName) {
  return [
    `# HELP keycloak_tokens_validated_total Keycloak tokens validated`,
    `# TYPE keycloak_tokens_validated_total counter`,
    `keycloak_tokens_validated_total{service="${serviceName}"} ${identityMetrics.tokensValidated}`,
    `# HELP keycloak_tokens_rejected_total Keycloak tokens rejected`,
    `# TYPE keycloak_tokens_rejected_total counter`,
    `keycloak_tokens_rejected_total{service="${serviceName}"} ${identityMetrics.tokensRejected}`,
    `# HELP keycloak_token_introspections_total Token introspection calls`,
    `# TYPE keycloak_token_introspections_total counter`,
    `keycloak_token_introspections_total{service="${serviceName}"} ${identityMetrics.introspections}`
  ].join('\n') + '\n';
}

module.exports = {
  isKeycloakEnabled,
  verifyKeycloakToken,
  introspectToken,
  clientCredentialsToken,
  passwordGrant,
  refreshTokenGrant,
  mapKeycloakUser,
  keycloakPrometheusMetrics,
  getIssuer,
  KEYCLOAK_REALM,
  KEYCLOAK_URL
};

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const crypto = require('crypto');
const path = require('path');
const { isKeycloakEnabled, verifyKeycloakToken } = require(path.join(__dirname, '../../platform/common/keycloak'));

const app = express();
const PORT = process.env.PORT || 8080;

const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  citizen: process.env.CITIZEN_SERVICE_URL || 'http://citizen-service:3002',
  document: process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3003',
  admin: process.env.ADMIN_SERVICE_URL || 'http://admin-service:3004',
  audit: process.env.AUDIT_SERVICE_URL || 'http://audit-service:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006',
  storage: process.env.FILE_STORAGE_SERVICE_URL || 'http://file-storage-service:3007',
  reporting: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3008',
  metrics: process.env.METRICS_SERVICE_URL || 'http://metrics-service:3009',
  search: process.env.SEARCH_SERVICE_URL || 'http://search-service:3010',
  legacy: process.env.LEGACY_RECORDS_SERVICE_URL || 'http://legacy-records-service:3011'
};

const PUBLIC_PATHS = [
  '/health',
  '/api/health/services',
  '/api/auth/login',
  '/api/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/oidc',
  '/api/auth/v1/oidc',
  '/openapi'
];

app.use(async (req, res, next) => {
  const correlationId = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = correlationId;
  res.setHeader('X-Request-Id', correlationId);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Service-Token, X-Legacy-Session');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  if (isKeycloakEnabled() && req.headers.authorization?.startsWith('Bearer ')) {
    const isPublic = PUBLIC_PATHS.some((p) => req.path.startsWith(p));
    if (!isPublic) {
      const token = req.headers.authorization.slice(7);
      const user = await verifyKeycloakToken(token);
      if (user) {
        req.keycloakUser = user;
        req.headers['x-user-role'] = user.role;
        req.headers['x-user-email'] = user.email || '';
      }
    }
  }
  next();
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function proxy(target, pathRewrite) {
  return createProxyMiddleware({ target, changeOrigin: true, pathRewrite });
}

function publicGatewayProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    onProxyReq(proxyReq, req) {
      proxyReq.setHeader('X-Lamba-Gateway-Proxy', 'true');
      const clientIp = getClientIp(req);
      if (clientIp) {
        proxyReq.setHeader('X-Forwarded-Client-Ip', clientIp);
      }
    }
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: 'lamba-api-gateway', version: '3.0.0', keycloak: isKeycloakEnabled() });
});

app.get('/api/health/services', async (_req, res) => {
  const checks = await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const response = await fetch(`${url}/health`);
        return { name, status: response.ok ? 'up' : 'down' };
      } catch {
        return { name, status: 'down' };
      }
    })
  );
  res.json({ services: checks });
});

app.get('/openapi/:spec', (req, res) => {
  const allowed = ['auth', 'citizen', 'document', 'admin', 'reporting', 'legacy-records', 'search', 'identity'];
  if (!allowed.includes(req.params.spec)) {
    return res.status(404).json({ error: 'Specification not found' });
  }
  res.sendFile(`${process.cwd()}/openapi/${req.params.spec}.yaml`);
});

app.use('/api/v1/auth', proxy(services.auth, { '^/api/v1/auth': '/v1' }));
app.use('/api/v2/auth', proxy(services.auth, { '^/api/v2/auth': '/v2' }));
app.use('/api/v1/oidc', proxy(services.auth, { '^/api/v1/oidc': '/v1/oidc' }));
app.use('/api/v1/citizens', proxy(services.citizen, { '^/api/v1/citizens': '/v1/citizens' }));
app.use('/api/v1/documents', proxy(services.document, { '^/api/v1/documents': '/v1/documents' }));
app.use('/api/v2/documents', proxy(services.document, { '^/api/v2/documents': '/v2/documents' }));
app.use('/api/v1/requests', proxy(services.document, { '^/api/v1/requests': '/v1/requests' }));
app.use('/api/v1/admin', proxy(services.admin, { '^/api/v1/admin': '/v1' }));
app.use('/api/v1/reports', proxy(services.reporting, { '^/api/v1/reports': '/v1/reports' }));
app.use('/api/v1/storage', proxy(services.storage, { '^/api/v1/storage': '/v1' }));
app.use('/api/v1/search', proxy(services.search, { '^/api/v1/search': '/v1/search' }));
app.use('/api/v1/legacy', proxy(services.legacy, { '^/api/v1/legacy': '/legacy/v1' }));

app.use('/api/auth', proxy(services.auth, { '^/api/auth': '' }));
app.use('/api/citizens', proxy(services.citizen, { '^/api/citizens': '/citizens' }));
app.use('/api/employees', proxy(services.citizen, { '^/api/employees': '/employees' }));
app.use('/api/staff', proxy(services.citizen, { '^/api/staff': '/staff' }));
app.use('/api/documents', proxy(services.document, { '^/api/documents': '/documents' }));
app.use('/api/requests', proxy(services.document, { '^/api/requests': '/requests' }));
app.use('/api/admin', proxy(services.admin, { '^/api/admin': '' }));
app.use('/api/audit', proxy(services.audit, { '^/api/audit': '' }));
app.use('/api/notifications', proxy(services.notification, { '^/api/notifications': '' }));
app.use('/api/reports', proxy(services.reporting, { '^/api/reports': '/v1/reports' }));
app.use('/api/storage', proxy(services.storage, { '^/api/storage': '/v1' }));
app.use('/api/metrics', proxy(services.metrics, { '^/api/metrics': '' }));
app.use('/api/search', proxy(services.search, { '^/api/search': '/v1/search' }));
app.use('/api/legacy', proxy(services.legacy, { '^/api/legacy': '/legacy/v1' }));

app.use('/api/internal-proxy', proxy(services.document, { '^/api/internal-proxy': '/verify-remote' }));
app.use('/api/internal', publicGatewayProxy(services.audit, { '^/api/internal': '/internal' }));

app.use('/api/v1/staff-directory', proxy(services.citizen, { '^/api/v1/staff-directory': '/staff/directory' }));
app.use('/api/approve-grant', proxy(services.admin, { '^/api/approve-grant': '/grants/approve' }));
app.use('/api/employee', proxy(services.citizen, { '^/api/employee': '/employees' }));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`api-gateway listening on ${PORT}`);
});

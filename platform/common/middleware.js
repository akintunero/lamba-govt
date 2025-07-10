const crypto = require('crypto');

const SERVICE_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1';

function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-request-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Request-Id', correlationId);
  next();
}

function serviceAuthMiddleware(req, res, next) {
  const token = req.headers['x-service-token'];
  if (token) {
    req.serviceIdentity = token === SERVICE_TOKEN ? { verified: true } : { verified: false };
  }
  next();
}

function requestLogMiddleware(serviceName) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.REQUEST_ACCESS_LOGS !== 'true') {
        return;
      }
      const route = req.route?.path || 'unmatched';
      console.log(JSON.stringify({
        service: serviceName,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Date.now() - start,
        correlationId: req.correlationId || null
      }));
    });
    next();
  };
}

const metrics = {
  requests: {},
  increment(service, route, status) {
    const key = `${service}:${route}:${status}`;
    this.requests[key] = (this.requests[key] || 0) + 1;
  },
  prometheus(serviceName) {
    const lines = [`# HELP http_requests_total Total HTTP requests`, `# TYPE http_requests_total counter`];
    for (const [key, count] of Object.entries(this.requests)) {
      if (key.startsWith(`${serviceName}:`)) {
        const [, route, status] = key.split(':');
        lines.push(`http_requests_total{service="${serviceName}",route="${route}",status="${status}"} ${count}`);
      }
    }
    return lines.join('\n') + '\n';
  }
};

function metricsMiddleware(serviceName) {
  return (req, res, next) => {
    res.on('finish', () => {
      metrics.increment(serviceName, req.route?.path || req.path, res.statusCode);
    });
    next();
  };
}

module.exports = {
  SERVICE_TOKEN,
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
};

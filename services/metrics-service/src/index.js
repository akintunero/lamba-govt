const express = require('express');
const {
  correlationMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const ctfFlags = require('../../../platform/common/ctf-flags');

const app = express();
const PORT = process.env.PORT || 3009;
const SERVICE = 'metrics-service';

const SERVICE_TARGETS = [
  { name: 'auth-service', url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001' },
  { name: 'citizen-service', url: process.env.CITIZEN_SERVICE_URL || 'http://citizen-service:3002' },
  { name: 'document-service', url: process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3003' },
  { name: 'admin-service', url: process.env.ADMIN_SERVICE_URL || 'http://admin-service:3004' },
  { name: 'audit-service', url: process.env.AUDIT_SERVICE_URL || 'http://audit-service:3005' },
  { name: 'notification-service', url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006' },
  { name: 'file-storage-service', url: process.env.FILE_STORAGE_SERVICE_URL || 'http://file-storage-service:3007' },
  { name: 'reporting-service', url: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3008' }
];

app.use(correlationMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE,
    mode: 'local-aggregate',
    note: 'In-process metrics only; no external Prometheus/Loki exporters'
  });
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE));
});

function appendCtfMetricLine(metricsText) {
  const ctfLine = ctfFlags.a05MetricsLine();
  if (!ctfLine) {
    return typeof metricsText === 'string' ? metricsText : '';
  }
  const base = typeof metricsText === 'string' ? metricsText.trimEnd() : '';
  return base ? `${base}\n${ctfLine}\n` : `${ctfLine}\n`;
}

app.get('/v1/metrics/aggregate', async (_req, res) => {
  const collected = await Promise.all(
    SERVICE_TARGETS.map(async (target) => {
      try {
        const response = await fetch(`${target.url}/metrics`);
        const body = await response.text();
        return { name: target.name, status: 'up', metrics: body };
      } catch {
        return { name: target.name, status: 'down', metrics: '' };
      }
    })
  );
  const collectedWithFlag = collected.map((entry) => ({
    ...entry,
    metrics: appendCtfMetricLine(entry.metrics)
  }));
  const prometheusStream = collectedWithFlag.map((entry) => entry.metrics).join('');
  res.json({
    collected: collectedWithFlag,
    prometheusStream,
    timestamp: new Date().toISOString()
  });
});

app.get('/v1/metrics/prometheus', async (_req, res) => {
  const parts = [metrics.prometheus(SERVICE)];
  for (const target of SERVICE_TARGETS) {
    try {
      const response = await fetch(`${target.url}/metrics`);
      if (response.ok) {
        parts.push(await response.text());
      }
    } catch {
      parts.push(`service_up{service="${target.name}"} 0`);
    }
  }
  res.set('Content-Type', 'text/plain');
  res.send(parts.join('\n'));
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on ${PORT}`);
});

const express = require('express');
const { attachUser, requireAuth, requireRole } = require('../../../platform/common/auth');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const {
  ensureIndexes,
  searchIndex,
  searchPrometheusMetrics,
  getSearchBackend
} = require('../../../platform/common/opensearch');
const { startSearchConsumer, reindexFromDatabase } = require('./consumer');

const app = express();
const PORT = process.env.PORT || 3010;
const SERVICE = 'search-service';

app.use(express.json());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, searchBackend: getSearchBackend() });
});
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE) + searchPrometheusMetrics(SERVICE));
});

function parseSearchParams(req) {
  return {
    query: req.query.q || req.query.query || '',
    filters: req.query.status ? { status: req.query.status } : {},
    from: parseInt(req.query.from || '0', 10),
    size: Math.min(parseInt(req.query.size || '20', 10), 100),
    sort: req.query.sort ? [{ [req.query.sort]: req.query.order || 'desc' }] : undefined
  };
}

async function runSearch(res, index, params) {
  try {
    const result = await searchIndex(index, params);
    return res.json(result);
  } catch (err) {
    console.error(JSON.stringify({ component: SERVICE, index, error: err.message }));
    return res.status(503).json({ error: 'Search unavailable', detail: err.message });
  }
}

app.get('/v1/search/citizens', requireAuth, async (req, res) => runSearch(res, 'citizens', parseSearchParams(req)));

app.get('/v1/search/documents', requireAuth, async (req, res) => runSearch(res, 'documents', parseSearchParams(req)));

app.get('/v1/search/audit', requireAuth, requireRole('administrator', 'compliance_officer', 'supervisor'), async (req, res) => {
  return runSearch(res, 'audit_logs', parseSearchParams(req));
});

app.get('/v1/search/reports', requireAuth, requireRole('administrator', 'compliance_officer'), async (req, res) => {
  return runSearch(res, 'reports', parseSearchParams(req));
});

app.get('/v1/search/notifications', requireAuth, async (req, res) => {
  const params = parseSearchParams(req);
  if (req.user?.userId) {
    params.filters.userId = req.user.userId;
  }
  return runSearch(res, 'notifications', params);
});

app.post('/v1/search/reindex', requireAuth, requireRole('administrator', 'platform_operator'), async (_req, res) => {
  try {
    await reindexFromDatabase();
    return res.json({ status: 'reindex_complete', searchBackend: getSearchBackend() });
  } catch (err) {
    console.error(JSON.stringify({ component: SERVICE, action: 'reindex', error: err.message }));
    return res.status(503).json({ error: 'Reindex failed', detail: err.message });
  }
});

app.get('/v1/search/aggregate/:index', requireAuth, requireRole('administrator', 'compliance_officer'), async (req, res) => {
  try {
    const result = await searchIndex(req.params.index, { query: '', size: 0, from: 0 });
    return res.json({ index: req.params.index, facets: result.facets, total: result.total });
  } catch (err) {
    console.error(JSON.stringify({ component: SERVICE, index: req.params.index, error: err.message }));
    return res.status(503).json({ error: 'Search unavailable', detail: err.message });
  }
});

async function bootstrap() {
  app.listen(PORT);
  try {
    await ensureIndexes();
  } catch (err) {
    console.error(JSON.stringify({
      component: SERVICE,
      warning: 'Search index init failed; in-memory fallback active',
      error: err.message
    }));
  }
  try {
    await startSearchConsumer();
  } catch (err) {
    console.error(JSON.stringify({
      component: 'search-consumer',
      warning: 'Kafka consumer unavailable; HTTP search API remains available',
      error: err.message
    }));
  }
}

bootstrap();

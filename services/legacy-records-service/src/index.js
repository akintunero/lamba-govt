const express = require('express');
const { getLegacyPool } = require('../../../platform/common/legacy-db');
const { attachUser, requireAuth, requireRole } = require('../../../platform/common/auth');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { publishEventSafe, kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { TOPICS } = require('../../../platform/common/events');
const { serviceFetch } = require('../../../platform/common/http');

const app = express();
const pool = getLegacyPool();
const PORT = process.env.PORT || 3011;
const SERVICE = 'legacy-records-service';
const CITIZEN_SERVICE_URL = process.env.CITIZEN_SERVICE_URL || 'http://citizen-service:3002';

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/xml', 'application/xml'], limit: '2mb' }));
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE, system: 'govrecords-v1' }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE));
});

app.get('/legacy/v1/citizens', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const status = req.query.status;
  let query = 'SELECT * FROM legacy_citizens';
  const params = [];
  if (status) {
    query += ' WHERE status = $1';
    params.push(status);
  }
  query += ` ORDER BY legacy_id LIMIT ${limit} OFFSET ${offset}`;
  const result = await pool.query(query, params);
  return res.json({ records: result.rows, format: 'legacy-json-v1', count: result.rowCount });
});

app.get('/legacy/v1/citizens/:nationalId', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM legacy_citizens WHERE national_id = $1', [req.params.nationalId]);
  if (!result.rowCount) {
    return res.status(404).json({ error: 'Legacy citizen record not found' });
  }
  const docs = await pool.query('SELECT * FROM legacy_documents WHERE legacy_citizen_id = $1', [result.rows[0].legacy_id]);
  const cases = await pool.query('SELECT * FROM legacy_cases WHERE legacy_citizen_id = $1', [result.rows[0].legacy_id]);
  return res.json({ citizen: result.rows[0], documents: docs.rows, cases: cases.rows });
});

app.get('/legacy/v1/documents', requireAuth, async (req, res) => {
  const result = await pool.query(`
    SELECT d.*, c.national_id, c.full_name
    FROM legacy_documents d
    JOIN legacy_citizens c ON c.legacy_id = d.legacy_citizen_id
    ORDER BY d.legacy_doc_id DESC LIMIT 100
  `);
  return res.json({ documents: result.rows });
});

app.get('/legacy/v1/cases', requireAuth, requireRole('administrator', 'compliance_officer', 'employee'), async (req, res) => {
  const result = await pool.query('SELECT * FROM legacy_cases ORDER BY case_id DESC LIMIT 100');
  return res.json({ cases: result.rows });
});

app.get('/legacy/v1/compliance-reports', requireAuth, requireRole('administrator', 'compliance_officer'), async (req, res) => {
  const result = await pool.query('SELECT * FROM legacy_compliance_reports ORDER BY generated_date DESC');
  return res.json({ reports: result.rows });
});

app.post('/legacy/v1/sync/citizen', requireAuth, requireRole('administrator', 'employee', 'platform_operator'), async (req, res) => {
  const { legacyId, modernCitizenId } = req.body;
  if (!legacyId || !modernCitizenId) {
    return res.status(400).json({ error: 'legacyId and modernCitizenId required' });
  }
  const result = await pool.query(
    'UPDATE legacy_citizens SET modern_citizen_id = $1, synced_at = NOW(), status = $2 WHERE legacy_id = $3 RETURNING *',
    [modernCitizenId, 'synchronized', legacyId]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: 'Legacy record not found' });
  }
  await publishEventSafe({
    topic: TOPICS.LEGACY_RECORD_UPDATED,
    eventType: TOPICS.LEGACY_RECORD_UPDATED,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { legacyId, modernCitizenId, nationalId: result.rows[0].national_id, actor: req.user?.email }
  });
  return res.json({ synchronized: result.rows[0] });
});

app.post('/legacy/v1/sync/import', requireAuth, requireRole('administrator', 'platform_operator'), async (req, res) => {
  const { nationalId, fullName, dateOfBirth, regionCode } = req.body;
  if (!nationalId || !fullName) {
    return res.status(400).json({ error: 'nationalId and fullName required' });
  }
  const result = await pool.query(
    `INSERT INTO legacy_citizens (national_id, full_name, date_of_birth, region_code, status)
     VALUES ($1, $2, $3, $4, 'imported') RETURNING *`,
    [nationalId, fullName, dateOfBirth || null, regionCode || null]
  );
  await publishEventSafe({
    topic: TOPICS.LEGACY_RECORD_CREATED,
    eventType: TOPICS.LEGACY_RECORD_CREATED,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { legacyId: result.rows[0].legacy_id, nationalId, actor: req.user?.email }
  });
  return res.status(201).json({ record: result.rows[0] });
});

app.post('/legacy/v1/transform/link-modern', requireAuth, requireRole('administrator', 'employee'), async (req, res) => {
  const { nationalId } = req.body;
  const legacy = await pool.query('SELECT * FROM legacy_citizens WHERE national_id = $1', [nationalId]);
  if (!legacy.rowCount) {
    return res.status(404).json({ error: 'Legacy record not found' });
  }
  try {
    const modern = await serviceFetch(CITIZEN_SERVICE_URL, `/citizens?nationalId=${encodeURIComponent(nationalId)}`, {
      correlationId: req.correlationId
    });
    const citizen = modern.citizens?.[0];
    if (!citizen) {
      return res.status(404).json({ error: 'No matching modern citizen record' });
    }
    const updated = await pool.query(
      'UPDATE legacy_citizens SET modern_citizen_id = $1, synced_at = NOW(), status = $2 WHERE legacy_id = $3 RETURNING *',
      [citizen.id, 'linked', legacy.rows[0].legacy_id]
    );
    await publishEventSafe({
      topic: TOPICS.LEGACY_RECORD_UPDATED,
      eventType: TOPICS.LEGACY_RECORD_UPDATED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { legacyId: legacy.rows[0].legacy_id, modernCitizenId: citizen.id, nationalId }
    });
    return res.json({ legacy: updated.rows[0], modern: citizen });
  } catch (err) {
    return res.status(502).json({ error: 'Modern platform lookup failed', detail: err.message });
  }
});

app.get('/legacy/v1/session/validate', async (req, res) => {
  const sessionToken = req.headers['x-legacy-session'] || req.query.sessionToken;
  if (!sessionToken || sessionToken.length < 8) {
    return res.status(401).json({ error: 'Invalid legacy session token' });
  }
  return res.json({ valid: true, system: 'govrecords-v1', sessionToken: sessionToken.slice(0, 8) + '...' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on ${PORT}`);
});

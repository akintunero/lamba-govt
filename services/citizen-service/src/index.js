const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const { badRequest, notFound, internalError } = require('../../../platform/common/errors');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { publishEventSafe, kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { TOPICS } = require('../../../platform/common/events');
const ctfFlags = require('../../../platform/common/ctf-flags');
const { maskPassport, maskNIN, maskPhone, maskEmail } = require('../../../platform/common/mask');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3002;
const SERVICE = 'citizen-service';

function registerRoute(method, paths, ...handlers) {
  for (const path of paths) {
    app[method](path, ...handlers);
  }
}

app.use(express.json());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE));
});

app.get('/citizens', requireAuth, async (_req, res) => {
  const citizens = await prisma.citizen.findMany({ orderBy: { id: 'asc' } });
  return res.json(citizens);
});

app.get('/citizens/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const citizen = await prisma.citizen.findUnique({ where: { id } });
  if (!citizen) {
    return notFound(res, 'Citizen not found');
  }
  return res.json(citizen);
});

registerRoute('post', ['/v1/citizens/onboard', '/citizens/onboard'], onboardHandler);

async function onboardHandler(req, res) {
  const { nationalId, firstName, lastName, email, phone } = req.body;
  if (!nationalId || !firstName || !lastName || !email) {
    return badRequest(res, 'nationalId, firstName, lastName, and email are required');
  }
  try {
    const citizen = await prisma.citizen.create({
      data: { nationalId, firstName, lastName, email, phone: phone || '', status: 'pending' }
    });
    await publishEventSafe({
      topic: TOPICS.CITIZEN_CREATED,
      eventType: TOPICS.CITIZEN_CREATED,
      sourceService: SERVICE,
      correlationId: req.correlationId,
      payload: { citizenId: citizen.id, nationalId, email, actor: req.user?.email }
    });
    return res.status(201).json(citizen);
  } catch (err) {
    return internalError(res, `Onboarding failed: ${err.message}`);
  }
}

app.post('/citizens/:id/verify', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const citizen = await prisma.citizen.update({
    where: { id },
    data: { status: 'verified', verifiedAt: new Date() }
  });
  await publishEventSafe({
    topic: TOPICS.IDENTITY_VERIFIED,
    eventType: TOPICS.IDENTITY_VERIFIED,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { citizenId: citizen.id, nationalId: citizen.nationalId, actor: req.user?.email }
  });
  await publishEventSafe({
    topic: TOPICS.CITIZEN_UPDATED,
    eventType: TOPICS.CITIZEN_UPDATED,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { citizenId: citizen.id, status: citizen.status }
  });
  return res.json(citizen);
});

app.get('/employees', requireAuth, async (_req, res) => {
  const employees = await prisma.employee.findMany({ include: { ministry: true } });
  return res.json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: maskEmail(e.email),
      phone: maskPhone(e.phone),
      role: e.role,
      passport: maskPassport(e.passport),
      nin: maskNIN(e.nin),
      ministry: e.ministry?.acronym || null
    }))
  );
});

const SQLI_EXFIL_MARKER = 'INJECTION_PROOF_ALPHA73';

function rowContainsInjectionMarker(row) {
  if (!row || typeof row !== 'object') return false;
  const notes = row.internalNotes ?? row.internalnotes ?? row.internal_notes;
  return typeof notes === 'string' && notes.includes(SQLI_EXFIL_MARKER);
}

function hasSuccessfulUnionSelectPayload(q) {
  return /union\s+select/i.test(q);
}

app.get('/employees/search', requireAuth, async (req, res) => {
  const q = req.query.q || '';
  try {
    const query = `
      SELECT *
      FROM "Employee"
      WHERE name ILIKE '%${q}%'
         OR role = '${q}'
    `;
    const results = await prisma.$queryRawUnsafe(query);
    const markerExfiltrated =
      Array.isArray(results) && results.some(rowContainsInjectionMarker);
    const unionSelectSucceeded = hasSuccessfulUnionSelectPayload(q);
    const sqliFlag = ctfFlags.a03Sqli();
    if ((markerExfiltrated || unionSelectSucceeded) && sqliFlag) {
      const flagged = Array.isArray(results) && results.length > 0
        ? results.map((r, i) => i === 0 ? { ...r, campaign_signature: sqliFlag } : r)
        : results;
      return res.json(flagged);
    }
    return res.json(results);
  } catch (err) {
    return internalError(res, `Search failed: ${err.message}`);
  }
});

app.get('/employees/me', requireAuth, async (req, res) => {
  if (!req.user?.employeeId) {
    return notFound(res, 'No employee profile linked');
  }
  const employee = await prisma.employee.findUnique({
    where: { id: req.user.employeeId },
    include: { ministry: true }
  });
  if (!employee) {
    return notFound(res, 'Employee not found');
  }
  return res.json(employee);
});

const PRIVILEGED_ESCALATION_ROLES = ['Director', 'Admin'];

app.put('/employees/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return badRequest(res, 'Invalid employee id');
  }
  try {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return notFound(res, 'Employee not found');
    }
    const updated = await prisma.employee.update({ where: { id }, data: req.body });
    const requestedRole = req.body.role;
    const roleEscalated =
      requestedRole &&
      PRIVILEGED_ESCALATION_ROLES.includes(requestedRole) &&
      PRIVILEGED_ESCALATION_ROLES.includes(updated.role) &&
      !PRIVILEGED_ESCALATION_ROLES.includes(existing.role);
    const massAssignmentFlag = roleEscalated ? ctfFlags.a08MassAssignment() : '';
    const payload = massAssignmentFlag ? { ...updated, profile_audit_hash: massAssignmentFlag } : updated;
    return res.json(payload);
  } catch (err) {
    return res.status(400).json({ error: 'Update failed', detail: err.message });
  }
});

app.get('/staff/directory', async (_req, res) => {
  const employees = await prisma.employee.findMany();
  const masked = employees.map((e) => ({
    ...e,
    email: maskEmail(e.email),
    phone: maskPhone(e.phone),
    passport: maskPassport(e.passport),
    nin: maskNIN(e.nin)
  }));
  return res.json({ version: 'v1', employees: masked });
});

app.get('/staff/public', async (_req, res) => {
  const employees = await prisma.employee.findMany({
    select: { id: true, name: true, email: true, phone: true, passport: true, nin: true, role: true }
  });
  return res.json({
    employees: employees.map((e) => ({
      ...e,
      email: maskEmail(e.email),
      phone: maskPhone(e.phone),
      passport: maskPassport(e.passport),
      nin: maskNIN(e.nin)
    }))
  });
});

app.listen(PORT, () => {
  console.log(`citizen-service listening on ${PORT}`);
});

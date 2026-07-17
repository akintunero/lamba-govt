const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { getPrisma } = require('../../../platform/common/db');
const { JWT_SECRET, attachUser } = require('../../../platform/common/auth');
const { badRequest, unauthorized, notFound } = require('../../../platform/common/errors');
const {
  isKeycloakEnabled,
  passwordGrant,
  refreshTokenGrant,
  introspectToken,
  clientCredentialsToken,
  verifyKeycloakToken,
  mapKeycloakUser,
  keycloakPrometheusMetrics
} = require('../../../platform/common/keycloak');
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

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3001;
const SERVICE = 'auth-service';

function registerRoute(method, paths, ...handlers) {
  for (const path of paths) {
    app[method](path, ...handlers);
  }
}

const OIDC_CLIENTS = {
  citizen: { id: 'citizen-portal', secret: '' },
  admin: { id: 'admin-console', secret: '' },
  gateway: { id: 'api-gateway', secret: process.env.API_GATEWAY_CLIENT_SECRET },
  internal: { id: 'internal-services', secret: process.env.KEYCLOAK_CLIENT_SECRET }
};

app.use(express.json());
app.use(cookieParser());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: SERVICE,
  keycloak: isKeycloakEnabled()
}));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  let output = metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE);
  if (isKeycloakEnabled()) {
    output += keycloakPrometheusMetrics(SERVICE);
  }
  res.send(output);
});

async function publishIdentityEvent(topic, payload, correlationId) {
  await publishEventSafe({
    topic,
    eventType: topic,
    sourceService: SERVICE,
    correlationId,
    payload
  });
}

function validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter required');
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter required');
  if (!/[0-9]/.test(password)) errors.push('One number required');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('One special character required');
  return errors;
}

async function registerHandler(req, res) {
  const { email, password, citizenId, employeeId } = req.body;
  if (!email || !password) {
    return badRequest(res, 'email and password are required');
  }
  const pwErrors = validatePasswordStrength(password);
  if (pwErrors.length > 0) {
    return res.status(422).json({ error: 'Password does not meet complexity requirements', code: 'VALIDATION_ERROR', detail: pwErrors.join('; ') });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        role: 'citizen',
        roleId: 1,
        citizenId: citizenId || null,
        employeeId: employeeId || null
      }
    });
    await publishIdentityEvent(TOPICS.IDENTITY_USER_CREATED, {
      userId: user.id,
      email: user.email,
      role: user.role,
      actor: email
    }, req.correlationId);
    return res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    return res.status(400).json({ error: 'Registration failed', detail: err.message });
  }
}

registerRoute('post', ['/register', '/v1/register'], registerHandler);

async function loginHandler(req, res) {
  const { email, password, clientType } = req.body;
  if (!email || !password) {
    return badRequest(res, 'email and password are required');
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many login attempts. Please wait before trying again.', code: 'RATE_LIMITED', retryAfter: 60 });
  }

  if (isKeycloakEnabled()) {
    try {
      const clientKey = clientType === 'admin' ? 'admin' : 'citizen';
      const client = OIDC_CLIENTS[clientKey];
      const tokens = await passwordGrant({
        username: email,
        password,
        clientId: client.id,
        clientSecret: client.secret
      });
      const user = mapKeycloakUser(jwt.decode(tokens.access_token));
      await publishEventSafe({
        topic: TOPICS.AUTH_SESSION,
        eventType: TOPICS.AUTH_SESSION,
        sourceService: SERVICE,
        correlationId: req.correlationId,
        payload: { email, role: user.role, provider: 'keycloak', actor: email }
      });
      return res.json({
        token: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        user,
        provider: 'keycloak'
      });
    } catch {
      // fall through to legacy login
    }
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return unauthorized(res, 'Invalid credentials');
  }
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    citizenId: user.citizenId
  };
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: clientIp }
  });
  const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
  await publishEventSafe({
    topic: TOPICS.AUTH_SESSION,
    eventType: TOPICS.AUTH_SESSION,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { userId: user.id, email: user.email, role: user.role, actor: user.email, provider: 'legacy', ip: clientIp }
  });
  return res.json({ token, user: { ...payload, lastLoginAt: user.lastLoginAt, lastLoginIp: user.lastLoginIp }, provider: 'legacy' });
}

registerRoute('post', ['/login', '/v1/login'], loginHandler);

app.post('/v1/oidc/token', async (req, res) => {
  if (!isKeycloakEnabled()) {
    return res.status(503).json({ error: 'Identity provider unavailable', code: 'SERVICE_UNAVAILABLE' });
  }
  const { grantType, username, password, refreshToken, clientType } = req.body;
  const clientKey = clientType || 'citizen';
  const client = OIDC_CLIENTS[clientKey] || OIDC_CLIENTS.citizen;
  try {
    if (grantType === 'client_credentials') {
      const tokens = await clientCredentialsToken();
      return res.json(tokens);
    }
    if (grantType === 'refresh_token' && refreshToken) {
      const tokens = await refreshTokenGrant({ refreshToken, clientId: client.id, clientSecret: client.secret });
      return res.json(tokens);
    }
    const tokens = await passwordGrant({ username, password, clientId: client.id, clientSecret: client.secret });
    const user = mapKeycloakUser(jwt.decode(tokens.access_token));
    await publishIdentityEvent(TOPICS.IDENTITY_USER_UPDATED, { email: username, action: 'token_issued', actor: username }, req.correlationId);
    return res.json({ ...tokens, user });
  } catch (err) {
    return res.status(401).json({ error: 'OIDC token request failed', code: 'UNAUTHORIZED', detail: err.message });
  }
});

app.post('/v1/oidc/introspect', async (req, res) => {
  if (!isKeycloakEnabled()) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), JWT_SECRET);
        return res.json({ active: true, ...payload });
      } catch {
        return res.json({ active: false });
      }
    }
    return res.json({ active: false });
  }
  const token = req.body.token || (req.headers.authorization || '').replace('Bearer ', '');
  const result = await introspectToken(token);
  return res.json(result);
});

app.get('/v1/oidc/userinfo', attachUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  return res.json({ sub: req.user.userId, email: req.user.email, role: req.user.role, roles: req.user.roles });
});

const LAMBA_STATIC_SESSION = 'LAMBA-STATIC-SESSION';
const SEED_STUDENT_EMAIL = process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba';
app.post('/cookie-login', async (req, res) => {
  const { email, password } = req.body;
  const forcedSessionId = req.query.sessionId;
  if (!email || !password) {
    return badRequest(res, 'email and password are required');
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return unauthorized(res, 'Invalid credentials');
  }
  const explicitSessionOverride = Object.prototype.hasOwnProperty.call(req.query, 'sessionId');
  const sessionId = forcedSessionId || LAMBA_STATIC_SESSION;
  res.cookie('sessionId', sessionId, { httpOnly: false, secure: false });
  if (explicitSessionOverride && sessionId === LAMBA_STATIC_SESSION) {
    res.cookie('lambaSessionFixation', '1', { httpOnly: false, secure: false });
  }
  return res.json({ message: 'Session established', sessionId });
});

app.get('/session', async (req, res) => {
  const sessionFromQuery = req.query.sessionId;
  const sessionId = req.cookies.sessionId || sessionFromQuery;
  if (!sessionId) {
    return unauthorized(res, 'No session');
  }
  const user = await prisma.user.findUnique({
    where: { email: SEED_STUDENT_EMAIL },
    include: { employee: true, citizen: true }
  });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const sessionFixationExploit =
    sessionId === LAMBA_STATIC_SESSION &&
    user.email === SEED_STUDENT_EMAIL &&
    (sessionFromQuery === LAMBA_STATIC_SESSION || req.cookies.lambaSessionFixation === '1');
  const body = {
    sessionId,
    user: { id: user.id, email: user.email, role: user.role },
    employee: user.employee,
    citizen: user.citizen
  };
  const sessionFlag = sessionFixationExploit ? ctfFlags.a07SessionFixation() : '';
  if (sessionFlag) {
    body.session_trace_id = sessionFlag;
  }
  return res.json(body);
});

app.post('/portal/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return badRequest(res, 'email and password are required');
  }
  if (!email.endsWith('@gov.lamba') || password !== 'password') {
    return unauthorized(res, 'Portal login failed');
  }
  const token = Buffer.from(`${email}:portal:${Date.now()}`).toString('base64');
  return res.json({ message: 'Portal access granted', token });
});

app.get('/me', attachUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  const fullUser = await prisma.user.findUnique({
    where: { email: req.user.email },
    select: { email: true, role: true, lastLoginAt: true, lastLoginIp: true, createdAt: true }
  });
  return res.json({ user: { ...req.user, ...fullUser } });
});

app.get('/v1/auth/sessions', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.user.email } });
  if (!user) return res.json({ sessions: [] });
  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });
  return res.json({ sessions });
});

app.delete('/v1/auth/sessions/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  await prisma.session.deleteMany({ where: { sessionId } });
  return res.json({ message: 'Session revoked' });
});

const RESET_TOKENS = new Map();
const A04_FLAG = ctfFlags.a04PredictableReset();

const LOGIN_ATTEMPTS = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxAttempts = 10;
  if (!ip) return true;
  const record = LOGIN_ATTEMPTS.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    LOGIN_ATTEMPTS.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  record.count += 1;
  LOGIN_ATTEMPTS.set(ip, record);
  if (record.count > maxAttempts) return false;
  return true;
}

app.post('/v1/auth/password-reset/request', async (req, res) => {
  const { email } = req.body;
  if (!email) return badRequest(res, 'email is required');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ message: 'If the email exists, a reset link has been sent.' });
  const predictableToken = crypto.createHash('md5').update(email + ':' + Math.floor(Date.now() / 3600000)).digest('hex').slice(0, 12);
  RESET_TOKENS.set(predictableToken, { email, createdAt: Date.now() });
  await prisma.auditLog.create({
    data: {
      action: 'PASSWORD_RESET_REQUESTED',
      detail: `Password reset token generated for ${email}`,
      actor: email,
      service: SERVICE
    }
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      channel: 'email',
      message: `Password reset requested. If this was not you, contact IT security immediately. Reference: ${predictableToken.slice(0, 4)}...`
    }
  });
  return res.json({ message: 'Reset link generated. Check your email and notifications.', token: predictableToken });
});

app.post('/v1/auth/password-reset/confirm', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return badRequest(res, 'token and newPassword are required');
  const record = RESET_TOKENS.get(token);
  if (!record) return unauthorized(res, 'Invalid or expired reset token');
  const user = await prisma.user.findUnique({ where: { email: record.email } });
  if (!user) return notFound(res, 'User not found');
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { email: record.email }, data: { password: hash } });
  RESET_TOKENS.delete(token);
  const body = { message: 'Password reset successful' };
  if (user.email === process.env.SEED_ADMIN_EMAIL && A04_FLAG) {
    body.reset_audit_reference = A04_FLAG;
  }
  return res.json(body);
});

app.listen(PORT, () => {
  console.log(`auth-service listening on ${PORT}`);
});

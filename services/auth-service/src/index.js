const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { getPrisma } = require('../../../platform/common/db');
const { JWT_SECRET, attachUser } = require('../../../platform/common/auth');
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

const OIDC_CLIENTS = {
  citizen: { id: 'citizen-portal', secret: '' },
  admin: { id: 'admin-console', secret: '' },
  gateway: { id: 'api-gateway', secret: 'api-gateway-secret' },
  internal: { id: 'internal-services', secret: 'internal-services-secret' }
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

async function registerHandler(req, res) {
  const { email, password, citizenId, employeeId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
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

app.post('/register', registerHandler);
app.post('/v1/register', registerHandler);

async function loginHandler(req, res) {
  const { email, password, clientType } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
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
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    citizenId: user.citizenId
  };
  const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
  await publishEventSafe({
    topic: TOPICS.AUTH_SESSION,
    eventType: TOPICS.AUTH_SESSION,
    sourceService: SERVICE,
    correlationId: req.correlationId,
    payload: { userId: user.id, email: user.email, role: user.role, actor: user.email, provider: 'legacy' }
  });
  return res.json({ token, user: payload, provider: 'legacy' });
}

app.post('/login', loginHandler);
app.post('/v1/login', loginHandler);

app.post('/v1/oidc/token', async (req, res) => {
  if (!isKeycloakEnabled()) {
    return res.status(503).json({ error: 'Identity provider unavailable' });
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
    return res.status(401).json({ error: 'OIDC token request failed', detail: err.message });
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
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.json({ sub: req.user.userId, email: req.user.email, role: req.user.role, roles: req.user.roles });
});

const LAMBA_STATIC_SESSION = 'LAMBA-STATIC-SESSION';
const SEED_STUDENT_EMAIL = process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba';
app.post('/cookie-login', async (req, res) => {
  const { email, password } = req.body;
  const forcedSessionId = req.query.sessionId;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
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
    return res.status(401).json({ error: 'No session' });
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
    body.flag = sessionFlag;
  }
  return res.json(body);
});

app.post('/portal/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (!email.endsWith('@gov.lamba') || password !== 'password') {
    return res.status(401).json({ error: 'Portal login failed' });
  }
  const token = Buffer.from(`${email}:portal:${Date.now()}`).toString('base64');
  return res.json({ message: 'Portal access granted', token });
});

app.get('/me', attachUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.json({ user: req.user });
});

app.listen(PORT, () => {
  console.log(`auth-service listening on ${PORT}`);
});

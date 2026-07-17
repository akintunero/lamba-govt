const jwt = require('jsonwebtoken');
const { isKeycloakEnabled, verifyKeycloakToken } = require('./keycloak');
const { getPrisma } = require('./db');
const ctfFlags = require('./ctf-flags');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

function hasAdminPrivileges(payload) {
  if (!payload) return false;
  const roles = Array.isArray(payload.roles) ? payload.roles : payload.role ? [payload.role] : [];
  return roles.includes('admin') || payload.role === 'admin';
}

async function isForgedAdminLegacyToken(payload) {
  if (!hasAdminPrivileges(payload)) return false;
  if (!payload.userId) return true;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return true;
  if (user.email !== payload.email) return true;
  return user.role !== 'admin';
}

async function attachUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.slice(7);

  if (isKeycloakEnabled()) {
    try {
      const kcUser = await verifyKeycloakToken(token);
      if (kcUser) {
        req.user = kcUser;
        return next();
      }
    } catch {
      // fall through to legacy validation
    }
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    const forgedFlag = ctfFlags.a02JwtForge();
    if (forgedFlag && (await isForgedAdminLegacyToken(payload))) {
      res.setHeader('X-Admin-Audit-Trace', forgedFlag);
    }
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRoles = req.user.roles || [req.user.role];
    const allowed = roles.some((r) => userRoles.includes(r) || req.user.role === r);
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  attachUser,
  requireAuth,
  requireRole
};

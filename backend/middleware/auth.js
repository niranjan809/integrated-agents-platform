const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required but not set');

function requireAuth(req, res, next) {
  // Support token via Authorization header OR _token query param (needed for SSE/EventSource)
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query._token) {
    token = req.query._token;
  }

  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Role gate — use AFTER requireAuth (which populates req.user from the JWT).
// Usage: router.get('/admin/users', requireAuth, requireRole('admin'), handler)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient role',
        required: allowedRoles,
        have: req.user.role,
      });
    }
    next();
  };
}

// Dual auth for admin-management routes: accept EITHER a normal user JWT with
// role='admin' OR a panel-admin JWT (scope='panel-admin', issued by
// POST /api/admin/login). Both are HS256-signed with the same JWT_SECRET, so a
// single jwt.verify handles both; we branch on the payload shape. Mirrors the
// panel-admin check in routes/admin.js (requirePanelAdmin: scope==='panel-admin').
function requireAdminOrPanel(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query._token || null);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

  // 1) User JWT with admin role.
  if (payload.role === 'admin') {
    req.user = payload;
    req.authType = 'user_jwt';
    return next();
  }
  // 2) Panel-admin JWT. Synthetic actor — no user row, so id=0 (audit_log.actor_id
  // is NOT NULL; 0 never collides with a real AUTOINCREMENT id which starts at 1).
  if (payload.scope === 'panel-admin') {
    req.user = { id: 0, email: 'panel-admin@system', role: 'admin', source: 'panel-admin' };
    req.authType = 'panel_admin';
    return next();
  }
  // Valid token, but neither an admin user nor a panel-admin session.
  return res.status(403).json({
    error: 'Insufficient role',
    required: ['admin'],
    have: payload.role || payload.scope || 'unknown',
  });
}

// Section-level gate (RBAC Phase 3). Use AFTER requireAuth (or requireAdminOrPanel),
// which populates req.user. Grants access if the user's sections_allowed intersects
// requiredSections. Panel-admin sees everything — bypass whether it arrived via
// requireAdminOrPanel (req.authType) or a plain requireAuth verify of a panel-admin
// JWT (req.user.scope). Note: role='admin' does NOT bypass — access is purely by
// sections_allowed, so an admin scoped to fewer sections is still gated.
function requireSection(...requiredSections) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.authType === 'panel_admin' || req.user.scope === 'panel-admin') return next();

    const allowed = req.user.sections_allowed || [];
    const hasAccess = requiredSections.some(s => allowed.includes(s));
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Section access denied',
        required: requiredSections,
        have: allowed,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireAdminOrPanel, requireSection };

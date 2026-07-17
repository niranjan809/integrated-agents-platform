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

module.exports = { requireAuth, requireRole };

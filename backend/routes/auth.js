const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db }  = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logAudit }    = require('./admin-users');

const router      = express.Router();
const JWT_SECRET  = () => process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

// Comma-separated sections string -> array (JWT/response shape). Empty -> [].
const sectionsArray = (csv) => (csv || '').split(',').filter(Boolean);

// POST /api/auth/register — disabled; admin account is seeded from .env on startup
router.post('/register', (_req, res) => {
  res.status(403).json({ error: 'Registration is disabled.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const sections = sectionsArray(user.sections_allowed);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sections_allowed: sections },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES }
    );

    // Best-effort last-login stamp — never block login if this write fails.
    await db.execute({
      sql: "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
      args: [user.id],
    }).catch((e) => console.warn('last_login_at update failed:', e.message));

    res.json({ token, user: { id: user.id, email: user.email, role: user.role, sections_allowed: sections } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      sections_allowed: req.user.sections_allowed || [],
    },
  });
});

// POST /api/me/change-password — self-service (any authenticated user).
// NOTE: mounted under /api/auth, so the full path is /api/auth/me/change-password.
router.post('/me/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }

  try {
    const { rows } = await db.execute({
      sql: 'SELECT id, email, password_hash FROM users WHERE id = ?',
      args: [req.user.id],
    });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, password_updated_at = datetime('now') WHERE id = ?",
      args: [hash, req.user.id],
    });

    await logAudit(db, req.user, 'user.self_password_change', 'user', req.user.id, null);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change-password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db }  = require('../db');

const router      = express.Router();
const JWT_SECRET  = () => process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, role: req.user.role } });
});

module.exports = router;

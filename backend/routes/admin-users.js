// RBAC Phase 1 — admin user management + audit log.
//
// Mounted at /api (see server.js), so routes resolve to /api/admin/users,
// /api/admin/audit-log, etc. Every route in this router is JWT-authed AND
// role-gated to 'admin' via the router-level middleware below. No section-level
// permission enforcement here — that's Phase 3.
const express = require('express');
const bcrypt  = require('bcryptjs');
const { db }  = require('../db');
const { requireAdminOrPanel } = require('../middleware/auth');

const router = express.Router();

// Admin-management surface. Accessible by a user JWT with role='admin' OR a
// panel-admin session (dual auth) — applied once so no route can be left open.
router.use(requireAdminOrPanel);

const VALID_ROLES    = ['viewer', 'editor', 'admin'];
const VALID_SECTIONS = ['brand-visibility', 'pr', 'leaderboard'];
const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Audit helper (exported; reused by routes/auth.js change-password too) ──────
async function logAudit(db, actor, action, targetType, targetId, meta) {
  await db.execute({
    sql: 'INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
    args: [
      // actor_id is NOT NULL; panel-admin has no user row (id null/0) -> store 0.
      actor.id ?? 0,
      actor.email,
      action,
      targetType || null,
      targetId ? String(targetId) : null,
      meta ? JSON.stringify(meta) : null,
    ],
  });
}

const toArray = (csv) => (csv || '').split(',').map((s) => s.trim()).filter(Boolean);

// Shape a users row for the API — NEVER includes password_hash.
function serializeUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    sections_allowed: toArray(u.sections_allowed),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    password_updated_at: u.password_updated_at,
    created_by: u.created_by,
  };
}

// Validate a sections_allowed array against the allowed set. Returns error string or null.
function validateSections(sections) {
  if (!Array.isArray(sections)) return 'sections_allowed must be an array';
  const bad = sections.filter((s) => !VALID_SECTIONS.includes(s));
  if (bad.length) return `Invalid section(s): ${bad.join(', ')}. Allowed: ${VALID_SECTIONS.join(', ')}`;
  return null;
}

const USER_COLS =
  'id, email, role, sections_allowed, created_at, last_login_at, password_updated_at, created_by';

// ── GET /admin/users — list all users (never returns password_hash) ───────────
router.get('/admin/users', async (_req, res) => {
  try {
    const { rows } = await db.execute(`SELECT ${USER_COLS} FROM users ORDER BY id`);
    res.json({ users: rows.map(serializeUser) });
  } catch (err) {
    console.error('[admin-users] list error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ── POST /admin/users — create a user ─────────────────────────────────────────
router.post('/admin/users', async (req, res) => {
  const { email, password, role } = req.body || {};
  const sections_allowed = req.body?.sections_allowed ?? [];

  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password is required (min 8 characters)' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  const secErr = validateSections(sections_allowed);
  if (secErr) return res.status(400).json({ error: secErr });

  try {
    const { rows: existing } = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    if (existing.length) return res.status(409).json({ error: 'A user with that email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.execute({
      sql: `INSERT INTO users (email, password_hash, role, sections_allowed, password_updated_at, created_by)
            VALUES (?, ?, ?, ?, datetime('now'), ?)`,
      args: [email, hash, role, sections_allowed.join(','), req.user.id],
    });
    const newId = Number(result.lastInsertRowid);

    await logAudit(db, req.user, 'user.create', 'user', newId, { email, role, sections_allowed });

    const { rows } = await db.execute({ sql: `SELECT ${USER_COLS} FROM users WHERE id = ?`, args: [newId] });
    res.status(201).json({ user: serializeUser(rows[0]) });
  } catch (err) {
    console.error('[admin-users] create error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ── PATCH /admin/users/:id — update role and/or sections_allowed ───────────────
router.patch('/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
  if ('email' in (req.body || {})) return res.status(400).json({ error: 'email is immutable' });

  const { role, sections_allowed } = req.body || {};
  if (role === undefined && sections_allowed === undefined) {
    return res.status(400).json({ error: 'Nothing to update (provide role and/or sections_allowed)' });
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (sections_allowed !== undefined) {
    const secErr = validateSections(sections_allowed);
    if (secErr) return res.status(400).json({ error: secErr });
  }
  // Prevent self-lockout: an admin cannot change their own role.
  if (role !== undefined && id === req.user.id) {
    return res.status(403).json({ error: 'You cannot change your own role' });
  }

  try {
    const { rows } = await db.execute({ sql: `SELECT ${USER_COLS} FROM users WHERE id = ?`, args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const sets = [];
    const args = [];
    const changes = {};
    if (role !== undefined) { sets.push('role = ?'); args.push(role); changes.role = role; }
    if (sections_allowed !== undefined) {
      sets.push('sections_allowed = ?'); args.push(sections_allowed.join(',')); changes.sections_allowed = sections_allowed;
    }
    args.push(id);
    await db.execute({ sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args });

    await logAudit(db, req.user, 'user.update', 'user', id, changes);

    const { rows: after } = await db.execute({ sql: `SELECT ${USER_COLS} FROM users WHERE id = ?`, args: [id] });
    res.json({ user: serializeUser(after[0]) });
  } catch (err) {
    console.error('[admin-users] update error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── POST /admin/users/:id/reset-password — admin sets another user's password ──
router.post('/admin/users/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'new_password is required (min 8 characters)' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Use /api/auth/me/change-password to change your own password' });
  }

  try {
    const { rows } = await db.execute({ sql: 'SELECT id, email FROM users WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, password_updated_at = datetime('now') WHERE id = ?",
      args: [hash, id],
    });

    await logAudit(db, req.user, 'user.password_reset', 'user', id, { email: rows[0].email });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-users] reset-password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── DELETE /admin/users/:id — delete a user ───────────────────────────────────
router.delete('/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });

  try {
    const { rows } = await db.execute({ sql: 'SELECT id, email, role FROM users WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const target = rows[0];

    // Never delete the last admin — would lock everyone out of admin functions.
    if (target.role === 'admin') {
      const { rows: adminCount } = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
      if (Number(adminCount[0].n) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
    await logAudit(db, req.user, 'user.delete', 'user', id, { email: target.email, role: target.role });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-users] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── GET /admin/audit-log — paginated, newest first, with filters ──────────────
router.get('/admin/audit-log', async (req, res) => {
  const limit  = Math.min(500, Math.max(1, Number(req.query.limit)  || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const where = [];
  const args  = [];
  if (req.query.action)      { where.push('action = ?');      args.push(req.query.action); }
  if (req.query.actor_id)    { where.push('actor_id = ?');    args.push(Number(req.query.actor_id)); }
  if (req.query.target_type) { where.push('target_type = ?'); args.push(req.query.target_type); }
  if (req.query.from)        { where.push('created_at >= ?'); args.push(req.query.from); }
  if (req.query.to)          { where.push('created_at <= ?'); args.push(req.query.to); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows } = await db.execute({
      sql: `SELECT id, actor_id, actor_email, action, target_type, target_id, meta_json, created_at
            FROM audit_log ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });
    const entries = rows.map((r) => ({
      ...r,
      meta: r.meta_json ? safeParse(r.meta_json) : null,
    }));
    res.json({ entries, limit, offset });
  } catch (err) {
    console.error('[admin-users] audit-log error:', err.message);
    res.status(500).json({ error: 'Failed to read audit log' });
  }
});

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = router;
module.exports.logAudit = logAudit;

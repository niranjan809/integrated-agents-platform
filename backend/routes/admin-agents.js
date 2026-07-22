// Dynamic agents registry — admin CRUD over the dynamic_agents table plus the
// public merged catalogue. Mounted at /api (see server.js) BEFORE the legacy
// /api/agents router so the merged GET /api/agents wins; GET /api/agents/:id,
// /run, /status, /result still fall through to routes/agents.js. CRUD routes
// accept a user-admin JWT OR a panel-admin session (requireAdminOrPanel).
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdminOrPanel } = require('../middleware/auth');
const { SYSTEM_SECTIONS } = require('../systemSections');
const { slugify } = require('../utils/slug');
const { logAudit } = require('./admin-users');
const { getValidSectionIds } = require('./admin-sections');

const router = express.Router();

const SLUG_RE = /^[a-z0-9-]+$/;
const VALID_SURFACES = ['app', 'iframe', 'http'];
const VALID_STATUSES = ['active', 'coming_soon', 'disabled'];

// Normalize integrations to a comma-joined string for storage (accepts array or string).
function integrationsToStore(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).join(',') || null;
  return String(v).trim() || null;
}
// Split the stored string back into an array for API responses.
function integrationsToArray(v) {
  if (!v) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function serializeAgent(r) {
  return {
    id: r.id,
    section_id: r.section_id,
    name: r.name,
    description: r.description,
    creator: r.creator,
    version: r.version,
    surface: r.surface,
    path: r.path,
    embed_url: r.embed_url,
    run_url: r.run_url,
    status_url: r.status_url,
    icon: r.icon,
    integrations: integrationsToArray(r.integrations),
    status: r.status,
    display_order: r.display_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    created_by: r.created_by,
  };
}

// Public/landing shape — normalized to match agentRegistry.publicAgent so the
// frontend can render system + custom agents with one code path.
function publicDynamicAgent(r) {
  return {
    id: r.id,
    sectionId: r.section_id,
    name: r.name,
    icon: r.icon,
    status: r.status, // 'active' | 'coming_soon' | 'disabled'
    surface: r.surface,
    path: r.path || null,
    embedUrl: r.embed_url || null,
    runUrl: r.run_url || null,
    description: r.description,
    creator: r.creator || null,
    version: r.version,
    integrations: integrationsToArray(r.integrations),
    dynamic: true,
  };
}

// Enforce surface → required-field rules on a resolved (merged) agent record.
function surfaceError(surface, rec) {
  if (!VALID_SURFACES.includes(surface)) {
    return `surface must be one of: ${VALID_SURFACES.join(', ')}`;
  }
  if (surface === 'app' && !rec.path) return "surface 'app' requires a path (the in-app React route)";
  if (surface === 'iframe' && !rec.embed_url) return "surface 'iframe' requires an embed_url";
  if (surface === 'http' && !rec.run_url) return "surface 'http' requires a run_url";
  return null;
}

// ── Public merged catalogue (any authed user) ────────────────────────────────
router.get('/agents', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.execute(
      "SELECT * FROM dynamic_agents WHERE status = 'active' ORDER BY display_order, name"
    );
    const custom = rows.map(publicDynamicAgent);
    const { listAgents } = require('../agentRegistry');
    const system = listAgents();
    res.json({ system, custom, agents: system });
  } catch (err) {
    console.error('[admin-agents] public list error:', err.message);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.get('/admin/agents', requireAdminOrPanel, async (_req, res) => {
  try {
    const { rows } = await db.execute('SELECT * FROM dynamic_agents ORDER BY section_id, display_order, name');
    // Resolve a friendly section name (system const first, then dynamic table).
    const { rows: dynSecs } = await db.execute('SELECT id, name FROM dynamic_sections');
    const nameById = Object.fromEntries([
      ...SYSTEM_SECTIONS.map((s) => [s.id, s.name]),
      ...dynSecs.map((s) => [s.id, s.name]),
    ]);
    const agents = rows.map((r) => ({ ...serializeAgent(r), section_name: nameById[r.section_id] || r.section_id }));
    res.json({ agents });
  } catch (err) {
    console.error('[admin-agents] list error:', err.message);
    res.status(500).json({ error: 'Failed to list dynamic agents' });
  }
});

router.post('/admin/agents', requireAdminOrPanel, async (req, res) => {
  const b = req.body || {};
  if (!b.name || String(b.name).trim().length < 2) {
    return res.status(400).json({ error: 'name is required (min 2 characters)' });
  }
  const id = (b.id ? String(b.id) : slugify(b.name)).trim();
  if (!SLUG_RE.test(id)) {
    return res.status(400).json({ error: 'id must contain only lowercase letters, digits and hyphens' });
  }
  if (!b.section_id) return res.status(400).json({ error: 'section_id is required' });

  const surface = b.surface;
  const rec = { path: b.path || null, embed_url: b.embed_url || null, run_url: b.run_url || null };
  const sErr = surfaceError(surface, rec);
  if (sErr) return res.status(400).json({ error: sErr });

  const status = b.status || 'active';
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const validSections = await getValidSectionIds();
    if (!validSections.includes(b.section_id)) {
      return res.status(400).json({ error: `Unknown section_id '${b.section_id}'`, valid: validSections });
    }
    const { rows: existing } = await db.execute({ sql: 'SELECT id FROM dynamic_agents WHERE id = ?', args: [id] });
    if (existing.length) return res.status(409).json({ error: `An agent with id '${id}' already exists` });

    await db.execute({
      sql: `INSERT INTO dynamic_agents
            (id, section_id, name, description, creator, version, surface, path, embed_url, run_url, status_url, icon, integrations, status, display_order, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, b.section_id, String(b.name).trim(), b.description ?? null, b.creator ?? null,
        b.version || '0.1.0', surface, b.path ?? null, b.embed_url ?? null, b.run_url ?? null,
        b.status_url ?? null, b.icon ?? null, integrationsToStore(b.integrations), status,
        Number(b.display_order) || 0, req.user.id ?? null,
      ],
    });
    await logAudit(db, req.user, 'agent.create', 'agent', id, { section_id: b.section_id, name: b.name, surface, status });

    const { rows } = await db.execute({ sql: 'SELECT * FROM dynamic_agents WHERE id = ?', args: [id] });
    res.status(201).json({ agent: serializeAgent(rows[0]) });
  } catch (err) {
    console.error('[admin-agents] create error:', err.message);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.patch('/admin/agents/:id', requireAdminOrPanel, async (req, res) => {
  const id = String(req.params.id);
  const b = req.body || {};
  if ('id' in b) return res.status(400).json({ error: 'id is immutable' });
  if ('section_id' in b) return res.status(400).json({ error: 'section_id is immutable (delete + recreate to move an agent)' });

  const FIELDS = ['name', 'description', 'creator', 'version', 'surface', 'path', 'embed_url', 'run_url', 'status_url', 'icon', 'integrations', 'status', 'display_order'];

  try {
    const { rows } = await db.execute({ sql: 'SELECT * FROM dynamic_agents WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'Agent not found' });
    const current = rows[0];

    const sets = [];
    const args = [];
    const changes = {};
    for (const f of FIELDS) {
      if (b[f] === undefined) continue;
      let v = b[f];
      if (f === 'name' && (!v || String(v).trim().length < 2)) {
        return res.status(400).json({ error: 'name must be at least 2 characters' });
      }
      if (f === 'status' && !VALID_STATUSES.includes(v)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      if (f === 'display_order') v = Number(v) || 0;
      if (f === 'integrations') v = integrationsToStore(v);
      sets.push(`${f} = ?`);
      args.push(v);
      changes[f] = v;
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    // Re-validate surface requirements against the MERGED record (current + changes).
    const merged = {
      surface: b.surface !== undefined ? b.surface : current.surface,
      path: b.path !== undefined ? (b.path || null) : current.path,
      embed_url: b.embed_url !== undefined ? (b.embed_url || null) : current.embed_url,
      run_url: b.run_url !== undefined ? (b.run_url || null) : current.run_url,
    };
    const sErr = surfaceError(merged.surface, merged);
    if (sErr) return res.status(400).json({ error: sErr });

    sets.push("updated_at = datetime('now')");
    args.push(id);
    await db.execute({ sql: `UPDATE dynamic_agents SET ${sets.join(', ')} WHERE id = ?`, args });
    await logAudit(db, req.user, 'agent.update', 'agent', id, changes);

    const { rows: after } = await db.execute({ sql: 'SELECT * FROM dynamic_agents WHERE id = ?', args: [id] });
    res.json({ agent: serializeAgent(after[0]) });
  } catch (err) {
    console.error('[admin-agents] update error:', err.message);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.delete('/admin/agents/:id', requireAdminOrPanel, async (req, res) => {
  const id = String(req.params.id);
  try {
    const { rows } = await db.execute({ sql: 'SELECT id, name, section_id FROM dynamic_agents WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'Agent not found' });

    await db.execute({ sql: 'DELETE FROM dynamic_agents WHERE id = ?', args: [id] });
    await logAudit(db, req.user, 'agent.delete', 'agent', id, { name: rows[0].name, section_id: rows[0].section_id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-agents] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

module.exports = router;

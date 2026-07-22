// Dynamic sections registry — admin CRUD over the dynamic_sections table plus the
// public merged catalogue. Mounted at /api (see server.js) BEFORE the legacy
// /api/sections router so the merged GET /api/sections wins; GET /api/sections/:id
// still falls through to routes/sections.js. CRUD routes accept a user-admin JWT
// OR a panel-admin session (requireAdminOrPanel), matching routes/admin-users.js.
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdminOrPanel } = require('../middleware/auth');
const { SYSTEM_SECTIONS } = require('../systemSections');
const { slugify } = require('../utils/slug');
const { logAudit } = require('./admin-users');

const router = express.Router();

// System section ids are reserved — the dynamic registry can't reuse/overwrite them.
const RESERVED_SECTION_IDS = SYSTEM_SECTIONS.map((s) => s.id);
const SLUG_RE = /^[a-z0-9-]+$/;

// Valid section ids = system + ACTIVE dynamic. Shared by the agent + user
// validators (imported there) so section gating stays consistent everywhere.
async function getValidSectionIds() {
  const { rows } = await db.execute('SELECT id FROM dynamic_sections WHERE is_active = 1');
  return [...RESERVED_SECTION_IDS, ...rows.map((r) => r.id)];
}

function serializeSection(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    display_order: r.display_order,
    is_active: !!r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
    created_by: r.created_by,
  };
}

// ── Public merged catalogue (any authed user) ────────────────────────────────
// Superset response: `system` + `custom` power the new useSections() hook, while
// the legacy `sections` key keeps older consumers (SectionPage etc.) working.
router.get('/sections', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.execute(
      'SELECT * FROM dynamic_sections WHERE is_active = 1 ORDER BY display_order, name'
    );
    const custom = rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, icon: r.icon, display_order: r.display_order,
    }));
    const { listSections } = require('../agentRegistry');
    res.json({ system: SYSTEM_SECTIONS, custom, sections: listSections() });
  } catch (err) {
    console.error('[admin-sections] public list error:', err.message);
    res.status(500).json({ error: 'Failed to list sections' });
  }
});

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.get('/admin/sections', requireAdminOrPanel, async (_req, res) => {
  try {
    const { rows } = await db.execute('SELECT * FROM dynamic_sections ORDER BY display_order, name');
    res.json({ sections: rows.map(serializeSection) });
  } catch (err) {
    console.error('[admin-sections] list error:', err.message);
    res.status(500).json({ error: 'Failed to list dynamic sections' });
  }
});

router.post('/admin/sections', requireAdminOrPanel, async (req, res) => {
  const { name, description, icon, display_order } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'name is required (min 2 characters)' });
  }
  const id = (req.body?.id ? String(req.body.id) : slugify(name)).trim();
  if (!SLUG_RE.test(id)) {
    return res.status(400).json({ error: 'id must contain only lowercase letters, digits and hyphens' });
  }
  if (RESERVED_SECTION_IDS.includes(id)) {
    return res.status(409).json({ error: `'${id}' is a reserved system section id`, reserved: RESERVED_SECTION_IDS });
  }
  try {
    const { rows: existing } = await db.execute({ sql: 'SELECT id FROM dynamic_sections WHERE id = ?', args: [id] });
    if (existing.length) return res.status(409).json({ error: `A section with id '${id}' already exists` });

    await db.execute({
      sql: `INSERT INTO dynamic_sections (id, name, description, icon, display_order, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, String(name).trim(), description ?? null, icon ?? null, Number(display_order) || 0, req.user.id ?? null],
    });
    await logAudit(db, req.user, 'section.create', 'section', id, { name, icon, display_order });

    const { rows } = await db.execute({ sql: 'SELECT * FROM dynamic_sections WHERE id = ?', args: [id] });
    res.status(201).json({ section: serializeSection(rows[0]) });
  } catch (err) {
    console.error('[admin-sections] create error:', err.message);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

router.patch('/admin/sections/:id', requireAdminOrPanel, async (req, res) => {
  const id = String(req.params.id);
  if ('id' in (req.body || {})) return res.status(400).json({ error: 'id is immutable' });

  const FIELDS = ['name', 'description', 'icon', 'display_order', 'is_active'];
  const sets = [];
  const args = [];
  const changes = {};
  for (const f of FIELDS) {
    if (req.body?.[f] === undefined) continue;
    let v = req.body[f];
    if (f === 'name' && (!v || String(v).trim().length < 2)) {
      return res.status(400).json({ error: 'name must be at least 2 characters' });
    }
    if (f === 'display_order') v = Number(v) || 0;
    if (f === 'is_active') v = v ? 1 : 0;
    sets.push(`${f} = ?`);
    args.push(v);
    changes[f] = v;
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const { rows } = await db.execute({ sql: 'SELECT id FROM dynamic_sections WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'Section not found' });

    sets.push("updated_at = datetime('now')");
    args.push(id);
    await db.execute({ sql: `UPDATE dynamic_sections SET ${sets.join(', ')} WHERE id = ?`, args });
    await logAudit(db, req.user, 'section.update', 'section', id, changes);

    const { rows: after } = await db.execute({ sql: 'SELECT * FROM dynamic_sections WHERE id = ?', args: [id] });
    res.json({ section: serializeSection(after[0]) });
  } catch (err) {
    console.error('[admin-sections] update error:', err.message);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

router.delete('/admin/sections/:id', requireAdminOrPanel, async (req, res) => {
  const id = String(req.params.id);
  try {
    const { rows } = await db.execute({ sql: 'SELECT id FROM dynamic_sections WHERE id = ?', args: [id] });
    if (!rows.length) return res.status(404).json({ error: 'Section not found' });

    // Block deletion while agents still reference this section — force the admin
    // to delete or reassign (recreate) them first, so no agent is orphaned.
    const { rows: agents } = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM dynamic_agents WHERE section_id = ?', args: [id] });
    const agentCount = Number(agents[0].n);
    if (agentCount > 0) {
      return res.status(409).json({ error: 'Section has agents; delete or reassign them first', agent_count: agentCount });
    }

    await db.execute({ sql: 'DELETE FROM dynamic_sections WHERE id = ?', args: [id] });
    await logAudit(db, req.user, 'section.delete', 'section', id, null);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-sections] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

module.exports = router;
module.exports.getValidSectionIds = getValidSectionIds;
module.exports.RESERVED_SECTION_IDS = RESERVED_SECTION_IDS;

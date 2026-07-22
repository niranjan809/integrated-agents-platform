// Slugify a human name into a URL/id-safe slug. Used by the dynamic registry
// POST endpoints when the admin submits a name without an explicit id.
// CommonJS (this backend is CommonJS, not ESM).
function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = { slugify };

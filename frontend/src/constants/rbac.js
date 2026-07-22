// RBAC shared constants — roles + SYSTEM sections. Sections are now DYNAMIC
// (system + admin-created), fetched at runtime via useSections(). These consts
// are the built-in system fallback + labels used when the live list isn't loaded
// yet. Mirrors backend systemSections.js / admin-users.js VALID_ROLES.
export const ROLES = ['viewer', 'editor', 'admin'];

export const ROLE_LABELS = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
};

// The three built-in system sections (reserved ids). Custom sections come from
// the dynamic registry via useSections().
export const SYSTEM_SECTIONS = ['brand-visibility', 'pr', 'leaderboard'];

export const SYSTEM_SECTION_LABELS = {
  'brand-visibility': 'Brand Visibility',
  'pr': 'PR',
  'leaderboard': 'Leaderboard',
};

// Back-compat aliases (older imports referenced these names).
export const SECTIONS = SYSTEM_SECTIONS;
export const SECTION_LABELS = SYSTEM_SECTION_LABELS;

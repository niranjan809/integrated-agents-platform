// RBAC shared constants — roles + sections. Mirror the backend's allowed values
// (see backend/routes/admin-users.js: VALID_ROLES / VALID_SECTIONS).
export const ROLES = ['viewer', 'editor', 'admin'];

export const ROLE_LABELS = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
};

export const SECTIONS = ['brand-visibility', 'pr', 'leaderboard'];

export const SECTION_LABELS = {
  'brand-visibility': 'Brand Visibility',
  'pr': 'PR',
  'leaderboard': 'Leaderboard',
};

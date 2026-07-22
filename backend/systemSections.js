// Hardcoded system sections — the three built-in sections that ship with the
// platform. These are RESERVED: their ids can't be reused or overwritten by the
// dynamic registry, and they always appear in the merged /api/sections response.
// The dynamic registry (dynamic_sections table) layers custom sections on top.
module.exports = {
  SYSTEM_SECTIONS: [
    {
      id: 'brand-visibility',
      name: 'Brand Visibility',
      description: 'X + LinkedIn signal intelligence for AI builders',
      icon: '📡',
      display_order: 1,
    },
    {
      id: 'pr',
      name: 'PR',
      description: 'X Agent — competitor pipeline + accounts + tasks',
      icon: '📣',
      display_order: 2,
    },
    {
      id: 'leaderboard',
      name: 'Leaderboard',
      description: 'AI leaderboards + ranking analytics',
      icon: '🏆',
      display_order: 3,
    },
  ],
};

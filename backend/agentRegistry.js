// ─────────────────────────────────────────────────────────────────────────────
// Agent Registry — the single source of truth for the platform catalogue.
//
// The catalogue has two levels:
//   SECTIONS — the tiles on the landing page (Brand Visibility, PR, Leaderboard)
//   AGENTS   — the agents inside a section (each has sectionId)
//
// The UI renders both levels from here, so growing the platform is data-only:
//   • add a section  → one entry in SECTIONS
//   • add an agent    → one entry in AGENTS (with its sectionId)
// No UI or gateway code changes required.
//
// agent.surface = how the UI opens/runs the agent:
//   'app'    → a route inside this React app        (path)      e.g. the X Agent → /dashboard
//   'iframe' → an embedded external dashboard        (embedUrl)
//   'http'   → the gateway proxies run/status/result (runUrl)   ← future services
// agent.status = 'live' | 'soon' | 'off'   ('off' is hidden from the catalogue)
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'brand-visibility',
    name: 'Brand Visibility',
    icon: '◎',
    description:
      'Get your product discovered — agents that join the right conversations in your field ' +
      'and surface your product to the people who need it, across every platform.',
  },
  {
    id: 'pr',
    name: 'PR Agents',
    icon: '◇',
    description:
      'Find the accounts that move your reputation — creators open to paid promotion and the ' +
      'voices that publish genuine, credible reviews. Home of the X Agent.',
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    icon: '△',
    description:
      'A live leaderboard of the top products and applications in your field — so you always ' +
      'know the landscape and exactly where you stand.',
  },
];

const AGENTS = [
  {
    id: 'x',
    sectionId: 'pr',
    name: 'X Agent',
    creator: 'Yathukrishnan',
    integrations: ['Turso DB', 'OpenRouter (Gemini 2.5 Flash)', 'RapidAPI (twitter241)'],
    manageKeywords: true,   // admin can view/add/edit/delete this agent's keywords
    icon: '𝕏',
    status: 'live',
    surface: 'app',
    path: '/dashboard',
    description:
      'Discovers and scores X accounts for promotion and PR — joins relevant conversations, ' +
      'surfaces creators open to paid promotion and voices that publish genuine reviews, and ' +
      'tracks your field. Opens the full X Agent dashboard.',
    runUrl: null,
    version: 1,
  },
  {
    id: 'leaderboard',
    sectionId: 'leaderboard',
    name: 'Leaderboard Agent',
    creator: 'Parvathi B',
    integrations: ['Turso DB', 'OpenRouter (Gemini 2.5 Flash)', 'Playwright scraper'],
    icon: '△',
    // Live only when its dashboard URL is configured (local: http://localhost:5175,
    // prod: the Railway service URL). Set LEADERBOARD_URL in the platform env.
    status: process.env.LEADERBOARD_URL ? 'live' : 'soon',
    surface: 'iframe',
    embedUrl: process.env.LEADERBOARD_URL || null,
    // Leaderboard agent's own add/edit/delete console — embedded in the admin panel's
    // agent detail view (see AdminPage.jsx), gated by that agent's own login.
    manageUrl: process.env.LEADERBOARD_URL ? `${process.env.LEADERBOARD_URL}/admin` : null,
    description:
      'A master directory of AI leaderboards — discover, explore and compare every leaderboard ' +
      'tracking model performance across voice, speech, language, coding and more. Click to open ' +
      'the live leaderboard dashboard.',
    runUrl: null,
    version: 1,
  },
  // Brand Visibility agent (partner) — ONE FastAPI service with in-dashboard platform
  // tabs (X + LinkedIn). Goes live when BRAND_VISIBILITY_URL is set (the service base
  // URL). X is wired to real data; LinkedIn is a "Coming soon" placeholder for now.
  {
    id: 'brand-visibility',
    sectionId: 'brand-visibility',
    name: 'Brand Visibility Agent',
    creator: 'Anooj',
    integrations: ['Postgres', 'RapidAPI (twitter241)', 'RapidAPI (Fresh LinkedIn)', 'OpenRouter (Gemini 2.5 Flash)'],
    icon: '◎',
    status: process.env.BRAND_VISIBILITY_URL ? 'live' : 'soon',
    surface: 'app',
    path: '/brand-visibility/overview',
    description:
      'Voice-AI builder signals across X and LinkedIn — sweeps, classifies, and surfaces the ' +
      'accounts and posts driving your brand visibility on both platforms.',
    runUrl: null,
    version: 1,
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function agentsInSection(sectionId) {
  return AGENTS.filter(a => a.sectionId === sectionId && a.status !== 'off');
}

// Public field set the UI needs for an agent card.
function publicAgent(a) {
  return {
    id: a.id, sectionId: a.sectionId, name: a.name, icon: a.icon,
    status: a.status, surface: a.surface, path: a.path || null,
    embedUrl: a.embedUrl || null, manageUrl: a.manageUrl || null, description: a.description,
    creator: a.creator || null, version: a.version,
  };
}

// Admin overview — agents with creator + integrations + section name (no secrets).
function adminAgents() {
  const sectionName = Object.fromEntries(SECTIONS.map(s => [s.id, s.name]));
  return AGENTS.filter(a => a.status !== 'off').map(a => ({
    id: a.id, name: a.name, sectionId: a.sectionId, section: sectionName[a.sectionId] || a.sectionId,
    creator: a.creator || '—', status: a.status, surface: a.surface,
    path: a.path || null, embedUrl: a.embedUrl || null, manageUrl: a.manageUrl || null,
    description: a.description, integrations: a.integrations || [],
    manageKeywords: a.manageKeywords || false,
  }));
}

// Landing tiles — each section plus a computed status/live count.
function listSections() {
  return SECTIONS.map(s => {
    const agents = agentsInSection(s.id);
    const liveCount = agents.filter(a => a.status === 'live').length;
    const creators = [...new Set(agents.map(a => a.creator).filter(Boolean))];
    return {
      id: s.id, name: s.name, icon: s.icon, description: s.description,
      agentCount: agents.length, liveCount, creators,
      status: liveCount > 0 ? 'live' : 'soon',
    };
  });
}

// One section + the agents inside it (null if the section id is unknown).
function getSection(id) {
  const s = SECTIONS.find(x => x.id === id);
  if (!s) return null;
  return {
    section: { id: s.id, name: s.name, icon: s.icon, description: s.description },
    agents: agentsInSection(id).map(publicAgent),
  };
}

// Flat agent list (used by the gateway run/status/result routes).
function listAgents() {
  return AGENTS.filter(a => a.status !== 'off').map(publicAgent);
}

function getAgent(id) {
  return AGENTS.find(a => a.id === id) || null;
}

module.exports = { SECTIONS, AGENTS, listSections, getSection, agentsInSection, listAgents, getAgent, adminAgents };

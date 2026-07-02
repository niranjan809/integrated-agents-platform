// ─────────────────────────────────────────────────────────────────────────────
// Agent Registry — the single source of truth for which agents the platform has.
//
// This is the "thin layer" data: the UI renders its catalogue from here, and the
// gateway routes runs by `id`. To add an agent, add ONE entry below (or, later, a
// row in a DB table) — no UI or gateway code changes required.
//
// surface = how the UI opens/runs the agent:
//   'app'    → a route inside this React app (path)          e.g. the X agent
//   'iframe' → an embedded external dashboard (embedUrl)     e.g. the Streamlit page
//   'http'   → the gateway proxies /run|/status|/result to a service (runUrl)  ← future agents
// status  = 'live' | 'soon' | 'off'   ('off' is hidden from the catalogue)
// ─────────────────────────────────────────────────────────────────────────────

const MARKET_INTEL_URL = process.env.MARKET_INTEL_URL || 'http://localhost:8501/?embed=true';

const AGENTS = [
  {
    id: 'x',
    name: 'PR Agent',
    category: 'PR',
    icon: '◇',
    status: 'live',
    surface: 'app',
    path: '/pr',
    description:
      'Finds the accounts that move your reputation — creators open to paid promotion and the voices ' +
      'that publish genuine, credible reviews of your product. Live on X today, with LinkedIn next.',
    runUrl: null,
    version: 1,
  },
  {
    id: 'market-intel',
    name: 'Market Intel Agent',
    category: 'Market Intel',
    icon: '◈',
    status: 'live',
    surface: 'app',            // opens /market-intel, which embeds the dashboard
    path: '/market-intel',
    embedUrl: MARKET_INTEL_URL,
    description:
      'KA017 (X) and KA018 (LinkedIn) market-intelligence agents — scrape and classify voice-AI ' +
      'builder signals and surface them in a live dashboard. Runs inside this platform.',
    runUrl: null,
    version: 1,
  },
  {
    id: 'brand-visibility',
    name: 'Brand Visibility Agent',
    category: 'Growth',
    icon: '◎',
    status: 'soon',
    surface: 'app',
    path: '/brand',
    description:
      'Gets your product discovered — joins the right conversations in your field, finds where your ' +
      'product fits, and surfaces it to the people who need it.',
    runUrl: null,
    version: 1,
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard Agent',
    category: 'Market',
    icon: '△',
    status: 'soon',
    surface: 'app',
    path: '/leaderboard',
    description:
      'A live leaderboard of the top products and applications in your field — so you always know the ' +
      'landscape and exactly where you stand.',
    runUrl: null,
    version: 1,
  },
];

// Public catalogue (hide 'off'). Field set the UI needs to render + route.
function listAgents() {
  return AGENTS.filter(a => a.status !== 'off').map(a => ({
    id: a.id, name: a.name, category: a.category, icon: a.icon,
    status: a.status, surface: a.surface, path: a.path || null,
    embedUrl: a.embedUrl || null, description: a.description, version: a.version,
  }));
}

function getAgent(id) {
  return AGENTS.find(a => a.id === id) || null;
}

module.exports = { AGENTS, listAgents, getAgent };

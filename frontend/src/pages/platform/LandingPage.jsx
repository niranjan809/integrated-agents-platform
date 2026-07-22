import { Link, useLocation } from 'react-router-dom';
import PlatformShell from '../../components/platform/PlatformShell';
import { useAuth } from '../../context/AuthContext';
import { useSections } from '../../hooks/useSections';
import { useAgents } from '../../hooks/useAgents';

// The landing catalogue merges the system registry (agentRegistry.js /
// systemSections.js) with the dynamic registry (admin-created sections + agents),
// via /api/sections and /api/agents. RBAC Phase 3: we hide sections the user
// isn't allowed to see (JWT sections_allowed) — the backend enforces access on
// each section's own routes; this is the UX filter.

// An agent is "available" when live/active; anything else renders as a preview.
const isAvailable = (a) => a.status === 'live' || a.status === 'active';

// Where an agent card navigates, by surface.
function agentTarget(a) {
  if (a.surface === 'app' && a.path) return a.path;
  if (a.surface === 'iframe') return `/embed/${a.id}`;
  return `/section/${a.sectionId}`; // http / fallback → section page
}

export default function LandingPage() {
  const { user } = useAuth();
  const location = useLocation();
  const { sections: secData, loading: secLoading, error: secError } = useSections();
  const { agents: agtData, loading: agtLoading, error: agtError } = useAgents();

  const allowed = user?.sections_allowed || [];
  const deniedSection = location.state?.deniedSection || null;

  const loading = secLoading || agtLoading;
  const error = secError || agtError;

  // Merge system + custom sections, order by display_order, keep only allowed.
  const allSections = [...(secData?.system || []), ...(secData?.custom || [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const visibleSections = allSections.filter((s) => allowed.includes(s.id));
  const nameById = Object.fromEntries(allSections.map((s) => [s.id, s.name]));

  // All agents (system first, then custom), grouped per section id.
  const allAgents = [...(agtData?.system || []), ...(agtData?.custom || [])];
  const agentsBySection = allAgents.reduce((acc, a) => {
    (acc[a.sectionId] ||= []).push(a);
    return acc;
  }, {});

  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Agent Platform</div>
      <h1 className="shell-h1">Grow your product with <span className="accent">intelligent agents</span></h1>
      <p className="shell-sub">
        Add a product and KiteAI deploys specialized agents that work for it around the clock.
        Choose a section to get started — each groups the agents that share a goal.
      </p>

      {deniedSection && (
        <p className="shell-sub" style={{ color: '#e0b000' }}>
          Access denied for {nameById[deniedSection] || deniedSection}. Contact your admin.
        </p>
      )}
      {error && <p className="shell-sub" style={{ color: '#e06a6a' }}>Couldn’t load the catalogue: {String(error.message || error)}</p>}
      {loading && !error && <p className="shell-sub">Loading catalogue…</p>}

      {!loading && !error && visibleSections.length === 0 && (
        <p className="shell-sub">You don’t have access to any sections yet. Contact your admin.</p>
      )}

      {!loading && !error && visibleSections.map((section) => {
        const agents = (agentsBySection[section.id] || [])
          .slice()
          .sort((a, b) => (isAvailable(b) ? 1 : 0) - (isAvailable(a) ? 1 : 0));
        return (
          <section key={section.id} className="landing-section">
            <div className="landing-section-head">
              <span className="landing-section-icon">{section.icon}</span>
              <div>
                <Link to={`/section/${section.id}`} className="landing-section-title">{section.name}</Link>
                <p className="landing-section-desc">{section.description}</p>
              </div>
            </div>

            {agents.length === 0 ? (
              <p className="shell-sub" style={{ marginTop: 0 }}>No agents in this section yet.</p>
            ) : (
              <div className="agent-grid">
                {agents.map((a, i) => {
                  const available = isAvailable(a);
                  const Card = available ? Link : 'div';
                  return (
                    <Card
                      key={a.id}
                      {...(available ? { to: agentTarget(a) } : {})}
                      className={`agent-option-card${available ? '' : ' is-soon'}`}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <div className="aoc-icon">{a.icon || '◆'}</div>
                      <div className="aoc-title">{a.name}</div>
                      <div className="aoc-desc">{a.description}</div>
                      <div className="aoc-foot">
                        <span className={`aoc-status ${available ? 'live' : 'soon'}`}>
                          {available ? 'Live' : 'Coming soon'}
                        </span>
                        {a.creator && <span className="aoc-by">Built by {a.creator}</span>}
                      </div>
                      {available && <span className="aoc-cta">Open →</span>}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </PlatformShell>
  );
}

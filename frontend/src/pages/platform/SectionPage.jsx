import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import PlatformShell from '../../components/platform/PlatformShell';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Generic section page — renders the agents inside a section from /api/sections/:id.
// A live in-app agent (e.g. the X Agent) opens its dashboard; an empty section shows
// a coming-soon state. Add agents in backend/agentRegistry.js — no edit needed here.
export default function SectionPage() {
  const { sectionId } = useParams();
  const navigate = useNavigate();
  const [data,  setData]  = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null); setError(null);
    fetch(`${API}/api/sections/${sectionId}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('kiteai_token')}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Section not found' : 'Failed to load section'))))
      .then(setData)
      .catch(e => setError(e.message));
  }, [sectionId]);

  const section = data?.section;
  const agents  = data?.agents || [];

  return (
    <PlatformShell>
      <Link to="/" className="back-to-platform">← All sections</Link>

      {error && (
        <>
          <h1 className="shell-h1">Section</h1>
          <p className="shell-sub" style={{ color: '#e06a6a' }}>{error}</p>
        </>
      )}
      {!data && !error && <p className="shell-sub">Loading…</p>}

      {section && (
        <>
          <div className="shell-eyebrow">{section.name}</div>
          <h1 className="shell-h1">{section.name}</h1>
          <p className="shell-sub">{section.description}</p>

          {agents.length === 0 ? (
            <div className="placeholder-wrap">
              <div className="aoc-icon">{section.icon}</div>
              <h2>Coming soon</h2>
              <p>Agents for this section are being prepared and will appear here once connected.</p>
              <span className="aoc-status soon">In progress</span>
            </div>
          ) : (
            <div className="agent-grid">
              {agents.map((a, i) => {
                // Where does clicking this agent go? An in-app agent navigates to its
                // route; an iframe agent opens the embedded-dashboard view.
                const target = a.status !== 'live'
                  ? null
                  : a.surface === 'iframe' && a.embedUrl ? `/embed/${a.id}`
                  : a.surface === 'app' && a.path       ? a.path
                  : null;
                const cls = `agent-option-card${target ? '' : ' disabled'}`;
                const inner = (
                  <>
                    <div className="aoc-icon">{a.icon}</div>
                    <div className="aoc-title">{a.name}</div>
                    <div className="aoc-desc">{a.description}</div>
                    <div className="aoc-foot">
                      <span className={`aoc-status ${a.status === 'live' ? 'live' : 'soon'}`}>
                        {a.status === 'live' ? 'Active' : 'Coming soon'}
                      </span>
                      {a.creator && <span className="aoc-by">Built by {a.creator}</span>}
                    </div>
                    <span className="aoc-cta">{target ? 'Open dashboard →' : 'Coming soon'}</span>
                  </>
                );
                return target
                  ? <div key={a.id} className={cls} style={{ animationDelay: `${i * 90}ms` }} onClick={() => navigate(target)}>{inner}</div>
                  : <div key={a.id} className={cls} style={{ animationDelay: `${i * 90}ms` }}>{inner}</div>;
              })}
            </div>
          )}
        </>
      )}
    </PlatformShell>
  );
}

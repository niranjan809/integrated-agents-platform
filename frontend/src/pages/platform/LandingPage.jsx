import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlatformShell from '../../components/platform/PlatformShell';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// The landing catalogue is driven by the gateway registry (/api/sections).
// Adding a section = one entry in backend/agentRegistry.js — this page needs no edit.
export default function LandingPage() {
  const [sections, setSections] = useState(null);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    fetch(`${API}/api/sections`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('kiteai_token')}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Failed to load sections'))))
      .then(d => setSections(d.sections || []))
      .catch(e => setError(e.message));
  }, []);

  // live sections first, then coming-soon
  const ordered = (sections || []).slice().sort((a, b) =>
    (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1));

  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Agent Platform</div>
      <h1 className="shell-h1">Grow your product with <span className="accent">intelligent agents</span></h1>
      <p className="shell-sub">
        Add a product and KiteAI deploys specialized agents that work for it around the clock.
        Choose a section to get started — each groups the agents that share a goal.
      </p>

      {error && <p className="shell-sub" style={{ color: '#e06a6a' }}>Couldn’t load sections: {error}</p>}
      {!sections && !error && <p className="shell-sub">Loading sections…</p>}

      <div className="agent-grid">
        {ordered.map((s, i) => {
          const live = s.status === 'live';
          return (
            <Link key={s.id} to={`/section/${s.id}`} className="agent-option-card" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="aoc-icon">{s.icon}</div>
              <div className="aoc-title">{s.name}</div>
              <div className="aoc-desc">{s.description}</div>
              <div className="aoc-foot">
                <span className={`aoc-status ${live ? 'live' : 'soon'}`}>
                  {live ? `${s.liveCount} agent${s.liveCount > 1 ? 's' : ''} live` : 'Coming soon'}
                </span>
                {s.creators?.length > 0 && <span className="aoc-by">Built by {s.creators.join(', ')}</span>}
              </div>
              <span className="aoc-cta">{live ? 'Open section' : 'Preview'} →</span>
            </Link>
          );
        })}
      </div>
    </PlatformShell>
  );
}

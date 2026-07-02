import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// The catalogue is now driven by the gateway's registry (/api/agents).
// Adding an agent = one entry in backend/agentRegistry.js — this page needs no edit.
export default function LandingPage() {
  const [agents, setAgents] = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    fetch(`${API}/api/agents`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('kiteai_token')}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Failed to load agents'))))
      .then(d => setAgents(d.agents || []))
      .catch(e => setError(e.message));
  }, []);

  // live agents first, then coming-soon
  const ordered = (agents || []).slice().sort((a, b) =>
    (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1));

  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Agent Platform</div>
      <h1 className="shell-h1">Grow your product with <span className="accent">intelligent agents</span></h1>
      <p className="shell-sub">
        Add a product and KiteAI deploys specialized agents that work for it around the clock —
        promoting it where the conversations are, finding the right people, and tracking the market.
        Choose an agent to begin.
      </p>

      {error && <p className="shell-sub" style={{ color: '#e06a6a' }}>Couldn’t load agents: {error}</p>}
      {!agents && !error && <p className="shell-sub">Loading agents…</p>}

      <div className="agent-grid">
        {ordered.map((o, i) => {
          const live = o.status === 'live';
          return (
            <Link key={o.id} to={o.path || '/'} className="agent-option-card" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="aoc-icon">{o.icon}</div>
              <div className="aoc-title">{o.name}</div>
              <div className="aoc-desc">{o.description}</div>
              <span className={`aoc-status ${live ? 'live' : 'soon'}`}>{live ? 'Active' : 'Coming soon'}</span>
              <span className="aoc-cta">{live ? 'Open agent' : 'Preview'} →</span>
            </Link>
          );
        })}
      </div>
    </PlatformShell>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Renders an `iframe`-surface agent's own dashboard inside the platform, full-screen
// with a slim back bar. The agent's embedUrl comes from the registry (/api/agents/:id).
export default function AgentEmbedPage() {
  const { agentId } = useParams();
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/agents/${agentId}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('kiteai_token')}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Agent not found'))))
      .then(d => setAgent(d.agent))
      .catch(e => setError(e.message));
  }, [agentId]);

  const backTo = agent?.sectionId ? `/section/${agent.sectionId}` : '/';

  return (
    <div className="embed-shell">
      <div className="embed-topbar">
        <Link to={backTo} className="back-to-platform" style={{ margin: 0 }}>← Back</Link>
        <span className="embed-title">{agent?.name || 'Agent'}</span>
        {agent?.embedUrl && (
          <a className="embed-open" href={agent.embedUrl} target="_blank" rel="noreferrer">Open in new tab ↗</a>
        )}
      </div>

      {error && <div className="embed-msg embed-error">{error}</div>}
      {!agent && !error && <div className="embed-msg">Loading…</div>}
      {agent && !agent.embedUrl && (
        <div className="embed-msg">This agent isn’t available yet — its dashboard URL is not configured.</div>
      )}
      {agent?.embedUrl && (
        <iframe title={agent.name} src={agent.embedUrl} className="embed-frame" />
      )}
    </div>
  );
}

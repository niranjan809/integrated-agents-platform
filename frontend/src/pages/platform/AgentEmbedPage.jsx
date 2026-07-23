import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Renders an `iframe`-surface agent's own dashboard full-screen (no wrapper bar) —
// the embedded agent provides its own "← All Agents" control to return to the
// platform. The agent's embedUrl comes from the registry (/api/agents/:id).
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

  return (
    <div className="embed-shell">
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

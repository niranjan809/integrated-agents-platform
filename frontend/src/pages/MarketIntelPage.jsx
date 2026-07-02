import { Link } from 'react-router-dom';

// Embeds the friend's KA017 (X) + KA018 (LinkedIn) Streamlit dashboard inside the
// platform, so both agents are reachable from one link. The dashboard runs
// separately on :8501; ?embed=true hides its own chrome for a clean fit.
const DASHBOARD_URL =
  import.meta.env.VITE_MARKET_INTEL_URL || 'http://localhost:8501/?embed=true';

export default function MarketIntelPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1622' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
        borderBottom: '1px solid #22374f', color: '#e8eff6',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}>
        <Link to="/" style={{ color: '#94a7bd', textDecoration: 'none', fontSize: 14 }}>← All agents</Link>
        <div style={{ fontWeight: 700 }}>Market Intel Agent</div>
        <div style={{ fontSize: 12, color: '#94a7bd' }}>KA017 (X) · KA018 (LinkedIn) — read-only</div>
        <a href="http://localhost:8501" target="_blank" rel="noreferrer"
           style={{ marginLeft: 'auto', color: '#0F8B8D', fontSize: 12, textDecoration: 'none' }}>
          Open full dashboard ↗
        </a>
      </div>
      <iframe
        title="Market Intel Dashboard"
        src={DASHBOARD_URL}
        style={{ flex: 1, width: '100%', border: 'none' }}
      />
    </div>
  );
}

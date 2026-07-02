import { Link, useNavigate } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

// PR Agent — home of the live X Agent (paid-promoter + genuine-review discovery).
// LinkedIn runs on the same engine and is coming soon.
const PLATFORM_AGENTS = [
  {
    icon: '𝕏', title: 'X Agent', status: 'live', statusLabel: 'Active', to: '/dashboard',
    desc: 'Discovers and scores X accounts for PR — surfaces creators open to paid promotion and voices that publish genuine, credible reviews, and flags paid-promoter vs authentic signals. Opens the full X Agent dashboard.',
    cta: 'Open dashboard',
  },
  {
    icon: 'in', title: 'LinkedIn Agent', status: 'soon', statusLabel: 'Coming soon', to: null,
    desc: 'The same PR engine tuned for LinkedIn — finds decision-makers, creators and credible reviewers across the professional graph. Being built now; will appear here once complete.',
    cta: 'Coming soon',
  },
];

export default function PRAgentPage() {
  const navigate = useNavigate();
  return (
    <PlatformShell>
      <Link to="/" className="back-to-platform">← All agents</Link>
      <div className="shell-eyebrow">PR Agent</div>
      <h1 className="shell-h1">Reach the voices that <span className="accent">shape your reputation</span></h1>
      <p className="shell-sub">
        Pick a platform to deploy the PR agent on. The X Agent is live today;
        LinkedIn runs on the same engine and arrives next.
      </p>
      <div className="agent-grid">
        {PLATFORM_AGENTS.map((a, i) => {
          const cls = `agent-option-card${a.to ? '' : ' disabled'}`;
          const inner = (
            <>
              <div className="aoc-icon">{a.icon}</div>
              <div className="aoc-title">{a.title}</div>
              <div className="aoc-desc">{a.desc}</div>
              <span className={`aoc-status ${a.status}`}>{a.statusLabel}</span>
              <span className="aoc-cta">{a.cta} {a.to ? '→' : ''}</span>
            </>
          );
          return a.to
            ? <div key={a.title} className={cls} style={{ animationDelay: `${i * 90}ms` }} onClick={() => navigate(a.to)}>{inner}</div>
            : <div key={a.title} className={cls} style={{ animationDelay: `${i * 90}ms` }}>{inner}</div>;
        })}
      </div>
    </PlatformShell>
  );
}

import { Link } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

const OPTIONS = [
  {
    to: '/brand', icon: '◎', title: 'Brand Visibility Agent', status: 'live', statusLabel: 'Active',
    desc: 'Gets your product discovered. The agent joins the right conversations in your field, finds where your product fits, and surfaces it to the people who need it — starting with X, expanding across platforms.',
    cta: 'Open agent',
  },
  {
    to: '/pr', icon: '◇', title: 'PR Agent', status: 'soon', statusLabel: 'Coming soon',
    desc: 'Finds the accounts that move your reputation — creators open to paid promotion and the voices that publish genuine, credible reviews of your product.',
    cta: 'Preview',
  },
  {
    to: '/leaderboard', icon: '△', title: 'Leaderboard Agent', status: 'soon', statusLabel: 'Coming soon',
    desc: 'A live leaderboard of the top products and applications in your field — so you always know the landscape and exactly where you stand.',
    cta: 'Preview',
  },
];

export default function LandingPage() {
  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Agent Platform</div>
      <h1 className="shell-h1">Grow your product with <span className="accent">intelligent agents</span></h1>
      <p className="shell-sub">
        Add a product and KiteAI deploys specialized agents that work for it around the clock —
        promoting it where the conversations are, finding the right people, and tracking the market.
        Choose an agent to begin.
      </p>
      <div className="agent-grid">
        {OPTIONS.map((o, i) => (
          <Link key={o.to} to={o.to} className="agent-option-card" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="aoc-icon">{o.icon}</div>
            <div className="aoc-title">{o.title}</div>
            <div className="aoc-desc">{o.desc}</div>
            <span className={`aoc-status ${o.status}`}>{o.statusLabel}</span>
            <span className="aoc-cta">{o.cta} →</span>
          </Link>
        ))}
      </div>
    </PlatformShell>
  );
}

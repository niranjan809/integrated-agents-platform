import { Link } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

// Placeholder section. Reserved for the Leaderboard Agent to be plugged into the platform.
export default function LeaderboardAgentPage() {
  return (
    <PlatformShell>
      <Link to="/" className="back-to-platform">← All agents</Link>
      <div className="shell-eyebrow">Leaderboard Agent</div>
      <h1 className="shell-h1">Know the field and <span className="accent">where you stand</span></h1>
      <p className="shell-sub">
        A live leaderboard of the top products and applications in your field — so you always know
        the landscape and exactly where you rank.
      </p>
      <div className="placeholder-wrap">
        <div className="aoc-icon">△</div>
        <h2>Coming soon</h2>
        <p>
          This agent is being prepared and will appear here once connected. It plugs into the same
          KiteAI platform you’re using now — same login, same workspace.
        </p>
        <span className="aoc-status soon">In progress</span>
      </div>
    </PlatformShell>
  );
}

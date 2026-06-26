import { Link } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

// Placeholder section. Reserved for the PR Agent to be plugged into the platform.
export default function PRAgentPage() {
  return (
    <PlatformShell>
      <Link to="/" className="back-to-platform">← All agents</Link>
      <div className="shell-eyebrow">PR Agent</div>
      <h1 className="shell-h1">Reach the voices that <span className="accent">shape your reputation</span></h1>
      <p className="shell-sub">
        Finds the accounts that matter for PR — creators open to paid promotion and the people who
        publish genuine, credible reviews of your product.
      </p>
      <div className="placeholder-wrap">
        <div className="aoc-icon">◇</div>
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

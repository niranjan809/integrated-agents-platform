import { Link } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell';

// Placeholder — the X Agent has moved to the PR Agent section. Reserved for future
// brand-visibility platforms.
export default function BrandVisibilityPage() {
  return (
    <PlatformShell>
      <Link to="/" className="back-to-platform">← All agents</Link>
      <div className="shell-eyebrow">Brand Visibility Agent</div>
      <h1 className="shell-h1">Promote your product <span className="accent">where the conversations are</span></h1>
      <p className="shell-sub">
        Joins the right conversations in your field and surfaces your product to the people who need it.
      </p>
      <div className="placeholder-wrap">
        <div className="aoc-icon">◎</div>
        <h2>Coming soon</h2>
        <p>
          This agent is being prepared. Looking for the X Agent? It now lives under the{' '}
          <Link to="/pr" style={{ color: 'inherit', textDecoration: 'underline' }}>PR Agent</Link> section.
        </p>
        <span className="aoc-status soon">In progress</span>
      </div>
    </PlatformShell>
  );
}

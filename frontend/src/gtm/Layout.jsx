import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Component } from 'react';
import { SparkleSearchIcon } from './components/icons';
import './gtm.css';

// GTM section shell. Wraps every GTM page in .gtm-scope (dark theme + scoped
// Tailwind reset). Full-width header: "← All Agents" flush to the left margin, the
// KiteAI wordmark (matches the platform brand), the GTM brand (home link), and the
// section nav. The GTM logo returns to the dashboard; inner pages also have their own
// "← Back". No "Dashboard" nav item — the brand/back covers it (matches the original).
const NAV = [
  { to: '/gtm/compare', label: 'Compare' },
  { to: '/gtm/categories', label: 'Categories' },
];

// Surface a page-level crash instead of a blank screen (there's no router-level
// boundary otherwise, so a thrown page would unmount silently).
class GtmErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[GTM] page error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-lg font-semibold text-ink">This GTM page hit an error.</p>
          <pre className="mt-3 overflow-auto rounded-lg border border-line bg-surface p-4 text-left text-xs text-muted">
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function GtmLayout() {
  const { pathname } = useLocation();
  // On the dashboard the big "GTM Intelligence Agent" title carries the brand, so
  // the header's compact "GTM Intelligence" mark shows only on the other pages.
  const onDashboard = pathname === '/gtm';
  return (
    <div className="gtm-scope font-sans text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="flex items-center gap-4 px-4 py-3">
          <Link
            to="/"
            className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-primary"
          >
            ← All Agents
          </Link>
          <span className="h-4 w-px shrink-0 bg-line" />
          <span className="shrink-0 select-none text-lg font-bold tracking-tight">
            <span className="text-ink">Kite</span>
            <span className="text-primary">AI</span>
          </span>
          {!onDashboard && (
            <>
              <span className="h-4 w-px shrink-0 bg-line" />
              <Link to="/gtm" className="flex shrink-0 items-center gap-1.5 font-semibold text-ink">
                <SparkleSearchIcon className="h-5 w-5 text-primary" />
                <span>GTM Intelligence</span>
              </Link>
            </>
          )}
          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-surface hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <GtmErrorBoundary>
          <Outlet />
        </GtmErrorBoundary>
      </main>
    </div>
  );
}

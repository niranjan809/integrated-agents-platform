import { Outlet, Link, useLocation } from "react-router-dom";
import BackendWakeup from "./BackendWakeup";
import ScanProgressBanner from "./ScanProgressBanner";
import AmbientBackground from "./AmbientBackground";

// True when this app is running inside the platform's iframe (vs. opened standalone).
const embedded = typeof window !== "undefined" && window.self !== window.top;

// Exit the agent and return to the KiteAI platform's "all agents" landing. The
// platform origin is taken from document.referrer (cross-origin gives just the
// origin), so no hard-coded URL; falls back to "/" if unavailable.
function backToAllAgents() {
  let home = "/";
  try {
    if (document.referrer && /^https?:/i.test(document.referrer)) {
      home = new URL(document.referrer).origin + "/";
    }
  } catch { /* keep fallback */ }
  try {
    if (window.top) window.top.location.href = home;
    else window.location.href = home;
  } catch {
    window.location.href = home;
  }
}

// Nav trimmed for platform embedding: no username / sign-out (the platform owns
// auth) and no admin link (admin actions require the maintainer login).
export default function Layout() {
  const { pathname } = useLocation();
  // Show the platform back-link only on the agent's landing page (not on domain,
  // analytics, compare, or leaderboard-detail pages), and only when embedded.
  const showAllAgents = embedded && pathname === "/";
  return (
    <div className="relative min-h-screen bg-black text-gray-100">
      <AmbientBackground />
      <div className="relative z-10">
        <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-6 py-3 flex items-center gap-4 sticky top-0 z-50">
          {/* Back to the platform's all-agents landing — only on the agent landing page. */}
          {showAllAgents && (
            <button
              onClick={backToAllAgents}
              className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-gray-400 hover:text-[#00F5D4] transition-colors"
              title="Back to all KiteAI agents"
            >
              ← All Agents
            </button>
          )}
          {showAllAgents && <span className="text-gray-700 shrink-0" aria-hidden>|</span>}
          {/* Brand = home link: KiteAI wordmark with the agent title stacked under it. */}
          <Link to="/" className="group flex flex-col leading-none" aria-label="AI Leaderboard Agent home">
            <span className="text-lg font-extrabold tracking-tight select-none">
              <span className="text-gray-100">Kite</span><span className="text-[#00F5D4]">AI</span>
            </span>
            <span className="mt-1 text-[11px] font-medium tracking-tight text-gray-400 group-hover:text-[#00F5D4] transition-colors">
              AI Leaderboard Agent
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/analytics" className="text-sm font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-800 px-3 py-1 rounded-lg transition-colors">
              Analytics
            </Link>
            <Link to="/compare" className="text-sm font-medium text-cyan-400 hover:text-cyan-300 border border-cyan-800 px-3 py-1 rounded-lg transition-colors">
              Compare
            </Link>
          </div>
        </nav>
        <BackendWakeup />
        <ScanProgressBanner />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

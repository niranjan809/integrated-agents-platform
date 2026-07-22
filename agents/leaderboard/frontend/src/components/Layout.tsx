import { Outlet, Link, useLocation } from "react-router-dom";
import BackendWakeup from "./BackendWakeup";
import ScanProgressBanner from "./ScanProgressBanner";
import AmbientBackground from "./AmbientBackground";

// Nav trimmed for platform embedding: no username / sign-out (the platform owns
// auth) and no admin link (admin actions require the maintainer login).
export default function Layout() {
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  return (
    <div className="relative min-h-screen bg-black text-gray-100">
      <AmbientBackground />
      <div className="relative z-10">
        <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-6 py-3 flex items-center gap-4 sticky top-0 z-50">
          {/* Brand = home link: KiteAI wordmark with the agent title stacked right
              under it (compact). On sub-pages the title gains a ← so it clearly reads
              as "back to the AI Leaderboard Agent landing page". */}
          <Link to="/" className="group flex flex-col leading-none" aria-label="Back to AI Leaderboard Agent home">
            <span className="text-lg font-extrabold tracking-tight select-none">
              <span className="text-gray-100">Kite</span><span className="text-[#00F5D4]">AI</span>
            </span>
            <span className="mt-1 text-[11px] font-medium tracking-tight text-gray-400 group-hover:text-[#00F5D4] transition-colors">
              {onLanding ? "AI Leaderboard Agent" : "← AI Leaderboard Agent"}
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

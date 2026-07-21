import { Outlet, Link } from "react-router-dom";
import BackendWakeup from "./BackendWakeup";
import ScanProgressBanner from "./ScanProgressBanner";

// Nav trimmed for platform embedding: no username / sign-out (the platform owns
// auth) and no admin link (admin actions require the maintainer login).
export default function Layout() {
  return (
    <div className="min-h-screen bg-[#0c0c14] text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6 sticky top-0 z-50">
        <Link to="/" className="text-lg font-bold text-indigo-400 tracking-tight">
          AI Leaderboard Agent
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
  );
}

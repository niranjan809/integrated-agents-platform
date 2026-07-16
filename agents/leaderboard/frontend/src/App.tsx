import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import DomainPage from "./pages/DomainPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import ComparePage from "./pages/ComparePage";
import SearchPage from "./pages/SearchPage";
import AdminPage from "./pages/AdminPage";
import AdminDomainPage from "./pages/AdminDomainPage";

// Login removed for platform integration — the KiteAI platform provides the single
// sign-in before this dashboard is ever reached, so pages render directly. Reads are
// public on the backend; admin writes still require a token (used by the maintainer).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/domain/:slug" element={<DomainPage />} />
          <Route path="/leaderboard/:id" element={<LeaderboardPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/search" element={<SearchPage />} />
        </Route>
        {/* No Layout wrapper — embedded standalone in the platform admin panel's
            Manage section, so no app nav / Compare button should show through. */}
        <Route path="/admin" element={<div className="max-w-7xl mx-auto px-4 py-6"><AdminPage /></div>} />
        <Route path="/admin/domain/:slug" element={<div className="max-w-7xl mx-auto px-4 py-6"><AdminDomainPage /></div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

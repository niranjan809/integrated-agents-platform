import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }       from './context/AuthContext';
import { AgentProvider } from './context/AgentContext';
import Sidebar        from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage      from './pages/LoginPage';
import LandingPage          from './pages/LandingPage';
import BrandVisibilityPage  from './pages/BrandVisibilityPage';
import PRAgentPage          from './pages/PRAgentPage';
import MarketIntelPage      from './pages/MarketIntelPage';
import LeaderboardAgentPage from './pages/LeaderboardAgentPage';
import Dashboard      from './pages/Dashboard';
import AgentRunner    from './pages/AgentRunner';
import AccountsPage   from './pages/AccountsPage';
import KeywordsPage   from './pages/KeywordsPage';
import SettingsPage   from './pages/SettingsPage';
import WorkflowPage   from './pages/WorkflowPage';
import PromptsPage    from './pages/PromptsPage';
import TasksPage      from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';

// The X Agent dashboard (sidebar layout). Mounted under the platform catch-all so the
// landing + agent-section pages can live at the top level.
function AppLayout() {
  return (
    // AgentProvider lives INSIDE the layout so the run survives page navigation
    <AgentProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/agent"       element={<AgentRunner />} />
            <Route path="/tasks"       element={<TasksPage />} />
            <Route path="/tasks/:id"   element={<TaskDetailPage />} />
            <Route path="/accounts"    element={<AccountsPage mode="all" />} />
            <Route path="/influencers" element={<AccountsPage mode="influencers" />} />
            <Route path="/pr-pages"    element={<AccountsPage mode="pr-pages" />} />
            <Route path="/keywords"    element={<KeywordsPage />} />
            <Route path="/settings"    element={<SettingsPage />} />
            <Route path="/workflow"    element={<WorkflowPage />} />
            <Route path="/prompts"     element={<PromptsPage />} />
            <Route path="*"            element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </AgentProvider>
  );
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="full-loader"><div className="spinner" /></div>;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Platform shell: landing + agent sections (no sidebar) */}
      <Route path="/"            element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
      <Route path="/brand"       element={<ProtectedRoute><BrandVisibilityPage /></ProtectedRoute>} />
      <Route path="/pr"          element={<ProtectedRoute><PRAgentPage /></ProtectedRoute>} />
      <Route path="/market-intel" element={<ProtectedRoute><MarketIntelPage /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardAgentPage /></ProtectedRoute>} />

      {/* X Agent dashboard (everything else, with sidebar) */}
      <Route path="/*" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

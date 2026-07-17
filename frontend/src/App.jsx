import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }       from './context/AuthContext';
import { AgentProvider } from './context/AgentContext';
import Sidebar        from './components/x/Sidebar';
import ProtectedRoute from './components/platform/ProtectedRoute';
import LoginPage      from './pages/platform/LoginPage';
import LandingPage    from './pages/platform/LandingPage';
import SectionPage    from './pages/platform/SectionPage';
import AgentEmbedPage from './pages/platform/AgentEmbedPage';
import AdminPage      from './pages/platform/AdminPage';
import AccountPage    from './pages/platform/AccountPage';
import Dashboard      from './pages/x/Dashboard';
import AgentRunner    from './pages/x/AgentRunner';
import AccountsPage   from './pages/x/AccountsPage';
import KeywordsPage   from './pages/x/KeywordsPage';
import SettingsPage   from './pages/x/SettingsPage';
import WorkflowPage   from './pages/x/WorkflowPage';
import PromptsPage    from './pages/x/PromptsPage';
import TasksPage      from './pages/x/TasksPage';
import TaskDetailPage from './pages/x/TaskDetailPage';

// Brand Visibility agent (multi-platform: X + LinkedIn)
import BrandVisibilityLayout from './components/brand-visibility/Layout';
import BvOverview  from './pages/brand-visibility/x/Overview';
import BvTweets    from './pages/brand-visibility/x/Tweets';
import BvKeywords  from './pages/brand-visibility/x/Keywords';
import BvPrompts   from './pages/brand-visibility/x/Prompts';
import BvScheduler from './pages/brand-visibility/x/Scheduler';
import BvManualRun from './pages/brand-visibility/x/ManualRun';
import BvHistory   from './pages/brand-visibility/x/History';
import BvLinkedInOverview from './pages/brand-visibility/linkedin/Overview';

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

      {/* Admin console — its own separate login (not the user ProtectedRoute) */}
      <Route path="/admin" element={<AdminPage />} />

      {/* Landing + section pages (agent catalogue, no sidebar) */}
      <Route path="/" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
      <Route path="/section/:sectionId" element={<ProtectedRoute><SectionPage /></ProtectedRoute>} />
      <Route path="/embed/:agentId" element={<ProtectedRoute><AgentEmbedPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

      {/* Brand Visibility agent dashboard (X + LinkedIn platforms, own sidebar) */}
      <Route path="/brand-visibility" element={
        <ProtectedRoute>
          <BrandVisibilityLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="x/overview" replace />} />
        <Route path="x/overview"  element={<BvOverview />} />
        <Route path="x/tweets"    element={<BvTweets />} />
        <Route path="x/keywords"  element={<BvKeywords />} />
        <Route path="x/prompts"   element={<BvPrompts />} />
        <Route path="x/scheduler" element={<BvScheduler />} />
        <Route path="x/manual"    element={<BvManualRun />} />
        <Route path="x/history"   element={<BvHistory />} />
        <Route path="linkedin/overview" element={<BvLinkedInOverview />} />
        <Route path="linkedin/*" element={<Navigate to="/brand-visibility/linkedin/overview" replace />} />
      </Route>

      {/* X Agent dashboard (everything else, with sidebar) */}
      <Route path="/*" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

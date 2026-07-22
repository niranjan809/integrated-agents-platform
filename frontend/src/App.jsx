import { Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth }       from './context/AuthContext';
import { AgentProvider } from './context/AgentContext';
import Sidebar        from './components/x/Sidebar';
import ProtectedRoute from './components/platform/ProtectedRoute';
import SectionGuard   from './components/platform/SectionGuard';
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
import LinkedInComingSoon from './pages/brand-visibility/linkedin/ComingSoon';

// Creator Radar agent (Instagram + TikTok; platform via cr_selected_platform)
import CrLayout    from './components/creator-radar/Layout';
import CrOverview  from './pages/creator-radar/Overview';
import CrAccounts  from './pages/creator-radar/Accounts';
import CrSearch    from './pages/creator-radar/Search';
import CrKeywords  from './pages/creator-radar/Keywords';
import CrPrompts   from './pages/creator-radar/Prompts';
import CrServices  from './pages/creator-radar/Services';
import CrScheduler from './pages/creator-radar/Scheduler';

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

// Brand Visibility platform routing. Platform is chosen via ?platform=x|linkedin
// (default x). X sections render the real X pages; LinkedIn renders the Coming Soon
// placeholder for every section until LinkedIn data is wired up.
function PlatformRouter({ X }) {
  const [searchParams] = useSearchParams();
  const platform = searchParams.get('platform') || 'x';
  if (platform === 'linkedin') return <LinkedInComingSoon />;
  return <X />;
}

// Index / unknown sub-path → land on Overview, keeping the active platform.
function PlatformIndexRedirect() {
  const [searchParams] = useSearchParams();
  const platform = searchParams.get('platform') || 'x';
  return <Navigate to={`/brand-visibility/overview?platform=${platform}`} replace />;
}

// Backwards-compat for the old /brand-visibility/{platform}/{section} URLs:
// redirect to the new /brand-visibility/{section}?platform={platform} shape so
// existing bookmarks and links keep working.
function LegacyRedirect({ platform }) {
  const { section } = useParams();
  return <Navigate to={`/brand-visibility/${section || 'overview'}?platform=${platform}`} replace />;
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
      <Route path="/section/:sectionId" element={<ProtectedRoute><SectionGuard><SectionPage /></SectionGuard></ProtectedRoute>} />
      <Route path="/embed/:agentId" element={<ProtectedRoute><AgentEmbedPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

      {/* Brand Visibility agent dashboard (X + LinkedIn platforms, own sidebar) */}
      <Route path="/brand-visibility" element={
        <ProtectedRoute>
          <SectionGuard section="brand-visibility">
            <BrandVisibilityLayout />
          </SectionGuard>
        </ProtectedRoute>
      }>
        <Route index element={<PlatformIndexRedirect />} />
        {/* Single set of section routes; ?platform= selects X vs LinkedIn. */}
        <Route path="overview"  element={<PlatformRouter X={BvOverview} />} />
        <Route path="tweets"    element={<PlatformRouter X={BvTweets} />} />
        <Route path="keywords"  element={<PlatformRouter X={BvKeywords} />} />
        <Route path="prompts"   element={<PlatformRouter X={BvPrompts} />} />
        <Route path="scheduler" element={<PlatformRouter X={BvScheduler} />} />
        <Route path="manual"    element={<PlatformRouter X={BvManualRun} />} />
        <Route path="history"   element={<PlatformRouter X={BvHistory} />} />
        {/* Backwards-compat: old /brand-visibility/{platform}/{section} → new shape. */}
        <Route path="x" element={<Navigate to="/brand-visibility/overview?platform=x" replace />} />
        <Route path="x/:section" element={<LegacyRedirect platform="x" />} />
        <Route path="linkedin" element={<Navigate to="/brand-visibility/overview?platform=linkedin" replace />} />
        <Route path="linkedin/:section" element={<LegacyRedirect platform="linkedin" />} />
        <Route path="*" element={<PlatformIndexRedirect />} />
      </Route>

      {/* Creator Radar agent dashboard (Instagram + TikTok, own sidebar). Platform
          selection lives in sessionStorage (cr_selected_platform), not the URL. */}
      <Route path="/creator-radar" element={
        <ProtectedRoute>
          <SectionGuard section="creator-radar">
            <CrLayout />
          </SectionGuard>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/creator-radar/overview" replace />} />
        <Route path="overview"  element={<CrOverview />} />
        <Route path="accounts"  element={<CrAccounts />} />
        <Route path="search"    element={<CrSearch />} />
        <Route path="keywords"  element={<CrKeywords />} />
        <Route path="prompts"   element={<CrPrompts />} />
        <Route path="services"  element={<CrServices />} />
        <Route path="scheduler" element={<CrScheduler />} />
        <Route path="*" element={<Navigate to="/creator-radar/overview" replace />} />
      </Route>

      {/* X Agent dashboard (everything else, with sidebar) — the X Agent is the
          'pr' section, so gate the whole shell on pr access. */}
      <Route path="/*" element={
        <ProtectedRoute>
          <SectionGuard section="pr">
            <AppLayout />
          </SectionGuard>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

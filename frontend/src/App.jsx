import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }       from './context/AuthContext';
import { AgentProvider } from './context/AgentContext';
import Sidebar        from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage      from './pages/LoginPage';
import Dashboard      from './pages/Dashboard';
import AgentRunner    from './pages/AgentRunner';
import AccountsPage   from './pages/AccountsPage';
import KeywordsPage   from './pages/KeywordsPage';
import SettingsPage   from './pages/SettingsPage';
import WorkflowPage   from './pages/WorkflowPage';
import PromptsPage    from './pages/PromptsPage';

function AppLayout() {
  return (
    // AgentProvider lives INSIDE the layout so the run survives page navigation
    <AgentProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/agent"       element={<AgentRunner />} />
            <Route path="/accounts"    element={<AccountsPage mode="all" />} />
            <Route path="/influencers" element={<AccountsPage mode="influencers" />} />
            <Route path="/pr-pages"    element={<AccountsPage mode="pr-pages" />} />
            <Route path="/keywords"    element={<KeywordsPage />} />
            <Route path="/settings"    element={<SettingsPage />} />
            <Route path="/workflow"    element={<WorkflowPage />} />
            <Route path="/prompts"     element={<PromptsPage />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
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
      <Route path="/*" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { PlatformProvider } from '../../pages/creator-radar/platform/PlatformContext';
import PlatformToggle from '../../pages/creator-radar/platform/PlatformToggle';

// Mirrors components/brand-visibility/Layout.jsx: sidebar on the left, an
// <Outlet /> content area, and a platform switcher at the top of the content.
// The whole shell is wrapped in PlatformProvider so every nested page can read
// the selected platform (cr_selected_platform) via usePlatform(). PlatformProvider
// depends on useAuth, which is available here since the layout renders inside the
// app's AuthProvider.
export default function CreatorRadarLayout() {
  return (
    <PlatformProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div className="platform-tabs">
            <PlatformToggle />
          </div>
          <Outlet />
        </main>
      </div>
    </PlatformProvider>
  );
}

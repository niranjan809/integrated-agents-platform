import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import PlatformTabs from './PlatformTabs';

export default function BrandVisibilityLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <PlatformTabs />
        <Outlet />
      </main>
    </div>
  );
}

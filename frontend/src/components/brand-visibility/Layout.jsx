import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import Sidebar from './Sidebar';

// X | LinkedIn platform switcher. Platform lives in the URL query (?platform=x|linkedin)
// so the section route stays the same across platforms — switching a tab only swaps
// the query param and keeps you on the current section (Overview, Tweets, …).
function PlatformTabs() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const platform = searchParams.get('platform') || 'x';

  // Preserve the current section (pathname) when switching platforms.
  const tabTo = (p) => ({ pathname: location.pathname, search: `?platform=${p}` });
  const cls = (p) => `platform-tab${platform === p ? ' active' : ''}`;

  return (
    <div className="platform-tabs">
      <Link to={tabTo('x')} className={cls('x')}>X</Link>
      <Link to={tabTo('linkedin')} className={cls('linkedin')}>
        LinkedIn <span className="badge grey" style={{ marginLeft: 6 }}>Soon</span>
      </Link>
    </div>
  );
}

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

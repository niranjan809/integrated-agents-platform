import { NavLink, useLocation } from 'react-router-dom';

// X | LinkedIn platform switcher. Preserves the current section when switching
// platforms. Section is derived from the pathname (routes are static, not
// parametrised, so useParams has no `section`): /brand-visibility/{platform}/{section}.
export default function PlatformTabs() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean); // ['brand-visibility', platform, section]
  const section = parts[2] || 'overview';

  const cls = ({ isActive }) => `platform-tab${isActive ? ' active' : ''}`;

  return (
    <div className="platform-tabs">
      <NavLink to={`/brand-visibility/x/${section}`} className={cls}>X</NavLink>
      <NavLink to={`/brand-visibility/linkedin/${section}`} className={cls}>LinkedIn</NavLink>
    </div>
  );
}

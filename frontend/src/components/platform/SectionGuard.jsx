import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Gate a section route by the JWT's sections_allowed. Pass an explicit `section`
// (static routes like /brand-visibility) or let it read :sectionId from the URL
// (dynamic /section/:sectionId). Not authed -> /login; wrong section -> landing
// with a deniedSection notice. Panel-admin never reaches here (no user JWT).
export default function SectionGuard({ section, children }) {
  const { user } = useAuth();
  const location = useLocation();
  const params = useParams();
  const target = section || params.sectionId;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Panel-admin sees everything (parity with backend requireSection). Inert in
  // the current model — panel-admin has no user-JWT session, so `user` is null
  // and we already redirected above — but kept intentional for future parity.
  if (user.scope === 'panel-admin') return children;

  const allowed = user.sections_allowed || [];
  if (target && !allowed.includes(target)) {
    return <Navigate to="/" state={{ deniedSection: target }} replace />;
  }
  return children;
}

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PlatformShell from '../../components/platform/PlatformShell';
import UsersTab from './account/UsersTab';
import AuditLogTab from './account/AuditLogTab';
import MyAccountTab from './account/MyAccountTab';

// /account — user-JWT (AuthContext) admin/self-service surface. NOT the panel
// admin console (/admin), which uses a separate token. Tabs are role-gated:
// Users + Audit Log are admin-only; My Account is for everyone.
const ADMIN_TABS = ['users', 'audit'];

export default function AccountPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';

  const requested = params.get('tab');
  const defaultTab = isAdmin ? 'users' : 'me';
  const tab = requested || defaultTab;

  // A non-admin who lands on an admin-only tab is redirected to My Account.
  const denied = !isAdmin && ADMIN_TABS.includes(tab);
  useEffect(() => {
    if (denied) setParams({ tab: 'me' }, { replace: true });
  }, [denied, setParams]);

  const tabs = [
    ...(isAdmin ? [{ key: 'users', label: 'Users' }, { key: 'audit', label: 'Audit Log' }] : []),
    { key: 'me', label: 'My Account' },
  ];
  const active = denied ? 'me' : tab;

  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Account</div>
      <h1 className="shell-h1" style={{ marginBottom: 4 }}>Account</h1>
      <p className="shell-sub">User management, audit trail, and your account settings</p>

      {denied && <div className="page-error">Admin only — redirected to your account.</div>}

      <div className="admin-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`admin-tab${active === t.key ? ' admin-tab-active' : ''}`}
            onClick={() => setParams({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Only the active tab mounts, so each tab fetches lazily on open. */}
      {active === 'users' && isAdmin && <UsersTab />}
      {active === 'audit' && isAdmin && <AuditLogTab />}
      {active === 'me' && <MyAccountTab />}
    </PlatformShell>
  );
}

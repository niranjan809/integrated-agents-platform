import { useAuth } from '../../context/AuthContext';
import PlatformShell from '../../components/platform/PlatformShell';
import MyAccountTab from './account/MyAccountTab';

// /account — user-JWT self-service only (identity + change password). User and
// audit-log MANAGEMENT moved to the panel-admin console (/admin) per the RBAC
// restructure. Not gated by role: every logged-in user manages their own account.
export default function AccountPage() {
  useAuth(); // ensures the page is used within the authed shell

  return (
    <PlatformShell>
      <div className="shell-eyebrow">KiteAI · Account</div>
      <h1 className="shell-h1" style={{ marginBottom: 4 }}>My Account</h1>
      <p className="shell-sub">Your account details and password</p>
      <MyAccountTab />
    </PlatformShell>
  );
}

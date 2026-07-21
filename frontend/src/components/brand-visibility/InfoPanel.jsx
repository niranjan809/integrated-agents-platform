import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Shared bordered panel for the Brand Visibility X info sections.
//
// Props:
//   title       — panel heading (string)
//   children    — panel body
//   adminOnly   — when true, renders nothing unless the current user is an admin
//                 (tiered visibility: admin-only context stays hidden otherwise)
//   collapsible — when true, the header toggles the body open/closed
//                 (default false; panels start expanded)
export default function InfoPanel({ title, children, adminOnly = false, collapsible = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  // Gate before rendering anything — a non-admin never sees an admin-only panel.
  if (adminOnly && user?.role !== 'admin') return null;

  return (
    <div className={`info-panel${adminOnly ? ' admin-only' : ''}`}>
      <div
        className={`info-panel-header${collapsible ? ' collapsible' : ''}`}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }) : undefined}
      >
        <span className="info-panel-title">{title}</span>
        {adminOnly && <span className="info-panel-badge">Admin</span>}
        {collapsible && <span className="info-panel-caret">{open ? '▲' : '▼'}</span>}
      </div>
      {(!collapsible || open) && <div className="info-panel-body">{children}</div>}
    </div>
  );
}

// LinkedIn platform placeholder — shown for every sidebar section when the
// active platform is LinkedIn (?platform=linkedin). No data wiring yet; X is the
// only platform currently connected to real data.
export default function LinkedInComingSoon() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>LinkedIn</h1>
        <p className="page-sub">Brand Visibility · Coming Soon</p>
      </div>
      <div className="empty-state">
        <p>LinkedIn integration is under development.</p>
        <p style={{ color: 'var(--text-muted)' }}>
          Currently only X (Twitter) data is available. LinkedIn will be enabled
          in a future release.
        </p>
      </div>
    </div>
  );
}

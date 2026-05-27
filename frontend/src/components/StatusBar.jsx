export default function StatusBar({ state, status, duration, endpoint, params }) {
  if (state === 'idle') return (
    <div className="status-bar idle">
      Enter values and click Test to call the API
    </div>
  );
  if (state === 'loading') return (
    <div className="status-bar loading">
      <div className="spinner" />
      Calling {endpoint} ...
    </div>
  );
  if (state === 'success') return (
    <div className="status-bar success">
      <span>✓ Success</span>
      {status && <span className="status-code">{status}</span>}
      {endpoint && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{endpoint}</span>}
      {duration && <span className="duration">{duration}ms</span>}
    </div>
  );
  if (state === 'error') return (
    <div className="status-bar error">
      <span>✗ Error</span>
      {status && <span className="status-code">{status}</span>}
      {duration && <span className="duration">{duration}ms</span>}
    </div>
  );
  return null;
}

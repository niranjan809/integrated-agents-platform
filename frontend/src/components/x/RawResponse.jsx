import { useState } from 'react';

export default function RawResponse({ data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="raw-section">
      <button className="raw-toggle" onClick={() => setOpen(o => !o)}>
        <span className="arrow" style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        Raw JSON Response
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--mono)',
          color: 'var(--text-muted)' }}>
          {JSON.stringify(data).length.toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div className="raw-box">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

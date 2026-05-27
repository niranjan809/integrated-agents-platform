// Shows which agent-required fields are present in the API response
export default function AgentFields({ fields }) {
  // fields = [{ label, status: 'found'|'missing'|'partial', value }]
  if (!fields || !fields.length) return null;
  return (
    <div className="agent-fields">
      <div className="agent-fields-title">Agent Required Fields — Coverage Check</div>
      <div className="agent-field-tags">
        {fields.map(f => (
          <span key={f.label} className={`agent-tag ${f.status}`} title={f.value ?? ''}>
            {f.status === 'found' ? '✓' : f.status === 'partial' ? '~' : '✗'} {f.label}
            {f.value !== undefined && f.value !== null && f.status === 'found'
              ? `: ${String(f.value).slice(0, 30)}`
              : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

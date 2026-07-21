import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import InfoPanel from '../../../components/brand-visibility/InfoPanel';
import { promptPurposeText } from '../../../constants/agentInfo';

// Suggest the next version from the current one: v1 -> v2, else append -next.
function suggestNextVersion(ver) {
  if (!ver) return 'v1';
  const m = /^v(\d+)$/.exec(ver);
  return m ? `v${Number(m[1]) + 1}` : `${ver}-next`;
}

export default function Prompts() {
  const { apiFetch, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [meta, setMeta] = useState(null);           // { prompt_version, classification_model, prompt_purpose }
  const [prompt, setPrompt] = useState(null);       // { version, content, updated_at }
  const [content, setContent] = useState('');        // working copy
  const [version, setVersion] = useState('');        // version to save as
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);        // { type, message }

  function load() {
    setLoading(true);
    setError(null);
    apiFetch('/api/brand-visibility/config/x/active-prompt')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`prompt ${r.status}`)))
      .then(d => {
        setPrompt(d);
        setContent(d.content || '');
        setVersion(suggestNextVersion(d.version));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  // Prompt Context panel is admin-only — only admins can read /x/prompts-meta.
  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    apiFetch('/api/brand-visibility/config/x/prompts-meta')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`prompts-meta ${r.status}`)))
      .then(d => { if (alive) setMeta(d); })
      .catch(() => { if (alive) setMeta({ prompt_purpose: promptPurposeText }); });
    return () => { alive = false; };
  }, [isAdmin]);

  const dirty = useMemo(() => prompt != null && content !== (prompt.content || ''), [content, prompt]);

  function discard() {
    if (!prompt) return;
    setContent(prompt.content || '');
    setStatus(null);
  }

  async function save() {
    if (!content.trim()) { setStatus({ type: 'error', message: 'Prompt cannot be empty.' }); return; }
    if (!version.trim()) { setStatus({ type: 'error', message: 'A version label is required.' }); return; }
    setSaving(true);
    setStatus(null);
    try {
      // Write goes through the JWT-authed Node gateway (which injects X-Cron-Secret).
      // Python's POST /api/x/active-prompt is locked down (P0); direct would 401.
      const r = await apiFetch('/api/brand-visibility/config/x/active-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt_text: content, prompt_version: version.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || `save failed (${r.status})`);
      // Response is the new active row; adopt it as current.
      const saved = { version: d.version ?? version.trim(), content: d.content ?? content, updated_at: d.updated_at };
      setPrompt(saved);
      setContent(saved.content);
      setVersion(suggestNextVersion(saved.version));
      setStatus({ type: 'success', message: `Saved as ${saved.version}.` });
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error) return <div className="page-error">Failed to load: {error}</div>;

  return (
    <div className="page prompts-page">
      <div className="page-header prompts-header">
        <div>
          <h1>Classifier Prompt</h1>
          <p className="page-sub">
            X · Gemini classification prompt
            {prompt?.updated_at ? ` · updated ${new Date(prompt.updated_at).toLocaleString()}` : ''}
          </p>
        </div>
        <span className="prompt-version-badge">{prompt?.version || '—'} · Active</span>
      </div>

      {/* Prompt Context — admin-only. Renders nothing for non-admins. */}
      <InfoPanel title="Prompt Context" adminOnly>
        <p className="info-panel-text">{meta?.prompt_purpose || promptPurposeText}</p>
        <div className="info-kv-grid">
          <div className="info-kv">
            <span className="info-kv-label">Current version</span>
            <span className="info-kv-value">{meta?.prompt_version || prompt?.version || '—'}</span>
          </div>
          <div className="info-kv">
            <span className="info-kv-label">Classification model</span>
            <span className="info-kv-value">{meta?.classification_model || '—'}</span>
          </div>
        </div>
      </InfoPanel>

      {status && (
        <div className={status.type === 'success' ? 'page-success' : 'page-error'}>{status.message}</div>
      )}

      <textarea
        className="prompt-editor"
        value={content}
        onChange={e => setContent(e.target.value)}
        spellCheck={false}
      />

      <div className="prompt-meta">
        <span className="prompt-charcount">
          {content.length.toLocaleString()} / 50,000 characters
          {dirty && <span className="prompt-dirty"> · unsaved changes</span>}
        </span>
      </div>

      <div className="prompt-actions">
        <label className="prompt-version-field">
          <span>Save as version</span>
          <input
            className="search-input"
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="v2"
          />
        </label>
        <div className="prompt-actions-btns">
          <button className="btn-ghost" onClick={discard} disabled={!dirty || saving}>Discard changes</button>
          <button className="btn-primary" onClick={save} disabled={saving || !content.trim()}>
            {saving ? 'Saving…' : 'Save as new version'}
          </button>
        </div>
      </div>
    </div>
  );
}

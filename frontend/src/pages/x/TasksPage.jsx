import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function TasksPage() {
  const { apiFetch } = useAuth();
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name,    setName]    = useState('');
  const [company, setCompany] = useState('');
  const [keywords, setKeywords] = useState('');
  const [saving,  setSaving]  = useState(false);

  function load() {
    setLoading(true);
    apiFetch('/api/pr/tasks').then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  async function createTask(e) {
    e.preventDefault();
    if (!name.trim() || !keywords.trim()) return;
    setSaving(true); setError('');
    try {
      const r = await apiFetch('/api/pr/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), company: company.trim(), keywords }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to create task');
      setName(''); setCompany(''); setKeywords(''); setShowForm(false);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this task? (Accounts stay in the database — only the task link is removed.)')) return;
    await apiFetch(`/api/pr/tasks/${id}`, { method: 'DELETE' });
    load();
  }

  const fillPerplexity = () => {
    setName('Perplexity AI'); setCompany('Perplexity');
    setKeywords('perplexity ai, perplexity pro, perplexity comet, perplexity sonar, perplexity review, perplexity vs');
    setShowForm(true);
  };

  return (
    <div className="page tasks-page">
      <div className="page-header">
        <div>
          <h1>Tasks</h1>
          <p className="page-sub">Target a company or product — fetch & sort matching X accounts into the 4 buckets, per task.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={fillPerplexity}>✦ Perplexity example</button>
          <button className="btn-primary" onClick={() => setShowForm(s => !s)}>{showForm ? 'Cancel' : '＋ New Task'}</button>
        </div>
      </div>

      {error && <div className="conn-error">⚠ {error}</div>}

      {showForm && (
        <form className="task-form dash-card" onSubmit={createTask}>
          <div className="tf-row">
            <label>Task name *
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Perplexity AI" />
            </label>
            <label>Company / product
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Perplexity" />
            </label>
          </div>
          <label>Keywords * <span className="tf-hint">(comma or new-line separated — these are searched on X)</span>
            <textarea value={keywords} onChange={e => setKeywords(e.target.value)} rows={3}
              placeholder='perplexity ai, perplexity pro, perplexity comet, perplexity sonar, perplexity review, perplexity vs' />
          </label>
          <button className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Task'}</button>
        </form>
      )}

      {loading ? <div className="page-loader"><div className="spinner" /></div> : (
        tasks.length === 0 ? (
          <div className="empty-state">No tasks yet — create one to target a company's keywords.</div>
        ) : (
          <div className="task-grid">
            {tasks.map(t => (
              <div key={t.id} className="task-card">
                <div className="task-card-head">
                  <Link to={`/tasks/${t.id}`} className="task-name">{t.name}</Link>
                  <span className={`task-status status-${t.status}`}>{t.status}</span>
                </div>
                {t.company && <div className="task-company">{t.company}</div>}
                <div className="task-kw">{t.keywords.slice(0, 6).map(k => <span key={k} className="kw-chip">{k}</span>)}
                  {t.keywords.length > 6 && <span className="kw-chip more">+{t.keywords.length - 6}</span>}
                </div>
                <div className="task-counts">
                  <span className="tc tc-g" title="A1 confirmed paid">💰 {t.counts.a1}</span>
                  <span className="tc tc-p" title="A2 genuine">✦ {t.counts.a2_genuine}</span>
                  <span className="tc tc-y" title="Salesy / low">⚠ {t.counts.a2_salesy}</span>
                  <span className="tc tc-d" title="A2 unscored">◷ {t.counts.a2_unscored}</span>
                  <span className="tc tc-b" title="Total accounts">Σ {t.counts.total}</span>
                </div>
                <div className="task-actions">
                  <Link to={`/tasks/${t.id}`} className="btn-ghost sm">Open →</Link>
                  <button className="btn-danger sm" onClick={() => remove(t.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

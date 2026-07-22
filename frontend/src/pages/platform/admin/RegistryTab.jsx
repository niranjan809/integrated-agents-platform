import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSections } from '../../../hooks/useSections';
import { useAgents } from '../../../hooks/useAgents';
import SectionFormModal from './SectionFormModal';
import AgentFormModal from './AgentFormModal';

// Agents & Sections registry admin. `fetcher` carries the panel-admin token.
// Two sub-tabs (Agents / Sections), deep-linkable via ?sub=. System entries are
// shown read-only; dynamic entries are CRUD-able.
export default function RegistryTab({ fetcher }) {
  const [params, setParams] = useSearchParams();
  const sub = params.get('sub') === 'sections' ? 'sections' : 'agents';
  const setSub = (s) => setParams({ tab: 'registry', sub: s });

  // System (read-only) lists + cache invalidators for the shared hooks.
  const { sections: secData, invalidate: invSec } = useSections(fetcher);
  const { agents: agtData, invalidate: invAgt } = useAgents(fetcher);

  const [dynSections, setDynSections] = useState([]);
  const [dynAgents, setDynAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);

  const [modal, setModal] = useState(null);     // { kind:'section'|'agent', mode:'add'|'edit', row? }
  const [confirm, setConfirm] = useState(null);  // { kind:'section'|'agent', row }
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true); setError(null);
    Promise.all([
      fetcher('/api/admin/sections').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sections ${r.status}`)))),
      fetcher('/api/admin/agents').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`agents ${r.status}`)))),
    ])
      .then(([s, a]) => { setDynSections(s.sections || []); setDynAgents(a.agents || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Section dropdown options for the agent form = system + dynamic sections.
  const sectionOptions = useMemo(() => {
    const sys = (secData?.system || []).map((s) => ({ id: s.id, name: s.name }));
    const custom = dynSections.map((s) => ({ id: s.id, name: s.name }));
    const seen = new Set();
    return [...sys, ...custom].filter((s) => (seen.has(s.id) ? false : seen.add(s.id)));
  }, [secData, dynSections]);

  function afterSave(msg) {
    setModal(null);
    setBanner(msg);
    invSec(); invAgt();     // clear shared caches so Landing/Users see the change
    load();
  }

  async function doDelete() {
    const { kind, row } = confirm;
    setDeleting(true); setError(null);
    try {
      const url = kind === 'section' ? `/api/admin/sections/${row.id}` : `/api/admin/agents/${row.id}`;
      const r = await fetcher(url, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const extra = d.agent_count != null ? ` (${d.agent_count} agent${d.agent_count === 1 ? '' : 's'})` : '';
        setError((d.error || `Delete failed (${r.status})`) + extra);
        setConfirm(null);
        return;
      }
      setBanner(`${kind === 'section' ? 'Section' : 'Agent'} deleted.`);
      setConfirm(null);
      invSec(); invAgt();
      load();
    } catch (e) { setError(e.message); }
    finally { setDeleting(false); }
  }

  const systemSections = secData?.system || [];
  const systemAgents = agtData?.system || [];

  return (
    <div className="account-tabpane registry-tab">
      {banner && <div className="page-success" onClick={() => setBanner(null)}>{banner}</div>}
      {error && <div className="page-error" onClick={() => setError(null)}>{error}</div>}

      {/* Sub-tab switch */}
      <div className="registry-subtabs">
        <button className={`registry-subtab${sub === 'agents' ? ' active' : ''}`} onClick={() => setSub('agents')}>Agents</button>
        <button className={`registry-subtab${sub === 'sections' ? ' active' : ''}`} onClick={() => setSub('sections')}>Sections</button>
      </div>

      {loading ? <div className="empty-state">Loading registry…</div> : sub === 'sections' ? (
        <>
          {/* Dynamic sections */}
          <div className="registry-head">
            <h2 className="admin-h" style={{ margin: 0 }}>Custom sections</h2>
            <button className="btn-primary" onClick={() => setModal({ kind: 'section', mode: 'add' })}>+ Add Section</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Name</th><th>Icon</th><th>Order</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody>
                {dynSections.length === 0 && <tr><td colSpan={6}><div className="empty-state">No custom sections yet.</div></td></tr>}
                {dynSections.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.id}</td>
                    <td>{s.icon} {s.name}</td>
                    <td>{s.icon}</td>
                    <td>{s.display_order}</td>
                    <td>{s.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost sm" onClick={() => setModal({ kind: 'section', mode: 'edit', row: s })}>Edit</button>
                        <button className="btn-danger sm" onClick={() => setConfirm({ kind: 'section', row: s })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* System sections (read-only) */}
          <h2 className="admin-h">System sections <span className="kw-ro">read-only</span></h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
              <tbody>
                {systemSections.map((s) => (
                  <tr key={s.id}><td className="mono">{s.id}</td><td>{s.icon} {s.name}</td><td>{s.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Dynamic agents */}
          <div className="registry-head">
            <h2 className="admin-h" style={{ margin: 0 }}>Custom agents</h2>
            <button className="btn-primary" onClick={() => setModal({ kind: 'agent', mode: 'add' })}>+ Add Agent</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Name</th><th>Section</th><th>Surface</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {dynAgents.length === 0 && <tr><td colSpan={6}><div className="empty-state">No custom agents yet.</div></td></tr>}
                {dynAgents.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.id}</td>
                    <td>{a.icon} {a.name}</td>
                    <td>{a.section_name || a.section_id}</td>
                    <td>{a.surface}</td>
                    <td><span className={`status-badge status-${a.status.replace('_', '-')}`}>{a.status.replace('_', ' ')}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost sm" onClick={() => setModal({ kind: 'agent', mode: 'edit', row: a })}>Edit</button>
                        <button className="btn-danger sm" onClick={() => setConfirm({ kind: 'agent', row: a })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* System agents (read-only) */}
          <h2 className="admin-h">System agents <span className="kw-ro">read-only</span></h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Name</th><th>Section</th><th>Surface</th><th>Status</th></tr></thead>
              <tbody>
                {systemAgents.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.id}</td><td>{a.icon} {a.name}</td>
                    <td>{a.sectionId}</td><td>{a.surface}</td><td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add / edit modals */}
      {modal?.kind === 'section' && (
        <SectionFormModal
          mode={modal.mode} row={modal.row} fetcher={fetcher}
          onClose={() => setModal(null)}
          onSaved={() => afterSave(modal.mode === 'add' ? 'Section created.' : 'Section updated.')}
        />
      )}
      {modal?.kind === 'agent' && (
        <AgentFormModal
          mode={modal.mode} row={modal.row} sections={sectionOptions} fetcher={fetcher}
          onClose={() => setModal(null)}
          onSaved={() => afterSave(modal.mode === 'add' ? 'Agent created.' : 'Agent updated.')}
        />
      )}

      {/* Delete confirmation */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Delete {confirm.kind}?</h2>
            <p>Permanently delete <strong>{confirm.row.name}</strong> (<code>{confirm.row.id}</code>)?
              {confirm.kind === 'section' && ' Sections with agents can’t be deleted until their agents are removed.'}</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={doDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

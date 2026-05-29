import { createContext, useContext, useState, useRef, useCallback } from 'react';

const AgentContext = createContext(null);
const API = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export function AgentProvider({ children }) {
  const [running,  setRunning]  = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [errCards, setErrCards] = useState([]);
  const [stepLog,  setStepLog]  = useState([]);
  const [progress, setProgress] = useState(0);
  const [summary,  setSummary]  = useState(null);
  const [connErr,  setConnErr]  = useState('');
  const [stats,    setStats]    = useState({ added: 0, updated: 0, errors: 0 });

  const esRef          = useRef(null);
  const completedRef   = useRef(false);
  const doneCallbacks  = useRef([]);  // components register here to hear run completion

  const addLog = useCallback((msg, type = 'info') => {
    setStepLog(prev => [...prev.slice(-299), { msg, type, ts: Date.now() }]);
  }, []);

  // Dashboard (or any page) can register a callback to run when agent finishes
  const onRunComplete = useCallback((cb) => {
    doneCallbacks.current.push(cb);
    return () => { doneCallbacks.current = doneCallbacks.current.filter(f => f !== cb); };
  }, []);

  function startRun(query = '') {
    if (running) return;

    setRunning(true);
    setAccounts([]);
    setErrCards([]);
    setStepLog([]);
    setProgress(0);
    setSummary(null);
    setConnErr('');
    setStats({ added: 0, updated: 0, errors: 0 });
    completedRef.current = false;

    const token = localStorage.getItem('kiteai_token');
    if (!token) {
      setConnErr('Not authenticated — please log in again.');
      setRunning(false);
      return;
    }

    const params = new URLSearchParams({ _token: token });
    if (query.trim()) params.set('query', query.trim());

    let es;
    try {
      es = new EventSource(`${API}/api/run-demo?${params.toString()}`);
    } catch {
      setConnErr(`Cannot connect to backend at ${API} — is the server running?`);
      setRunning(false);
      return;
    }
    esRef.current = es;

    es.onopen = () => {
      setConnErr('');
      addLog('Agent started — fetching all keywords…', 'success');
    };

    es.addEventListener('status', e => {
      try {
        const d = JSON.parse(e.data);
        const type = d.step === 'pacing' ? 'pace'
          : d.step === 'ai_scoring'       ? 'ai'
          : d.step === 'delay'            ? 'delay'
          : 'info';
        addLog(d.message, type);
        if (d.progress !== undefined) setProgress(d.progress);
      } catch {}
    });

    es.addEventListener('search_done', e => {
      try {
        const d = JSON.parse(e.data);
        if (d.fetching > 0)
          addLog(`"${d.query}" — ${d.found} found, fetching ${d.fetching} new`, 'success');
        else
          addLog(`"${d.query}" — all already in database`, 'warn');
      } catch {}
    });

    es.addEventListener('account', e => {
      try {
        const { account } = JSON.parse(e.data);
        setAccounts(prev => {
          const idx = prev.findIndex(a => a.handle === account.handle);
          if (idx >= 0) { const n = [...prev]; n[idx] = account; return n; }
          return [...prev, account];
        });
        setStats(prev => ({
          added:   prev.added   + (account.isDuplicate ? 0 : 1),
          updated: prev.updated + (account.isDuplicate ? 1 : 0),
          errors:  prev.errors,
        }));
        const tag   = account.isDuplicate ? '[updated]' : '[saved]';
        const model = account.ai_model
          ? account.ai_model.split('/')[1]?.split('-').slice(0, 2).join('-')
          : 'kw';
        addLog(
          `@${account.handle} · ${account.overall}pts · ${account.account_type} · ${model} ${tag}`,
          'account'
        );
        if (account.index && account.total)
          setProgress(Math.round((account.index / account.total) * 100));
      } catch {}
    });

    es.addEventListener('fetch_error', e => {
      try {
        const d = JSON.parse(e.data);
        setErrCards(prev => [...prev, d]);
        setStats(prev => ({ ...prev, errors: prev.errors + 1 }));
        addLog(`Failed @${d.handle}: HTTP ${d.status}`, 'error');
      } catch {}
    });

    es.addEventListener('quota_exhausted', e => {
      try {
        const d = JSON.parse(e.data);
        setConnErr(`⛔ ${d.message}`);
        addLog(`API quota exhausted — ${d.message}`, 'error');
        completedRef.current = true; // treat as graceful end
      } catch {}
    });

    es.addEventListener('error', e => {
      try {
        const d = JSON.parse(e.data);
        addLog(`Search failed: ${d.message}`, 'error');
      } catch {}
    });

    es.addEventListener('complete', e => {
      try {
        const d = JSON.parse(e.data);
        completedRef.current = true;
        setSummary(d);
        if (d.quotaExhausted) {
          addLog(`⚠️ Run stopped early — API quota exhausted. ${d.accountsAdded ?? 0} new accounts saved.`, 'warn');
        } else {
          addLog(`✅ Run complete — ${d.accountsAdded ?? 0} new · ${d.duplicatesSkipped ?? 0} updated · ${d.errors ?? 0} errors`, 'success');
        }
        setProgress(100);
        doneCallbacks.current.forEach(cb => { try { cb(d); } catch {} });
      } catch {}
      setRunning(false);
      es.close();
    });

    es.onerror = () => {
      if (completedRef.current) { es.close(); return; }
      if (esRef.current === es) {
        setConnErr(`Connection lost — the backend stopped responding. Check it is running at ${API} and try again.`);
        addLog('Stream disconnected', 'error');
        setRunning(false);
      }
      es.close();
    };
  }

  function stopRun() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
    addLog('Run stopped by user', 'warn');
  }

  return (
    <AgentContext.Provider value={{
      running, accounts, errCards, stepLog, progress, summary, connErr, stats,
      startRun, stopRun, onRunComplete,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export const useAgent = () => useContext(AgentContext);

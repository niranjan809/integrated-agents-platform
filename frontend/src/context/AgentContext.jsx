import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

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
  const [apiLog,   setApiLog]   = useState([]); // raw request/response strings
  const [serverActive, setServerActive] = useState(false); // run active server-side (from status poll)
  const [runProgress,  setRunProgress]  = useState(null);  // { overallPct, phase, currentQuery, queriesDone, totalQueries }

  const esRef          = useRef(null);
  const completedRef   = useRef(false);
  const reconnectRef   = useRef(null);  // timer for auto-reattach after a dropped stream
  const doneCallbacks  = useRef([]);  // components register here to hear run completion
  const runningRef     = useRef(false); // mirrors `running` for use inside poll/interval closures
  const pollRef        = useRef(null);  // status-poll interval

  useEffect(() => { runningRef.current = running; }, [running]);

  const addLog = useCallback((msg, type = 'info') => {
    setStepLog(prev => [...prev.slice(-299), { msg, type, ts: Date.now() }]);
  }, []);

  // Cleanup: close EventSource + reconnect timer on unmount to prevent leaks
  useEffect(() => () => {
    esRef.current?.close();
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
  }, []);

  // Poll run status every 15s (local read — NO RapidAPI quota cost). Keeps the
  // global "Agent running" badge live on every page, detects runs started by the
  // weekly cron / terminal / another tab, and auto-attaches the live log stream.
  useEffect(() => {
    const token = sessionStorage.getItem('kiteai_token');
    if (!token) return;
    let stopped = false;

    const pollStatus = async () => {
      if (document.hidden) return; // skip when tab not visible — gentle on the server
      try {
        const r = await fetch(`${API}/api/agent/status`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (stopped) return;
        setServerActive(!!d?.running);
        if (d?.running) {
          setRunProgress({
            overallPct:   d.progress      ?? 0,
            phase:        d.phase          ?? null,
            currentQuery: d.currentQuery   ?? null,
            queriesDone:  d.queriesDone     ?? 0,
            totalQueries: d.totalQueries    ?? 0,
            taskId:       d.taskId          ?? null,
          });
          // A run is live server-side but we're not watching it → attach the stream.
          if (!runningRef.current && !esRef.current) {
            completedRef.current = false;
            setRunning(true);
            addLog('Detected an active run — attaching to the live log…', 'info');
            attachStream();
          }
        } else {
          setRunProgress(null);
        }
      } catch {}
    };

    pollStatus();                                  // immediate on load
    pollRef.current = setInterval(pollStatus, 15000);
    const onVis = () => { if (!document.hidden) pollStatus(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dashboard (or any page) can register a callback to run when agent finishes
  const onRunComplete = useCallback((cb) => {
    doneCallbacks.current.push(cb);
    return () => { doneCallbacks.current = doneCallbacks.current.filter(f => f !== cb); };
  }, []);

  // Open (or re-open) the event stream to WATCH the background run. Safe to call
  // repeatedly — the backend endpoint only attaches a viewer, never starts a run.
  function attachStream() {
    const token = sessionStorage.getItem('kiteai_token');
    if (!token) { setConnErr('Not authenticated — please log in again.'); setRunning(false); return; }

    let es;
    try {
      es = new EventSource(`${API}/api/run-demo?_token=${encodeURIComponent(token)}`);
    } catch {
      setConnErr(`Cannot connect to backend at ${API} — is the server running?`);
      setRunning(false);
      return;
    }
    esRef.current = es;

    // Cleanly end the run view
    const endRun = (src) => {
      completedRef.current = true;
      setRunning(false);
      esRef.current = null;
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
      try { src.close(); } catch {}
    };

    es.onopen = () => { setConnErr(''); };

    es.addEventListener('idle', () => {
      addLog('No active run.', 'info');
      endRun(es);
    });

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

    es.addEventListener('run_progress', e => {
      try {
        const d = JSON.parse(e.data);
        setRunProgress(prev => ({
          ...(prev || {}),                 // preserve taskId learned from the status poll
          overallPct:   d.overallPct   ?? 0,
          phase:        d.phase         ?? null,
          currentQuery: d.currentQuery  ?? null,
          queriesDone:  d.queriesDone    ?? 0,
          totalQueries: d.totalQueries   ?? 0,
        }));
        if (typeof d.overallPct === 'number') setProgress(d.overallPct);
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

    es.addEventListener('api_call', e => {
      try {
        const d = JSON.parse(e.data);
        setApiLog(prev => [...prev.slice(-199), { ...d, ts: Date.now() }]);
        // also surface in the main log as request → response lines
        addLog(`→ ${d.request}`, 'api-req');
        addLog(`← ${d.response}`, d.ok ? 'api-res' : 'api-err');
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
      } catch {}
      endRun(es); // fix: was missing setRunning(false) + close
    });

    // fix: cap_reached was previously unhandled — running stayed true forever
    es.addEventListener('cap_reached', e => {
      try {
        const d = JSON.parse(e.data);
        addLog(`⚠️ Request cap reached — ${d.message ?? 'data saved so far'}`, 'warn');
      } catch {}
      endRun(es);
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
        setSummary(d);
        if (d.quotaExhausted) {
          addLog(`⚠️ Run stopped early — API quota exhausted. ${d.accountsAdded ?? 0} new accounts saved.`, 'warn');
        } else {
          const paidMsg = d.confirmedPaid > 0 ? ` · 💰 ${d.confirmedPaid} confirmed paid` : '';
          const likelyMsg = d.likelyPaid > 0 ? ` · ~ ${d.likelyPaid} likely paid` : '';
          addLog(`✅ Run complete — ${d.accountsAdded ?? 0} new · ${d.duplicatesSkipped ?? 0} updated · DB total: ${d.totalAccountsInDB ?? '?'}${paidMsg}${likelyMsg}`, 'success');
        }
        setProgress(100);
        doneCallbacks.current.forEach(cb => { try { cb(d); } catch {} });
      } catch {}
      endRun(es); // null esRef BEFORE close to prevent onerror clobbering clean state
    });

    es.onerror = () => {
      if (completedRef.current) { es.close(); return; } // normal close — ignore
      // Stream dropped mid-run — the run KEEPS GOING server-side. Reattach to resume
      // watching (the endpoint replays history so we catch up). Never starts a new run.
      if (esRef.current === es) {
        es.close();
        esRef.current = null;
        addLog('Stream dropped — the run continues in the background, reattaching…', 'warn');
        reconnectRef.current = setTimeout(() => { if (!completedRef.current) attachStream(); }, 3000);
      } else {
        es.close();
      }
    };
  }

  async function startRun(query = '') {
    if (running) return;
    setRunning(true);
    setAccounts([]); setErrCards([]); setStepLog([]); setProgress(0);
    setSummary(null); setConnErr(''); setStats({ added: 0, updated: 0, errors: 0 }); setApiLog([]);
    setRunProgress({ overallPct: 0, phase: 'search', currentQuery: null, queriesDone: 0, totalQueries: 0 });
    setServerActive(true);
    completedRef.current = false;

    const token = sessionStorage.getItem('kiteai_token');
    if (!token) { setConnErr('Not authenticated — please log in again.'); setRunning(false); return; }

    // Kick off the run in the BACKGROUND, then attach to watch it.
    try {
      const qs = query.trim() ? `?query=${encodeURIComponent(query.trim())}` : '';
      const r  = await fetch(`${API}/api/agent/start${qs}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d  = await r.json().catch(() => ({}));
      if (d.budgetReached) { setConnErr(`⛔ ${d.message}`); addLog(d.message, 'error'); setRunning(false); return; }
      if (d.alreadyRunning) addLog('A run was already in progress — attaching to it.', 'warn');
      else addLog(`Agent started${d.totalQueries ? ` — ${d.totalQueries} queries` : ''}. Runs in the background — safe to close this tab.`, 'success');
    } catch {
      setConnErr(`Cannot reach backend at ${API} — is the server running?`);
      setRunning(false);
      return;
    }
    attachStream();
  }

  // Run a Task — scoped to the task's keywords; backend links found accounts to it.
  async function startTaskRun(taskId) {
    if (running || !taskId) return;
    setRunning(true);
    setAccounts([]); setErrCards([]); setStepLog([]); setProgress(0);
    setSummary(null); setConnErr(''); setStats({ added: 0, updated: 0, errors: 0 }); setApiLog([]);
    setRunProgress({ overallPct: 0, phase: 'search', currentQuery: null, queriesDone: 0, totalQueries: 0 });
    setServerActive(true);
    completedRef.current = false;

    const token = sessionStorage.getItem('kiteai_token');
    if (!token) { setConnErr('Not authenticated — please log in again.'); setRunning(false); return; }

    try {
      const r = await fetch(`${API}/api/tasks/${taskId}/run`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (d.budgetReached) { setConnErr(`⛔ ${d.message}`); addLog(d.message, 'error'); setRunning(false); return; }
      if (d.alreadyRunning) addLog('A run was already in progress — attaching to it.', 'warn');
      else addLog(`Task started${d.totalKeywords ? ` — ${d.totalKeywords} keywords` : ''}. Runs in the background.`, 'success');
    } catch {
      setConnErr(`Cannot reach backend at ${API} — is the server running?`);
      setRunning(false);
      return;
    }
    attachStream();
  }

  async function stopRun() {
    const token = sessionStorage.getItem('kiteai_token');
    try { await fetch(`${API}/api/agent/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    completedRef.current = true;
    setRunning(false);
    addLog('Stop requested — the run will finish its current request and stop.', 'warn');
  }

  return (
    <AgentContext.Provider value={{
      running, accounts, errCards, stepLog, progress, summary, connErr, stats, apiLog,
      serverActive, runProgress,
      startRun, startTaskRun, stopRun, onRunComplete,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export const useAgent = () => useContext(AgentContext);

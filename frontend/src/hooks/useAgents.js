import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Fetches the merged agents catalogue ({ system, custom, agents }) from the
// gateway. Same caching + fetcher-override contract as useSections (see that file).

let cache = null;
let cacheTime = 0;
const TTL_MS = 60000;

export function useAgents(fetcherOverride) {
  const { apiFetch } = useAuth();
  const fetcher = fetcherOverride || apiFetch;
  const [agents, setAgents] = useState(cache?.data || null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const now = Date.now();
    if (cache && (now - cacheTime) < TTL_MS) {
      setAgents(cache.data);
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    fetcher('/api/agents')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`agents ${r.status}`))))
      .then((data) => {
        if (!alive) return;
        cache = { data };
        cacheTime = Date.now();
        setAgents(data);
        setLoading(false);
      })
      .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agents, loading, error, invalidate: () => { cache = null; cacheTime = 0; } };
}

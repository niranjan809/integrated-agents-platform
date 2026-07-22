import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Fetches the merged sections catalogue ({ system, custom, sections }) from the
// gateway. Module-level cache with a 60s TTL is enough for now (a shared app-level
// store would be nicer). Pass a `fetcherOverride` when calling from a panel-admin
// context (AdminPage), whose apiFetch token differs from the user session — the
// public /api/sections only needs a valid JWT, which the panel-admin token is.

let cache = null;
let cacheTime = 0;
const TTL_MS = 60000;

export function useSections(fetcherOverride) {
  const { apiFetch } = useAuth();
  const fetcher = fetcherOverride || apiFetch;
  const [sections, setSections] = useState(cache?.data || null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const now = Date.now();
    if (cache && (now - cacheTime) < TTL_MS) {
      setSections(cache.data);
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    fetcher('/api/sections')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sections ${r.status}`))))
      .then((data) => {
        if (!alive) return;
        cache = { data };
        cacheTime = Date.now();
        setSections(data);
        setLoading(false);
      })
      .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { sections, loading, error, invalidate: () => { cache = null; cacheTime = 0; } };
}

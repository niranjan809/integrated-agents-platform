const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
// Bump this whenever a fix could invalidate previously-cached data (e.g. a stat
// that was wrong upstream and got corrected directly in the DB) — it orphans
// every existing localStorage entry so the next load re-fetches instead of
// serving a stale value for up to its TTL.
const LS_PREFIX = "vac:v6:";

// In-memory cache: key → { data, expiresAt }
const _cache = new Map<string, { data: unknown; expiresAt: number }>();

function lsSet(path: string, data: unknown, expiresAt: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_PREFIX + path, JSON.stringify({ data, expiresAt })); }
  catch { /* quota exceeded — ignore */ }
}

function lsDel(path?: string) {
  if (typeof window === "undefined") return;
  try {
    if (path) {
      localStorage.removeItem(LS_PREFIX + path);
    } else {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch {}
}

// Warm in-memory cache from localStorage on first import
if (typeof window !== "undefined") {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const entry: { data: unknown; expiresAt: number } = JSON.parse(raw);
        if (Date.now() < entry.expiresAt) {
          _cache.set(k.slice(LS_PREFIX.length), entry);
        } else {
          localStorage.removeItem(k);
        }
      });
  } catch {}
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function req<T>(path: string, options: RequestInit = {}, ttlMs = 0): Promise<T> {
  const isGet = !options.method || options.method === "GET";
  if (isGet && ttlMs > 0) {
    const hit = _cache.get(path);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeader(),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // No login page in the embedded platform build — reads are public, so a 401
    // only means a protected (admin/write) call without a token. Surface it as an
    // error rather than redirecting to a route that no longer exists.
    throw new Error("Not authorized (admin action requires the maintainer login)");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const data: T = await res.json();
  if (isGet && ttlMs > 0) {
    const expiresAt = Date.now() + ttlMs;
    _cache.set(path, { data, expiresAt });
    lsSet(path, data, expiresAt);
  }
  return data;
}

export function invalidateCache(path?: string) {
  if (path) { _cache.delete(path); lsDel(path); }
  else { _cache.clear(); lsDel(); }
}

export function getCached<T>(path: string): T | null {
  const hit = _cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  return null;
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return { ...getAuthHeader(), "Content-Type": "application/json", ...extra };
}

export type DomainCategory = {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string | null;
  include_domains: string[];
  exclude_domains: string[];
  display_order: number;
  is_builtin: boolean;
  accent_color: string;
  leaderboard_count: number;
};

export type Leaderboard = {
  id: number;
  name: string;
  publisher: string;
  description: string | null;
  official_url: string;
  type: string;
  domain: string;
  primary_metrics: string[];
  benchmark_datasets: string[];
  methodology: string | null;
  update_frequency: string | null;
  last_updated: string | null;
  availability: string;
  scope: string | null;
  companies_count: number | null;
  models_count: number | null;
  metrics_count: number | null;
  notes: string | null;
  status: string;
  source: "seed" | "custom";
  column_order: string[];
  scraper_note: string | null;
  added_at: string | null;
  last_scanned_at: string | null;
  last_scan_status: string | null;
};

export type RankingEntry = {
  rank: number;
  model_name: string;
  company_name: string | null;
  scores: Record<string, string | number>;
};

export type ScanLog = {
  id: number;
  timestamp: string;
  status: string;
  records_updated: number;
  duration_ms: number | null;
  http_status: number | null;
  error_message: string | null;
  triggered_by: string;
};

export type RankingChange = {
  id: number;
  leaderboard_id: number;
  leaderboard_name: string;
  domain: string;      // raw type, e.g. "TTS"
  category: string;    // category-grid domain, e.g. "Voice AI Leaderboards"
  change_type: "new" | "dropped" | "up" | "down";
  model_name: string;
  old_rank: number | null;
  new_rank: number | null;
  triggered_by: string | null;
  prev_scanned_at: string | null;   // scan time this was compared against ("from")
  recorded_at: string | null;       // scan time that produced this change ("to")
};

export type PromptConfig = {
  key: string;
  label: string;
  description: string | null;
  prompt_text: string;
  updated_at: string | null;
};

const TTL = {
  leaderboardList: 30 * 60 * 1000,
  leaderboard: 30 * 60 * 1000,
  rankings: 60 * 60 * 1000,
  scanLogs: 2 * 60 * 1000,
  search: 5 * 60 * 1000,
};

export const api = {
  // Analytics — ranking change log (short TTL: it grows on every rescan)
  getChanges: (leaderboardId?: number, limit = 1000) => {
    const qs = new URLSearchParams();
    if (leaderboardId != null) qs.set("leaderboard_id", String(leaderboardId));
    qs.set("limit", String(limit));
    return req<RankingChange[]>(`/analytics/changes?${qs.toString()}`, {}, 60 * 1000);
  },

  // Domain categories
  listDomainCategories: () =>
    req<DomainCategory[]>("/domain-categories", {}, TTL.leaderboardList),
  getDomainCategory: (slug: string) =>
    req<DomainCategory>(`/domain-categories/${slug}`, {}, TTL.leaderboardList),
  adminAddDomainCategory: (data: Record<string, unknown>) => {
    invalidateCache("/domain-categories");
    return req<DomainCategory>("/admin/domain-categories", {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify(data),
    });
  },
  adminUpdateDomainCategory: (id: number, data: Record<string, unknown>) => {
    invalidateCache("/domain-categories");
    return req<DomainCategory>(`/admin/domain-categories/${id}`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify(data),
    });
  },
  adminDeleteDomainCategory: (id: number) => {
    invalidateCache("/domain-categories");
    return req<{ deleted: number }>(`/admin/domain-categories/${id}`, {
      method: "DELETE", headers: jsonHeaders(),
    });
  },

  // Leaderboards
  listLeaderboards: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<Leaderboard[]>(`/leaderboards${qs}`, {}, TTL.leaderboardList);
  },
  getLeaderboard: (id: number) =>
    req<Leaderboard>(`/leaderboards/${id}`, {}, TTL.leaderboard),
  getRankings: (id: number, force = false) =>
    req<{ entries: RankingEntry[]; cached: boolean; is_stale: boolean; last_scanned_at: string | null; last_scan_status: string | null }>(
      `/leaderboards/${id}/rankings${force ? "?force=true" : ""}`,
      {}, force ? 0 : TTL.rankings,
    ),
  rescan: (id: number) => {
    invalidateCache(`/leaderboards/${id}/rankings`);
    invalidateCache(`/leaderboards/${id}`);
    invalidateCache("/leaderboards");
    return req<{ status: string; records_updated: number }>(`/leaderboards/${id}/rescan`, { method: "POST" });
  },
  getScanLogs: (id: number) =>
    req<ScanLog[]>(`/leaderboards/${id}/scan-logs`, {}, TTL.scanLogs),

  // Search
  search: (q: string) =>
    req<{ query: string; leaderboards: { id: number; name: string; publisher: string; domain: string }[]; models: string[]; companies: string[] }>(
      `/search?q=${encodeURIComponent(q)}`, {}, TTL.search,
    ),
  listAllModels: () =>
    req<{ models: string[] }>("/search/models", {}, TTL.leaderboardList),
  searchSuggestions: (q: string) =>
    req<{ leaderboards: { id: number; name: string; domain: string }[]; models: string[]; companies: string[] }>(
      `/search/suggestions?q=${encodeURIComponent(q)}`, {}, TTL.search,
    ),

  // Compare
  compareLeaderboards: (ids: number[]) =>
    req<{ leaderboards: unknown[]; shared_companies: string[]; shared_models: string[] }>(
      `/compare/leaderboards?ids=${ids.join(",")}`, {}, TTL.leaderboard,
    ),
  compareModels: (model: string) =>
    req<{ model: string; appearances: unknown[] }>(
      `/compare/models?model=${encodeURIComponent(model)}`, {}, TTL.leaderboard,
    ),

  // Admin — analytics change-log management (invalidateCache() clears all so the
  // public Analytics page reflects deletions on its next load)
  adminDeleteChange: (id: number) => {
    invalidateCache();
    return req<{ deleted: number }>(`/admin/analytics/changes/${id}`, { method: "DELETE", headers: jsonHeaders() });
  },
  adminDeleteChangeEvent: (leaderboard_id: number, recorded_at: string) => {
    invalidateCache();
    return req<{ deleted: number }>("/admin/analytics/changes/delete-event", {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ leaderboard_id, recorded_at }),
    });
  },
  adminClearChanges: (lb_id: number) => {
    invalidateCache();
    return req<{ deleted: number }>(`/admin/analytics/changes/leaderboard/${lb_id}`, { method: "DELETE", headers: jsonHeaders() });
  },

  // Admin
  adminList: () => req<Leaderboard[]>("/admin/leaderboards", { headers: jsonHeaders() }),
  adminAdd: (data: Record<string, unknown>) => {
    invalidateCache();
    return req<{ id: number; name: string; status: string }>("/admin/leaderboards", {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify(data),
    });
  },
  adminUpdate: (id: number, data: Record<string, unknown>) => {
    // Editing a leaderboard can change its `domain`, which shifts per-category
    // counts — invalidate the list and domain-categories too, not just this row.
    invalidateCache(`/leaderboards/${id}`);
    invalidateCache("/leaderboards");
    invalidateCache("/domain-categories");
    return req<unknown>(`/admin/leaderboards/${id}`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify(data),
    });
  },
  adminDelete: (id: number) => {
    invalidateCache();
    return req<{ deleted: number }>(`/admin/leaderboards/${id}`, {
      method: "DELETE", headers: jsonHeaders(),
    });
  },
  adminRenormalize: (id: number) =>
    req<{ id: number; scraper_note: string | null }>(`/admin/leaderboards/${id}/renormalize`, {
      method: "POST", headers: jsonHeaders(),
    }),
  listPrompts: () => req<PromptConfig[]>("/admin/prompts", { headers: jsonHeaders() }),
  listGeminiCodePrompts: () =>
    req<{ label: string; location: string; purpose: string; prompt_text: string }[]>(
      "/admin/gemini-prompts/code", { headers: jsonHeaders() }
    ),
  updatePrompt: (key: string, prompt_text: string) =>
    req<{ key: string; updated: boolean }>(`/admin/prompts/${key}`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ prompt_text }),
    }),
  resetPrompt: (key: string) =>
    req<{ key: string; reset: boolean }>(`/admin/prompts/${key}/reset`, {
      method: "POST", headers: jsonHeaders(),
    }),
  adminStatus: () =>
    req<{ total_leaderboards: number; active: number; pending_normalization: number; last_scan_errors: number }>(
      "/admin/status", { headers: jsonHeaders() }
    ),
};

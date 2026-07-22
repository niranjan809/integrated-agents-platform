// Thin fetch wrapper for creator-radar DATA routes (accounts, report, rules, posts,
// keywords, search, etc.).
//
// PLATFORM INTEGRATION (Phase 3a):
//   - All calls are prefixed with /api/creator-radar so they route through the
//     kite-node proxy (backend/routes/creator-radar.js), which injects the
//     X-Internal-Secret header to reach the creator-radar Fastify backend on its
//     own Railway service.
//   - Auth is kite-frontend's JWT (Bearer <kiteai_token> from sessionStorage),
//     NOT the old cookie session. The token is written by context/AuthContext.jsx
//     on login; this module reads the same key so data calls stay in sync without
//     needing the React context (api.js is not a component).
//   - Base URL matches AuthContext: VITE_API_URL or the local dev gateway.
//
// The public interface (get / post / del / postStream / withPlatform) is unchanged
// from the standalone dashboard so the copied pages/components work as-is.
//
// NOTE: request() calls window.location.reload() on 401 — intentional for data
// routes: a mid-session expiry clears the token and bounces the user back to login
// (AuthContext.verifyToken() then finds no token and renders the login screen).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Every data route goes through the kite-node proxy mount.
const PREFIX = "/api/creator-radar";

// Bearer token issued by kite-frontend's AuthContext (sessionStorage key: kiteai_token).
function authHeaders(extra = {}) {
  const token = sessionStorage.getItem("kiteai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// Auto-append ?platform=<selected> to data routes so every list/report/detail/posts call
// is scoped to the current platform. Auth routes are exempt (they're platform-agnostic).
// Read from sessionStorage directly — api.js is not a React component. Appends with & if
// the path already has a query string. Operates on the app-relative path (before PREFIX).
function withPlatform(path) {
  if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) return path;
  const platform = sessionStorage.getItem("cr_selected_platform") || "instagram";
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}platform=${encodeURIComponent(platform)}`;
}

// Build the full proxied URL: API_BASE + /api/creator-radar + <app path w/ platform>.
function buildUrl(path) {
  return `${API_BASE}${PREFIX}${withPlatform(path)}`;
}

export const api = {
  async request(path, options = {}) {
    const res = await fetch(buildUrl(path), {
      ...options,
      headers: authHeaders(options.headers),
    });
    if (res.status === 401) window.location.reload(); // session expired → back to login
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  get: (p) => api.request(p),
  post: (p, body) => api.request(p, { method: "POST", body: JSON.stringify(body) }),
  del: (p, body) => api.request(p, { method: "DELETE", body: JSON.stringify(body) }),

  // Streaming POST for NDJSON progress (e.g. account add). Pre-stream errors (validation,
  // duplicate, budget) are thrown with `err.status` + `err.body` (parsed JSON). Once the
  // stream starts (200), each newline-delimited JSON object is passed to onLine(). Accept
  // is set explicitly so the kite-node proxy forwards it and the backend keeps streaming.
  async postStream(path, body, onLine) {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: authHeaders({ Accept: "application/x-ndjson" }),
      body: JSON.stringify(body),
    });
    if (res.status === 401) return window.location.reload();
    if (!res.ok) {
      let parsed;
      try { parsed = await res.json(); } catch { parsed = { message: await res.text() }; }
      const err = new Error(parsed.message || `${res.status}`);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(JSON.parse(line));
      }
    }
    if (buf.trim()) onLine(JSON.parse(buf.trim()));
  },
};

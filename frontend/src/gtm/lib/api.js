// Routed through the KiteAI platform proxy (backend/routes/gtm.js): it strips the
// /api/gtm prefix and forwards to the GTM Fastify backend, injecting X-Internal-Secret
// server-side. VITE_API_URL points at the platform Express backend (default :3001) —
// the same var AuthContext uses — NOT the GTM backend directly.
const PLATFORM_API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const API_URL = `${PLATFORM_API}/api/gtm`;

async function request(path, init) {
  // Only set Content-Type: application/json when there's actually a body —
  // Fastify rejects a request that promises JSON but sends an empty body
  // (this broke every bodyless POST/DELETE: analyze, delete company, etc.).
  const headers = { ...(init?.headers) };
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  // Platform JWT so the proxy's requireAuth + requireSection('gtm') gate passes.
  // Prefer the admin-panel token when present: the GTM Admin console renders inside
  // the platform admin panel, which logs in separately (kiteai_admin_token, a
  // panel-admin JWT that bypasses requireSection). Fall back to the regular user
  // token (kiteai_token) on the normal /gtm user pages.
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("kiteai_admin_token") ?? sessionStorage.getItem("kiteai_token")
      : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request to ${path} failed (${res.status}): ${body}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

export const api = {
  listCompanies: () => request("/api/companies"),

  getCompany: (id) => request(`/api/companies/${id}`),

  createCompany: (name, segment, website) =>
    request("/api/companies", { method: "POST", body: JSON.stringify({ name, segment, website }) }),

  analyzeCompany: (id) =>
    request(`/api/companies/${id}/analyze`, { method: "POST" }),

  updateCompany: (
    id,
    fields
  ) => request(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),

  deleteCompany: (id) => request(`/api/companies/${id}`, { method: "DELETE" }),

  getJobStatus: (id) => request(`/api/companies/${id}/status`),

  getStrategies: (id) => request(`/api/companies/${id}/strategies`),

  getStrategyEvidence: (id, category) =>
    request(`/api/companies/${id}/strategies/${encodeURIComponent(category)}`),

  getMeta: () => request("/api/meta"),

  listCategories: () => request("/api/categories"),

  listDefaultRules: () => request("/api/detection-rules/defaults"),

  listPrompts: () => request("/api/prompts"),

  listHardcodedPrompts: () => request("/api/prompts/hardcoded"),

  updatePrompt: (key, template) =>
    request(`/api/prompts/${key}`, { method: "PATCH", body: JSON.stringify({ template }) }),

  searchEvidence: (params) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.category) qs.set("category", params.category);
    if (params.sourceType) qs.set("sourceType", params.sourceType);
    if (params.limit) qs.set("limit", String(params.limit));
    return request(`/api/evidence/search?${qs.toString()}`);
  },

  compare: (ids) => request(`/api/compare?ids=${ids.map(encodeURIComponent).join(",")}`),
};

// Direct client for the Python FastAPI backend (Brand Visibility agent).
//
// Use for READ-ONLY calls to /api/x/* and /api/linkedin/* — the Python API is
// CORS-open and has no auth of its own. Do NOT use this for lexicon config edits:
// those go through the JWT-guarded Node proxy via apiFetch (AuthContext), which
// forwards to /api/brand-visibility/config/*.
const PYTHON_API = import.meta.env.VITE_PYTHON_API_URL || 'http://localhost:8000';

export async function pythonFetch(path, options = {}) {
  const url = `${PYTHON_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res; // caller does .json() + r.ok check, like apiFetch
}

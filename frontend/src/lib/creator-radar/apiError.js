// api.request() throws Error("<status>: <json body>") on non-2xx. This unpacks that into
// { status, body } so callers can branch on the server's structured error code.
export function parseApiError(e) {
  const raw = e?.message || "";
  const i = raw.indexOf(": ");
  if (i === -1) return { status: null, body: {} };
  const status = Number(raw.slice(0, i));
  let body = {};
  try {
    body = JSON.parse(raw.slice(i + 2));
  } catch {
    body = { message: raw.slice(i + 2) };
  }
  return { status: Number.isNaN(status) ? null : status, body };
}

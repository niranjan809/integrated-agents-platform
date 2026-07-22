import { useState } from "react";
import { api } from "../../pages/creator-radar/api";

// Confirmation modal for cascade-removing an account. `detail` is the drawer's loaded
// account detail (carries platform + child counts). onRemoved() fires after a successful
// delete so the caller can close the drawer + refresh + toast.
export default function RemoveAccountConfirmModal({ detail, onCancel, onRemoved }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationErr, setValidationErr] = useState("");

  const handle = detail.handle;
  const platform = detail.platform;
  const posts = detail.posts_in_db ?? 0;
  const classifications = detail.classifications_count ?? 0;
  const candidates = detail.candidate_accounts_count ?? 0;

  async function submit() {
    if (reason.trim().length < 10) return setValidationErr("Reason must be at least 10 characters (it's logged to the audit trail).");
    setValidationErr("");
    setBusy(true);
    setError("");
    try {
      // withPlatform() in api.js appends ?platform= from the active toggle, which matches
      // the account being viewed. Body carries the reason.
      await api.del(`/api/accounts/${handle}`, { reason: reason.trim() });
      onRemoved?.();
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Remove @{handle} from catalog?</h3>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">⚠</span>
            <div className="text-sm text-slate-700">
              <div className="font-medium text-slate-900">This will delete:</div>
              <ul className="mt-1 list-disc pl-5 text-slate-600">
                <li>The account row</li>
                <li>{posts} post{posts === 1 ? "" : "s"}</li>
                <li>{classifications} classification{classifications === 1 ? "" : "s"}</li>
                <li>{candidates} candidate table {candidates === 1 ? "entry" : "entries"}</li>
              </ul>
              <p className="mt-2 text-xs text-slate-500">API call history will be preserved.</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}
              placeholder="Why are you removing this account?"
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50"
            />
          </div>

          {validationErr && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationErr}</div>}
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {busy ? "Removing…" : "Remove account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function friendly(e) {
  const raw = e?.message || "Remove failed.";
  const idx = raw.indexOf(": ");
  if (idx === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(idx + 2));
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

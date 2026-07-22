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
    <div className="u-fixed u-inset-0 u-z-70 u-flex u-items-center u-justify-center u-bg-slate-900-40 u-p-4">
      <div className="u-w-full u-max-w-md u-overflow-hidden u-rounded-xl u-bg-white u-shadow-2xl">
        <div className="u-border-b u-border-slate-200 u-px-5 u-py-3">
          <h3 className="u-font-semibold u-text-slate-900">Remove @{handle} from catalog?</h3>
        </div>

        <div className="u-space-y-4 u-px-5 u-py-4">
          <div className="u-flex u-gap-3">
            <span className="u-flex u-h-8 u-w-8 u-shrink-0 u-items-center u-justify-center u-rounded-full u-bg-red-100 u-text-red-600">⚠</span>
            <div className="u-text-sm u-text-slate-700">
              <div className="u-font-medium u-text-slate-900">This will delete:</div>
              <ul className="u-mt-1 u-list-disc u-pl-5 u-text-slate-600">
                <li>The account row</li>
                <li>{posts} post{posts === 1 ? "" : "s"}</li>
                <li>{classifications} classification{classifications === 1 ? "" : "s"}</li>
                <li>{candidates} candidate table {candidates === 1 ? "entry" : "entries"}</li>
              </ul>
              <p className="u-mt-2 u-text-xs u-text-slate-500">API call history will be preserved.</p>
            </div>
          </div>

          <div>
            <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">
              Reason <span className="u-text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}
              placeholder="Why are you removing this account?"
              className="u-w-full u-resize-none u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500 u-disabled-bg-slate-50"
            />
          </div>

          {validationErr && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{validationErr}</div>}
          {error && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{error}</div>}
        </div>

        <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-px-5 u-py-4">
          <button onClick={onCancel} disabled={busy} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50 u-disabled-opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="u-rounded-md u-bg-red-600 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-red-700 u-disabled-opacity-60">
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

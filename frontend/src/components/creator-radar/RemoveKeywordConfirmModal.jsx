import { useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { parseApiError } from "../../lib/creator-radar/apiError";

// Soft-remove a hashtag from its active tier (moves to removed_from_rotation).
export default function RemoveKeywordConfirmModal({ hashtag, tier, onCancel, onRemoved }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationErr, setValidationErr] = useState("");

  async function submit() {
    if (reason.trim().length < 10) return setValidationErr("Reason must be at least 10 characters (it's logged to the audit trail).");
    setValidationErr("");
    setBusy(true);
    setError("");
    try {
      await api.del(`/api/keywords/${encodeURIComponent(hashtag)}`, { reason: reason.trim() });
      onRemoved("Hashtag removed");
    } catch (e) {
      const { body } = parseApiError(e);
      setError(body.message || e.message || "Remove failed.");
      setBusy(false);
    }
  }

  return (
    <div className="u-fixed u-inset-0 u-z-70 u-flex u-items-center u-justify-center u-bg-slate-900-40 u-p-4">
      <div className="u-w-full u-max-w-md u-overflow-hidden u-rounded-xl u-bg-white u-shadow-2xl">
        <div className="u-border-b u-border-slate-200 u-px-5 u-py-3">
          <h3 className="u-font-semibold u-text-slate-900">Remove #{hashtag} from {tier}?</h3>
        </div>
        <div className="u-space-y-4 u-px-5 u-py-4">
          <div className="u-text-sm u-text-slate-700">
            <p>This will move <span className="u-font-medium">#{hashtag}</span> to the &ldquo;Removed&rdquo; list. It won&apos;t be used in future discovery runs.</p>
            <p className="u-mt-1 u-text-xs u-text-slate-500">You can restore it later from the Removed tab.</p>
          </div>
          <div>
            <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Reason <span className="u-text-red-500">*</span></label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}
              placeholder="Why are you removing this hashtag?"
              className="u-w-full u-resize-none u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500 u-disabled-bg-slate-50" />
          </div>
          {validationErr && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{validationErr}</div>}
          {error && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{error}</div>}
        </div>
        <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-px-5 u-py-4">
          <button onClick={onCancel} disabled={busy} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50 u-disabled-opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="u-rounded-md u-bg-red-600 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-red-700 u-disabled-opacity-60">
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

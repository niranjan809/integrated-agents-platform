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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Remove #{hashtag} from {tier}?</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="text-sm text-slate-700">
            <p>This will move <span className="font-medium">#{hashtag}</span> to the &ldquo;Removed&rdquo; list. It won&apos;t be used in future discovery runs.</p>
            <p className="mt-1 text-xs text-slate-500">You can restore it later from the Removed tab.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Reason <span className="text-red-500">*</span></label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}
              placeholder="Why are you removing this hashtag?"
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50" />
          </div>
          {validationErr && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationErr}</div>}
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

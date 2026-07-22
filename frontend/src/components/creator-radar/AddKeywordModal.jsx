import { useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { parseApiError } from "../../lib/creator-radar/apiError";

// Add a hashtag to a specific tier. If the hashtag was previously removed, the endpoint
// returns 409 already_removed and we surface an in-place restore prompt (force=true).
export default function AddKeywordModal({ tier, onClose, onDone }) {
  const [hashtag, setHashtag] = useState("");
  const [subCluster, setSubCluster] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restore, setRestore] = useState(null); // { removed_at, reason } when already_removed

  const clean = hashtag.replace(/^#/, "").trim();

  async function post(force) {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/keywords", {
        hashtag: clean, tier, sub_cluster: subCluster.trim(), notes: notes.trim(), force,
      });
      onDone(force ? `#${clean} restored to ${tier}` : `Hashtag added to ${tier}`);
    } catch (e) {
      const { status, body } = parseApiError(e);
      if (status === 409 && body.error === "already_removed") {
        setRestore({ removed_at: body.removed_at, reason: body.reason });
      } else if (status === 409 && body.error === "duplicate") {
        setError(`This hashtag is already in tier ${body.tier}.`);
      } else if (status === 409 && body.error === "in_skip_list") {
        setError("This hashtag is in the skip list. Remove it from the skip list first (currently requires editing seed_hashtags.json).");
      } else {
        setError(body.message || e.message || "Add failed.");
      }
      setBusy(false);
    }
  }

  function submit() {
    if (!clean) return setError("Hashtag is required.");
    post(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Add hashtag to {tier}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        {!restore ? (
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Hashtag</label>
              <input type="text" value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="e.g. aiethics"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Sub-cluster <span className="text-slate-300">(optional)</span></label>
              <input type="text" value={subCluster} onChange={(e) => setSubCluster(e.target.value)} placeholder="e.g. Technical practitioner"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes <span className="text-slate-300">(optional)</span></label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this hashtag being added?"
                className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
            </div>
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
                {busy ? "Adding…" : "Add hashtag"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              This hashtag was previously removed{restore.removed_at ? ` on ${String(restore.removed_at).slice(0, 10)}` : ""} for reason:{" "}
              <span className="italic">&ldquo;{restore.reason || "unknown"}&rdquo;</span>.
            </div>
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={() => post(true)} disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
                {busy ? "Restoring…" : `Restore to ${tier}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

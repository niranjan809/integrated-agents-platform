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
    <div className="u-fixed u-inset-0 u-z-70 u-flex u-items-center u-justify-center u-bg-slate-900-40 u-p-4">
      <div className="u-w-full u-max-w-md u-overflow-hidden u-rounded-xl u-bg-white u-shadow-2xl">
        <div className="u-flex u-items-center u-justify-between u-border-b u-border-slate-200 u-px-5 u-py-3">
          <h3 className="u-font-semibold u-text-slate-900">Add hashtag to {tier}</h3>
          <button onClick={onClose} aria-label="Close" className="u-rounded-md u-p-1 u-text-slate-400 u-hover-bg-slate-100 u-hover-text-slate-700">✕</button>
        </div>

        {!restore ? (
          <div className="u-space-y-4 u-px-5 u-py-4">
            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Hashtag</label>
              <input type="text" value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="e.g. aiethics"
                className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500" />
            </div>
            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Sub-cluster <span className="u-text-slate-300">(optional)</span></label>
              <input type="text" value={subCluster} onChange={(e) => setSubCluster(e.target.value)} placeholder="e.g. Technical practitioner"
                className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500" />
            </div>
            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Notes <span className="u-text-slate-300">(optional)</span></label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this hashtag being added?"
                className="u-w-full u-resize-none u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500" />
            </div>
            {error && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{error}</div>}
            <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-pt-4">
              <button onClick={onClose} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={busy} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-hover-bg-slate-700 u-disabled-opacity-60">
                {busy ? "Adding…" : "Add hashtag"}
              </button>
            </div>
          </div>
        ) : (
          <div className="u-space-y-4 u-px-5 u-py-4">
            <div className="u-rounded-md u-border-l-4 u-border-amber-400 u-bg-amber-50 u-p-3 u-text-sm u-text-amber-900">
              This hashtag was previously removed{restore.removed_at ? ` on ${String(restore.removed_at).slice(0, 10)}` : ""} for reason:{" "}
              <span className="u-italic">&ldquo;{restore.reason || "unknown"}&rdquo;</span>.
            </div>
            {error && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{error}</div>}
            <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-pt-4">
              <button onClick={onClose} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50">Cancel</button>
              <button onClick={() => post(true)} disabled={busy} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-hover-bg-slate-700 u-disabled-opacity-60">
                {busy ? "Restoring…" : `Restore to ${tier}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

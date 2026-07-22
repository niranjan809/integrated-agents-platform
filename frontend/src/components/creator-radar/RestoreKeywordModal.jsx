import { useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { parseApiError } from "../../lib/creator-radar/apiError";

const KNOWN_TIERS = ["T1", "T2", "T3", "T2_discovered", "T_voice"];

// Restore a removed hashtag back into an active tier (POST with force=true). Defaults to
// the original from_tier, but the curator can retarget. `entry` = { hashtag, from_tier, reason }.
export default function RestoreKeywordModal({ entry, onCancel, onRestored }) {
  const [tier, setTier] = useState(KNOWN_TIERS.includes(entry.from_tier) ? entry.from_tier : "T1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/keywords", { hashtag: entry.hashtag, tier, notes: notes.trim(), force: true });
      onRestored(`#${entry.hashtag} restored to ${tier}`);
    } catch (e) {
      const { body } = parseApiError(e);
      setError(body.message || e.message || "Restore failed.");
      setBusy(false);
    }
  }

  return (
    <div className="u-fixed u-inset-0 u-z-70 u-flex u-items-center u-justify-center u-bg-slate-900-40 u-p-4">
      <div className="u-w-full u-max-w-md u-overflow-hidden u-rounded-xl u-bg-white u-shadow-2xl">
        <div className="u-border-b u-border-slate-200 u-px-5 u-py-3">
          <h3 className="u-font-semibold u-text-slate-900">Restore #{entry.hashtag}?</h3>
        </div>
        <div className="u-space-y-4 u-px-5 u-py-4">
          <p className="u-text-sm u-text-slate-700">
            This will move <span className="u-font-medium">#{entry.hashtag}</span> back into an active tier
            {entry.from_tier ? <> (originally <span className="u-font-medium">{entry.from_tier}</span>)</> : null}.
          </p>
          {entry.reason && (
            <div className="u-rounded-md u-bg-slate-50 u-px-3 u-py-2 u-text-xs u-text-slate-500">
              Removed for: <span className="u-italic">&ldquo;{entry.reason}&rdquo;</span>
            </div>
          )}
          <div>
            <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value)}
              className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-2 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500">
              {KNOWN_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Notes <span className="u-text-slate-300">(optional)</span></label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why are you restoring this hashtag?"
              className="u-w-full u-resize-none u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500" />
          </div>
          {error && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{error}</div>}
        </div>
        <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-px-5 u-py-4">
          <button onClick={onCancel} disabled={busy} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50 u-disabled-opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-slate-700 u-disabled-opacity-60">
            {busy ? "Restoring…" : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}

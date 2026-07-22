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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Restore #{entry.hashtag}?</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-slate-700">
            This will move <span className="font-medium">#{entry.hashtag}</span> back into an active tier
            {entry.from_tier ? <> (originally <span className="font-medium">{entry.from_tier}</span>)</> : null}.
          </p>
          {entry.reason && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Removed for: <span className="italic">&ldquo;{entry.reason}&rdquo;</span>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500">
              {KNOWN_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes <span className="text-slate-300">(optional)</span></label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why are you restoring this hashtag?"
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
            {busy ? "Restoring…" : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}

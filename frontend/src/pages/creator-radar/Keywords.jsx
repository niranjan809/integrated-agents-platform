import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";
import AddKeywordModal from "../../components/creator-radar/AddKeywordModal";
import RemoveKeywordConfirmModal from "../../components/creator-radar/RemoveKeywordConfirmModal";
import RestoreKeywordModal from "../../components/creator-radar/RestoreKeywordModal";

const TIER_TABS = ["T1", "T2", "T3", "T2_discovered", "T_voice"];
const TABS = [...TIER_TABS, "Removed", "Skip"];

export default function Keywords() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("T1");
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null); // { hashtag, tier }
  const [restoreTarget, setRestoreTarget] = useState(null); // removed entry
  const [toast, setToast] = useState("");

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function load() {
    setError("");
    return api.get("/api/keywords").then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  const isTier = TIER_TABS.includes(tab);

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "Removed") return data.removed_from_rotation;
    if (tab === "Skip") return data.skip_list;
    return [...(data.tiers[tab] || [])].sort((a, b) => a.hashtag.localeCompare(b.hashtag));
  }, [data, tab]);

  function afterMutation(msg) {
    setShowAdd(false);
    setRemoveTarget(null);
    setRestoreTarget(null);
    load();
    flashToast(msg);
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Keywords</h2>
        {isTier && (
          <button onClick={() => setShowAdd(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            + Add hashtag
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t}
            {data && <span className="ml-1.5 text-xs text-slate-400">
              {t === "Removed" ? data.removed_from_rotation.length : t === "Skip" ? data.skip_list.length : (data.tiers[t]?.length ?? 0)}
            </span>}
          </button>
        ))}
      </div>

      {error && <div className="mt-6 text-sm text-red-600">Failed to load: {error}</div>}
      {!data && !error && <div className="mt-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height="2rem" />)}</div>}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {tab === "Skip" && (
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              Skip list managed via seed_hashtags.json for now (read-only here).
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {isTier && <><th className="px-4 py-3 font-medium">Hashtag</th><th className="px-4 py-3 font-medium">Sub-cluster</th><th className="px-4 py-3 font-medium">Notes</th><th className="px-4 py-3 font-medium text-right">Actions</th></>}
                {tab === "Removed" && <><th className="px-4 py-3 font-medium">Hashtag</th><th className="px-4 py-3 font-medium">Removed at</th><th className="px-4 py-3 font-medium">Reason</th><th className="px-4 py-3 font-medium">From tier</th><th className="px-4 py-3 font-medium text-right">Actions</th></>}
                {tab === "Skip" && <><th className="px-4 py-3 font-medium">Hashtag</th><th className="px-4 py-3 font-medium">Reason</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {tab === "Removed" ? "No hashtags have been removed" : tab === "Skip" ? "No skip terms" : "No hashtags in this tier"}
                </td></tr>
              )}

              {isTier && rows.map((r) => (
                <tr key={r.hashtag} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">#{r.hashtag}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.sub_cluster || <span className="text-slate-300">—</span>}</td>
                  <td className="max-w-[20rem] px-4 py-2.5 text-slate-500">{r.notes || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setRemoveTarget({ hashtag: r.hashtag, tier: tab })}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                  </td>
                </tr>
              ))}

              {tab === "Removed" && rows.map((r) => (
                <tr key={r.hashtag} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">#{r.hashtag}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.removed_at ? String(r.removed_at).slice(0, 10) : "—"}</td>
                  <td className="max-w-[18rem] px-4 py-2.5 text-slate-500">{r.reason || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.from_tier || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setRestoreTarget(r)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">Restore</button>
                  </td>
                </tr>
              ))}

              {tab === "Skip" && rows.map((r) => (
                <tr key={r.hashtag} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">#{r.hashtag}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && isTier && <AddKeywordModal tier={tab} onClose={() => setShowAdd(false)} onDone={afterMutation} />}
      {removeTarget && <RemoveKeywordConfirmModal hashtag={removeTarget.hashtag} tier={removeTarget.tier} onCancel={() => setRemoveTarget(null)} onRemoved={afterMutation} />}
      {restoreTarget && <RestoreKeywordModal entry={restoreTarget} onCancel={() => setRestoreTarget(null)} onRestored={afterMutation} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

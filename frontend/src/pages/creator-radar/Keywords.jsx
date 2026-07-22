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
    <div className="cr-page u-mx-auto u-max-w-5xl u-p-8">
      <div className="u-flex u-items-center u-justify-between">
        <h2 className="u-text-lg u-font-semibold u-text-slate-900">Keywords</h2>
        {isTier && (
          <button onClick={() => setShowAdd(true)} className="u-rounded-md u-bg-slate-900 u-px-3 u-py-1_5 u-text-sm u-font-medium u-hover-bg-slate-700">
            + Add hashtag
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="u-mt-4 u-flex u-flex-wrap u-gap-1 u-border-b u-border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`u-border-b-2 u-px-3 u-py-2 u-text-sm u-transition-colors ${
              tab === t ? "u-border-slate-900 u-font-medium u-text-slate-900" : "u-border-transparent u-text-slate-500 u-hover-text-slate-700"
            }`}>
            {t}
            {data && <span className="u-ml-1_5 u-text-xs u-text-slate-400">
              {t === "Removed" ? data.removed_from_rotation.length : t === "Skip" ? data.skip_list.length : (data.tiers[t]?.length ?? 0)}
            </span>}
          </button>
        ))}
      </div>

      {error && <div className="u-mt-6 u-text-sm u-text-red-600">Failed to load: {error}</div>}
      {!data && !error && <div className="u-mt-4 u-space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height="2rem" />)}</div>}

      {data && (
        <div className="u-mt-4 u-overflow-x-auto u-rounded-xl u-border u-border-slate-200 u-bg-white">
          {tab === "Skip" && (
            <div className="u-border-b u-border-slate-100 u-bg-slate-50 u-px-4 u-py-2 u-text-xs u-text-slate-500">
              Skip list managed via seed_hashtags.json for now (read-only here).
            </div>
          )}
          <table className="u-w-full u-text-sm">
            <thead>
              <tr className="u-border-b u-border-slate-200 u-text-left u-text-xs u-uppercase u-tracking-wide u-text-slate-500">
                {isTier && <><th className="u-px-4 u-py-3 u-font-medium">Hashtag</th><th className="u-px-4 u-py-3 u-font-medium">Sub-cluster</th><th className="u-px-4 u-py-3 u-font-medium">Notes</th><th className="u-px-4 u-py-3 u-font-medium u-text-right">Actions</th></>}
                {tab === "Removed" && <><th className="u-px-4 u-py-3 u-font-medium">Hashtag</th><th className="u-px-4 u-py-3 u-font-medium">Removed at</th><th className="u-px-4 u-py-3 u-font-medium">Reason</th><th className="u-px-4 u-py-3 u-font-medium">From tier</th><th className="u-px-4 u-py-3 u-font-medium u-text-right">Actions</th></>}
                {tab === "Skip" && <><th className="u-px-4 u-py-3 u-font-medium">Hashtag</th><th className="u-px-4 u-py-3 u-font-medium">Reason</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="u-px-4 u-py-8 u-text-center u-text-slate-400">
                  {tab === "Removed" ? "No hashtags have been removed" : tab === "Skip" ? "No skip terms" : "No hashtags in this tier"}
                </td></tr>
              )}

              {isTier && rows.map((r) => (
                <tr key={r.hashtag} className="u-border-b u-border-slate-100 u-last-border-0 u-hover-bg-slate-50">
                  <td className="u-px-4 u-py-2_5 u-font-medium u-text-slate-900">#{r.hashtag}</td>
                  <td className="u-px-4 u-py-2_5 u-text-slate-600">{r.sub_cluster || <span className="u-text-slate-300">—</span>}</td>
                  <td className="u-max-w-20rem u-px-4 u-py-2_5 u-text-slate-500">{r.notes || <span className="u-text-slate-300">—</span>}</td>
                  <td className="u-px-4 u-py-2_5 u-text-right">
                    <button onClick={() => setRemoveTarget({ hashtag: r.hashtag, tier: tab })}
                      className="u-rounded-md u-border u-border-red-200 u-px-2 u-py-1 u-text-xs u-font-medium u-text-red-600 u-hover-bg-red-50">Remove</button>
                  </td>
                </tr>
              ))}

              {tab === "Removed" && rows.map((r) => (
                <tr key={r.hashtag} className="u-border-b u-border-slate-100 u-last-border-0 u-hover-bg-slate-50">
                  <td className="u-px-4 u-py-2_5 u-font-medium u-text-slate-900">#{r.hashtag}</td>
                  <td className="u-px-4 u-py-2_5 u-tabular-nums u-text-slate-500">{r.removed_at ? String(r.removed_at).slice(0, 10) : "—"}</td>
                  <td className="u-max-w-18rem u-px-4 u-py-2_5 u-text-slate-500">{r.reason || "—"}</td>
                  <td className="u-px-4 u-py-2_5 u-text-slate-600">{r.from_tier || <span className="u-text-slate-300">—</span>}</td>
                  <td className="u-px-4 u-py-2_5 u-text-right">
                    <button onClick={() => setRestoreTarget(r)}
                      className="u-rounded-md u-border u-border-slate-300 u-px-2 u-py-1 u-text-xs u-font-medium u-text-slate-700 u-hover-bg-slate-100">Restore</button>
                  </td>
                </tr>
              ))}

              {tab === "Skip" && rows.map((r) => (
                <tr key={r.hashtag} className="u-border-b u-border-slate-100 u-last-border-0">
                  <td className="u-px-4 u-py-2_5 u-font-medium u-text-slate-900">#{r.hashtag}</td>
                  <td className="u-px-4 u-py-2_5 u-text-slate-500">{r.reason || "—"}</td>
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
        <div className="u-fixed u-bottom-6 u-left-1-2 u-z-80 u-neg-translate-x-1-2 u-rounded-lg u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-shadow-lg">{toast}</div>
      )}
    </div>
  );
}

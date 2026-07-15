import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Leaderboard } from "@/lib/api";
import { domainColor } from "@/lib/utils";

type Tab = "leaderboards" | "models";

export default function ComparePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as Tab;
  const [tab, setTab] = useState<Tab>(rawTab === "leaderboards" ? "leaderboards" : "models");

  const [allLbs, setAllLbs] = useState<Leaderboard[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [compareResult, setCompareResult] = useState<{ leaderboards: Leaderboard[]; shared_models: string[] } | null>(null);
  const [comparingLbs, setComparingLbs] = useState(false);

  const [modelInput, setModelInput] = useState(searchParams.get("model") || "");
  const [modelResult, setModelResult] = useState<{ model: string; appearances: Record<string, unknown>[] } | null>(null);
  const [comparingModel, setComparingModel] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listLeaderboards().then(setAllLbs); }, []);

  useEffect(() => {
    if (modelInput && tab === "models") handleModelCompare();
  }, []);

  useEffect(() => {
    const q = modelInput.trim();
    if (!q) { setModelSuggestions([]); return; }
    const timer = setTimeout(() => {
      api.searchSuggestions(q).then((data) => {
        setModelSuggestions(data.models.slice(0, 10));
        setShowSuggestions(true);
      }).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [modelInput]);

  function toggleLbSelect(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 4 ? [...prev, id] : prev);
  }

  async function handleLbCompare() {
    if (selectedIds.length < 2) return;
    setComparingLbs(true); setError(null);
    try { setCompareResult(await api.compareLeaderboards(selectedIds) as typeof compareResult); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setComparingLbs(false); }
  }

  async function handleModelCompare() {
    if (!modelInput.trim()) return;
    setComparingModel(true); setError(null);
    try { setModelResult(await api.compareModels(modelInput.trim()) as typeof modelResult); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setComparingModel(false); }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Compare</h1>
        <p className="text-gray-500 mt-1">Compare leaderboards or models side by side.</p>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
        {(["models", "leaderboards"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${tab === t ? "bg-gray-700 text-indigo-400" : "text-gray-400 hover:text-gray-200"}`}>
            {t}
          </button>
        ))}
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {tab === "leaderboards" && (
        <div className="space-y-5">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-sm text-gray-500 mb-3">Select 2–4 leaderboards to compare:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
              {allLbs.map((lb) => {
                const selected = selectedIds.includes(lb.id);
                return (
                  <button key={lb.id} onClick={() => toggleLbSelect(lb.id)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selected ? "border-indigo-600 bg-indigo-950/40 text-indigo-400" : "border-gray-700 hover:border-indigo-700 text-gray-300"}`}>
                    <span className="font-medium">{lb.name}</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${domainColor(lb.domain)}`}>{lb.domain}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={handleLbCompare} disabled={selectedIds.length < 2 || comparingLbs}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {comparingLbs ? "Comparing..." : `Compare ${selectedIds.length > 0 ? `(${selectedIds.length})` : ""}`}
            </button>
          </div>
          {compareResult && (
            <div className="space-y-4">
              <div className="overflow-x-auto bg-gray-900 rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium w-40">Field</th>
                      {compareResult.leaderboards.map((lb) => (
                        <th key={lb.id} className="px-3 py-3 text-left font-medium text-indigo-400">
                          <button onClick={() => navigate(`/leaderboard/${lb.id}`)} className="hover:underline">{lb.name}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {[["Publisher","publisher"],["Domain","domain"],["Type","type"],["Availability","availability"],["Primary Metrics","primary_metrics"],["Models","models_count"],["Companies","companies_count"],["Update Frequency","update_frequency"]].map(([label, key]) => (
                      <tr key={key} className="hover:bg-gray-800">
                        <td className="px-3 py-2.5 text-gray-500 font-medium">{label}</td>
                        {compareResult.leaderboards.map((lb: Record<string, unknown>) => (
                          <td key={String(lb.id)} className="px-3 py-2.5 text-gray-300">
                            {Array.isArray(lb[key]) ? (lb[key] as string[]).join(", ") || "—" : String(lb[key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {compareResult.shared_models?.length > 0 && (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <h3 className="font-semibold text-gray-300 mb-2 text-sm">Shared Models ({compareResult.shared_models.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {compareResult.shared_models.map((m) => (
                      <span key={m} className="px-2 py-1 bg-green-950 text-green-400 rounded text-xs">{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "models" && (
        <div className="space-y-5">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input type="text" value={modelInput}
                  onChange={(e) => { setModelInput(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { setShowSuggestions(false); handleModelCompare(); } if (e.key === "Escape") setShowSuggestions(false); }}
                  onFocus={() => modelSuggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Whisper, gpt-4o, Deepgram..."
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {showSuggestions && modelSuggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                    {modelSuggestions.map((s) => (
                      <li key={s}>
                        <button type="button" onMouseDown={() => { setModelInput(s); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-indigo-900/50 hover:text-indigo-300 transition-colors">
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => { setShowSuggestions(false); handleModelCompare(); }} disabled={!modelInput.trim() || comparingModel}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {comparingModel ? "Loading..." : "Compare"}
              </button>
            </div>
          </div>
          {modelResult && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="font-semibold text-gray-100">{modelResult.model} — Across Leaderboards</h3>
                <p className="text-sm text-gray-500">{modelResult.appearances.length} appearances</p>
              </div>
              {modelResult.appearances.length === 0 ? (
                <p className="px-4 py-6 text-center text-gray-500 text-sm">No appearances found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium">Leaderboard</th>
                      <th className="px-3 py-3 text-center text-gray-400 font-medium">Rank</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium">Company</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium">Scores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {modelResult.appearances.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-800">
                        <td className="px-3 py-2.5">
                          <button onClick={() => navigate(`/leaderboard/${row.leaderboard_id}`)} className="text-indigo-400 hover:underline font-medium">
                            {String(row.leaderboard_name)}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-gray-500">#{String(row.rank)}</td>
                        <td className="px-3 py-2.5 text-gray-400">{String(row.company_name || "—")}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">
                          {Object.entries((row.scores as Record<string, unknown>) || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

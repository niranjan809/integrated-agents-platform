import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Leaderboard } from "@/lib/api";
import { domainColor } from "@/lib/utils";

type Tab = "leaderboards" | "models";

// Tinted chip palette for the model cloud — each model gets a stable color so the
// list reads as a colorful, scannable set rather than a wall of identical pills.
const CHIP_COLORS = [
  "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30 hover:bg-indigo-500/20",
  "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/20",
  "bg-sky-500/10 text-sky-300 ring-sky-500/30 hover:bg-sky-500/20",
  "bg-amber-500/10 text-amber-300 ring-amber-500/30 hover:bg-amber-500/20",
  "bg-rose-500/10 text-rose-300 ring-rose-500/30 hover:bg-rose-500/20",
  "bg-violet-500/10 text-violet-300 ring-violet-500/30 hover:bg-violet-500/20",
  "bg-teal-500/10 text-teal-300 ring-teal-500/30 hover:bg-teal-500/20",
  "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30 hover:bg-fuchsia-500/20",
  "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30 hover:bg-cyan-500/20",
  "bg-lime-500/10 text-lime-300 ring-lime-500/30 hover:bg-lime-500/20",
];

// Show only a handful of chips at a time (like the search-bar suggestions) —
// typing filters down to the relevant ones rather than dumping the whole set.
const SUGGESTION_LIMIT = 20;

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}

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
  const [allModels, setAllModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listLeaderboards().then(setAllLbs); }, []);
  useEffect(() => { api.listAllModels().then((d) => setAllModels(d.models)).catch(() => {}); }, []);

  useEffect(() => {
    if (modelInput && tab === "models") handleModelCompare();
  }, []);

  // Live-filter the model cloud by whatever's typed — loosely: ignore case,
  // spaces, hyphens, dots and other punctuation so "qwen 3.5" also finds
  // "qwen3.5" / "Qwen-3.5" / "Qwen 3.5".
  const modelQuery = modelInput.trim().toLowerCase();
  const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const looseQuery = loose(modelInput);
  const filteredModels = looseQuery
    ? allModels.filter((m) => loose(m).includes(looseQuery))
    : allModels;

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

  async function handleModelCompare(name?: string) {
    const q = (name ?? modelInput).trim();
    if (!q) return;
    setComparingModel(true); setError(null);
    try { setModelResult(await api.compareModels(q) as typeof modelResult); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setComparingModel(false); }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-100">Compare</h1>
        <p className="text-zinc-400 mt-1">Compare any model rankings and different leaderboards side by side.</p>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-full">
        {(["models", "leaderboards"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 text-center px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${tab === t ? "bg-gray-700 text-indigo-400" : "text-gray-400 hover:text-gray-200"}`}>
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
                  onChange={(e) => setModelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleModelCompare(); }}
                  placeholder="Type to filter models below, or pick one…"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button onClick={() => handleModelCompare()} disabled={!modelInput.trim() || comparingModel}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {comparingModel ? "Loading..." : "Compare"}
              </button>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-sm text-gray-400 mb-3">
                {allModels.length === 0
                  ? "Loading models…"
                  : filteredModels.length === 0
                    ? <>No models match “{modelInput.trim()}”.</>
                    : modelQuery
                      ? <>{Math.min(filteredModels.length, SUGGESTION_LIMIT)} of {filteredModels.length} match{filteredModels.length !== 1 ? "es" : ""} — pick one, or press Enter.</>
                      : <>Most-compared models (across the most leaderboards) — type to search all {allModels.length}, or pick one.</>}
              </p>
              {filteredModels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {filteredModels.slice(0, SUGGESTION_LIMIT).map((m) => (
                    <button key={m} type="button"
                      onClick={() => handleModelCompare(m)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset transition-colors ${colorFor(m)} ${modelResult?.model === m ? "ring-2 font-semibold" : ""}`}
                      title={`Compare ${m} across leaderboards`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

          {modelResult && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-100">{modelResult.model} — Across Leaderboards</h3>
                  <p className="text-sm text-gray-500">{modelResult.appearances.length} appearances</p>
                </div>
                <button
                  onClick={() => { setModelResult(null); setModelInput(""); }}
                  className="shrink-0 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
                >
                  ← Pick another model
                </button>
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

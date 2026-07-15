import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { domainColor } from "@/lib/utils";

type Suggestion = {
  leaderboards: { id: number; name: string; domain: string }[];
  models: string[];
  companies: string[];
};

type SearchResult = {
  query: string;
  leaderboards: { id: number; name: string; publisher: string; domain: string }[];
  models: string[];
  companies: string[];
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    setResult(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length <= 2) { setSuggestions(null); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.searchSuggestions(val.trim());
        setSuggestions(data);
        setShowSuggestions(true);
      } catch {}
    }, 280);
  }

  async function handleSearch(q = query) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    try {
      const data = await api.search(trimmed);
      setResult(data);
    } catch (e: unknown) {
      setError((e as Error).message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function pickLeaderboard(id: number) { setShowSuggestions(false); navigate(`/leaderboard/${id}`); }
  function pickSuggestion(text: string) { setQuery(text); setShowSuggestions(false); handleSearch(text); }

  const hasSuggestions = suggestions && (suggestions.leaderboards.length > 0 || suggestions.models.length > 0 || suggestions.companies.length > 0);
  const hasResults = result && (result.leaderboards.length > 0 || result.models.length > 0 || result.companies.length > 0);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Search</h1>
        <p className="text-gray-500 mt-1">Search across leaderboards, models, and companies.</p>
      </div>
      <div ref={wrapperRef} className="relative mb-6">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => hasSuggestions && setShowSuggestions(true)}
              placeholder="e.g. WER, Whisper, OpenAI, STT…"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {showSuggestions && hasSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
                {suggestions!.leaderboards.length > 0 && (
                  <div>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Leaderboards</p>
                    {suggestions!.leaderboards.map((lb) => (
                      <button key={lb.id} type="button" onMouseDown={() => pickLeaderboard(lb.id)}
                        className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-gray-800 transition-colors">
                        <span className="text-sm font-medium text-indigo-400">{lb.name}</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${domainColor(lb.domain)}`}>{lb.domain}</span>
                      </button>
                    ))}
                  </div>
                )}
                {suggestions!.models.length > 0 && (
                  <div>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-800">Models</p>
                    {suggestions!.models.map((m) => (
                      <button key={m} type="button" onMouseDown={() => pickSuggestion(m)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2">
                        <span className="text-gray-500 text-xs">⬡</span>{m}
                      </button>
                    ))}
                  </div>
                )}
                {suggestions!.companies.length > 0 && (
                  <div>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-800">Companies</p>
                    {suggestions!.companies.map((c) => (
                      <button key={c} type="button" onMouseDown={() => pickSuggestion(c)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2">
                        <span className="text-gray-500 text-xs">🏢</span>{c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button type="submit" disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {result && !hasResults && (
        <p className="text-center text-gray-500 py-12">No results for &ldquo;{result.query}&rdquo;</p>
      )}
      {result && hasResults && (
        <div className="space-y-6">
          {result.leaderboards.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Leaderboards ({result.leaderboards.length})</h2>
              <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
                {result.leaderboards.map((lb) => (
                  <div key={lb.id} onClick={() => navigate(`/leaderboard/${lb.id}`)}
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-800 transition-colors">
                    <span className="font-medium text-indigo-400">{lb.name}</span>
                    <span className="text-sm text-gray-500">{lb.publisher}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${domainColor(lb.domain)}`}>{lb.domain}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {result.companies.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Companies ({result.companies.length})</h2>
              <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
                {result.companies.map((company) => (
                  <div key={company} className="px-4 py-3 flex items-center gap-3">
                    <span className="font-medium text-gray-200">{company}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {result.models.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Models ({result.models.length})</h2>
              <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
                {result.models.map((model) => (
                  <div key={model} onClick={() => navigate(`/compare?tab=models&model=${encodeURIComponent(model)}`)}
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-800 transition-colors">
                    <span className="font-medium text-gray-200">{model}</span>
                    <span className="text-xs text-indigo-400 ml-auto">View across leaderboards →</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

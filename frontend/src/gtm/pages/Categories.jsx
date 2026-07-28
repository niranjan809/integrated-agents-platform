import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { categoryColor } from "../lib/categoryColors";
import PageHeader from "../components/PageHeader";
import EvidenceCard from "../components/EvidenceCard";

const SUBTITLES = {
  search: "Search already-classified evidence across every company at once — e.g. which companies mention usage-based pricing.",
  keywords: "The built-in signals each GTM category is detected from — the keywords and paths the scrapers look for.",
};

const TAB_LABELS = { search: "Search", keywords: "Keywords" };

function SearchTab() {
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  // All categories as suggestion chips (no slice — newly added categories
  // must appear here too, not just the first 10).
  const suggestions = categories;

  async function runSearch(opts) {
    const searchText = opts?.q ?? q;
    const searchCategory = opts?.category ?? category;
    if (!searchText.trim() && !searchCategory) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const r = await api.searchEvidence({
        q: searchText.trim() || undefined,
        category: searchCategory || undefined,
        limit: 100,
      });
      setResults(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label className="text-xs text-ink">Search text</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. usage-based pricing, Calendly, free tier…"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
          >
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs text-ink">Category suggestions</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((c) => {
              const color = categoryColor(c.name);
              const active = category === c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.name);
                    runSearch({ category: c.name });
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${color.bg} ${color.text} ${
                    active ? "ring-2 ring-offset-1 ring-offset-canvas" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-6">
        {!searched ? null : loading ? (
          <p className="text-sm text-ink">Searching…</p>
        ) : results && results.length === 0 ? (
          <p className="text-sm text-ink">No matching evidence found.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-ink">
              {results?.length} result{results?.length === 1 ? "" : "s"}
            </p>
            {results?.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center gap-2">
                  <Link
                    to={`/gtm/company/${r.companyId}?category=${encodeURIComponent(r.gtmCategory ?? "")}`}
                    className="text-sm font-semibold text-ink"
                  >
                    {r.companyName}
                  </Link>
                  {r.gtmCategory && <span className="text-xs text-ink">{r.gtmCategory}</span>}
                </div>
                <EvidenceCard evidence={r} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const MAX_CHIPS_PER_CATEGORY = 16;

function KeywordCategoryCard({ category, values }) {
  const [expanded, setExpanded] = useState(false);
  const color = categoryColor(category);
  const shown = expanded ? values : values.slice(0, MAX_CHIPS_PER_CATEGORY);
  const hidden = values.length - MAX_CHIPS_PER_CATEGORY;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${color.dot}`} />
        <span className="text-sm font-semibold text-ink">{category}</span>
        <span className="text-xs text-ink/50">{values.length} signals</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((v) => (
          <span key={v} className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
            {v}
          </span>
        ))}
        {hidden > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-ink/70 transition hover:bg-line/70 hover:text-ink"
          >
            {expanded ? "show less" : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function KeywordsTab() {
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listDefaultRules()
      .then(setDefaults)
      .finally(() => setLoading(false));
  }, []);

  // A rule can feed more than one category, so it appears under each. De-dupe
  // values within a category (the same term can come from multiple scrapers).
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const rule of defaults) {
      for (const cat of rule.categories) {
        const arr = map.get(cat) ?? [];
        if (!arr.includes(rule.value)) arr.push(rule.value);
        map.set(cat, arr);
      }
    }
    return map;
  }, [defaults]);

  const categories = useMemo(() => [...byCategory.keys()].sort((a, b) => a.localeCompare(b)), [byCategory]);

  if (loading) return <p className="text-sm text-ink">Loading…</p>;
  if (categories.length === 0) return <p className="text-sm text-ink">No keywords configured.</p>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {categories.map((cat) => (
        <KeywordCategoryCard key={cat} category={cat} values={byCategory.get(cat) ?? []} />
      ))}
    </div>
  );
}

export default function Categories() {
  const [tab, setTab] = useState("search");
  const tabs = ["search", "keywords"];

  return (
    <div>
      <PageHeader title="Categories" subtitle={SUBTITLES[tab]} back />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Full-width, equal-halves tabs — same style as the Dashboard's
            company tabs. */}
        <div className="mb-6 flex border-b border-line">
          {tabs.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === key ? "border-emerald-400 text-emerald-400" : "border-transparent text-ink hover:border-line"
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        {tab === "search" ? <SearchTab /> : <KeywordsTab />}
      </div>
    </div>
  );
}

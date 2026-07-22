import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, DomainCategory, Leaderboard, getCached } from "@/lib/api";
import { timeAgo, statusDot, domainColor } from "@/lib/utils";

function matchesDomain(lb: Leaderboard, cat: DomainCategory): boolean {
  if (cat.include_domains.length > 0) return cat.include_domains.includes(lb.domain);
  return !cat.exclude_domains.includes(lb.domain);
}

export default function DomainPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [cat, setCat] = useState<DomainCategory | null>(() =>
    getCached<DomainCategory>(`/domain-categories/${slug}`) ?? null
  );
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>(() => {
    const cachedCat = getCached<DomainCategory>(`/domain-categories/${slug}`);
    if (!cachedCat) return [];
    return (getCached<Leaderboard[]>("/leaderboards") ?? []).filter((lb) => matchesDomain(lb, cachedCat));
  });
  const [loading, setLoading] = useState(() => !getCached<DomainCategory>(`/domain-categories/${slug}`));
  const [subdomain, setSubdomain] = useState("All");
  const [type, setType] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<keyof Leaderboard>("models_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!slug) return;
    api.getDomainCategory(slug).then((c) => {
      setCat(c);
      return api.listLeaderboards().then((all) =>
        setLeaderboards(all.filter((lb) => matchesDomain(lb, c)))
      );
    }).catch(() => setCat(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const subdomains = useMemo(() => {
    const found = leaderboards.map((lb) => lb.domain).filter(Boolean);
    const unique = Array.from(new Set(found)).sort();
    return unique.length > 1 ? ["All", ...unique] : [];
  }, [leaderboards]);

  const types = useMemo(() => {
    const base = ["Leaderboard", "Arena"];
    const extra = leaderboards.map((lb) => lb.type).filter((t) => t && !base.includes(t));
    return ["All", ...base, ...Array.from(new Set(extra))];
  }, [leaderboards]);

  const filtered = useMemo(() => {
    let list = [...leaderboards];
    if (subdomain !== "All") list = list.filter((l) => l.domain === subdomain);
    if (type !== "All") list = list.filter((l) => l.type === type);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.publisher.toLowerCase().includes(q) ||
          (l.primary_metrics || []).some((m) => m.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      if (sortBy === "models_count") {
        const av = a.models_count ?? -1;
        const bv = b.models_count ?? -1;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = String(a[sortBy] ?? "");
      const bv = String(b[sortBy] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [leaderboards, subdomain, type, search, sortBy, sortDir]);

  function toggleSort(col: keyof Leaderboard) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: keyof Leaderboard }) {
    if (sortBy !== col) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-indigo-400 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (!loading && !cat) {
    return <div className="p-12 text-center text-gray-500">Domain not found.</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-100">
          {cat?.icon} {cat?.name ?? "Loading..."}
        </h1>
        {cat?.description && (
          <p className="text-zinc-400 mt-1">{cat.description} Click any row to explore.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Search leaderboards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {subdomains.length > 0 && (
          <select
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {subdomains.map((d) => <option key={d}>{d}</option>)}
          </select>
        )}
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} leaderboards</span>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading leaderboards...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-3 py-3 text-left w-8 text-gray-500">#</th>
                <th className="px-3 py-3 text-left cursor-pointer hover:text-indigo-400 text-gray-400" onClick={() => toggleSort("name")}>Name <SortIcon col="name" /></th>
                <th className="px-3 py-3 text-left cursor-pointer hover:text-indigo-400 text-gray-400" onClick={() => toggleSort("publisher")}>Publisher <SortIcon col="publisher" /></th>
                <th className="px-3 py-3 text-left text-gray-400">Domain</th>
                <th className="px-3 py-3 text-left text-gray-400">Type</th>
                <th className="px-3 py-3 text-left text-gray-400">Primary Metrics</th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-indigo-400 text-gray-400" onClick={() => toggleSort("models_count")}>Models <SortIcon col="models_count" /></th>
                <th className="px-3 py-3 text-left text-gray-400">Scope</th>
                <th className="px-3 py-3 text-left cursor-pointer hover:text-indigo-400 text-gray-400" onClick={() => toggleSort("last_scanned_at")}>Last Scanned <SortIcon col="last_scanned_at" /></th>
                <th className="px-3 py-3 text-center text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">No leaderboards found.</td>
                </tr>
              ) : filtered.map((lb, idx) => (
                <tr
                  key={lb.id}
                  onClick={() => navigate(`/leaderboard/${lb.id}`)}
                  className="hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 text-gray-600">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium text-indigo-400 hover:underline">{lb.name}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-400">{lb.publisher}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${domainColor(lb.domain)}`}>
                      {lb.domain}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400">{lb.type}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{(lb.primary_metrics || []).join(", ") || "—"}</td>
                  <td className="px-3 py-3 text-center text-gray-400">{lb.models_count ?? "—"}</td>
                  <td className="px-3 py-3">
                    {lb.scope ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${lb.scope === "Regional" ? "bg-orange-950 text-orange-400" : "bg-blue-950 text-blue-400"}`}>
                        {lb.scope}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{timeAgo(lb.last_scanned_at)}</td>
                  <td className="px-3 py-3 text-center">
                    {(lb.models_count ?? 0) > 1
                      ? <span className="text-base">{statusDot(lb.last_scan_status)}</span>
                      : <span className="text-xs font-medium text-amber-400">pending</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

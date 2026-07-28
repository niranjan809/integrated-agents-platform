import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useCompanies } from "../lib/useCompanies";
import PageHeader from "../components/PageHeader";
import { categoryColor } from "../lib/categoryColors";

export default function Compare() {
  const { companies, strategiesByCompany } = useCompanies();
  const [selectedIds, setSelectedIds] = useState([]);
  const [companySearch, setCompanySearch] = useState("");
  const [result, setResult] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState(null);

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Highest-evidence companies first (ties broken alphabetically) — the most
  // analyzed companies are the most useful to compare, so surface them first.
  const sortedCompanies = useMemo(() => {
    const evidenceFor = (id) =>
      (strategiesByCompany[id] ?? []).reduce((sum, s) => sum + s.evidenceCount, 0);
    return [...companies].sort((a, b) => {
      const diff = evidenceFor(b.id) - evidenceFor(a.id);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }, [companies, strategiesByCompany]);

  // Filter for the selector — with many tracked companies, a newly-added one
  // is otherwise easy to lose among dozens of chips.
  const visibleCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return sortedCompanies;
    return sortedCompanies.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.segment ?? "").toLowerCase().includes(q)
    );
  }, [sortedCompanies, companySearch]);

  useEffect(() => {
    if (selectedIds.length < 2) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setComparing(true);
    setError(null);
    api
      .compare(selectedIds)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Comparison failed");
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  // Similarities: a GTM category backed by real evidence for every company being compared.
  const similarities = useMemo(() => {
    if (!result) return [];
    return result.categories.filter((cat) => result.companies.every((c) => (c.categories[cat] ?? 0) > 0));
  }, [result]);

  // Differentiators: a category backed by evidence for exactly one of the companies being compared.
  const differentiators = useMemo(() => {
    if (!result) return {};
    const map = {};
    for (const company of result.companies) {
      map[company.companyId] = result.categories.filter((cat) => {
        const mine = (company.categories[cat] ?? 0) > 0;
        if (!mine) return false;
        return !result.companies.some(
          (other) => other.companyId !== company.companyId && (other.categories[cat] ?? 0) > 0
        );
      });
    }
    return map;
  }, [result]);

  return (
    <div>
      <PageHeader
        title="Compare"
        subtitle="Side-by-side GTM comparison — pick two or more companies to see shared strategies and what sets each apart."
        back
      />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">Select companies to compare</div>
            <input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Filter companies…"
              className="w-48 rounded-lg border border-line bg-canvas px-2.5 py-1 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          {visibleCompanies.length === 0 ? (
            <p className="text-sm text-ink/70">No companies match "{companySearch}".</p>
          ) : (
          <div className="flex flex-wrap gap-1.5">
            {visibleCompanies.map((c) => {
              const active = selectedIds.includes(c.id);
              const color = categoryColor(c.name);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${color.bg} ${color.text} ${
                    active ? "ring-2 ring-offset-1 ring-offset-surface" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          )}
        </div>

        {selectedIds.length < 2 && (
          <p className="mt-6 text-sm text-ink">Select at least two companies above to compare.</p>
        )}
        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
        {comparing && <p className="mt-6 text-sm text-ink">Comparing…</p>}

        {result && !comparing && (
          <div className="mt-6 space-y-6">
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-ink">Category</th>
                    {result.companies.map((c) => (
                      <th key={c.companyId} className="px-4 py-3 text-left font-medium text-ink">
                        {c.companyName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.categories.map((cat) => {
                    const color = categoryColor(cat);
                    return (
                      <tr key={cat} className="border-b border-line/60 last:border-0">
                        <td className="sticky left-0 bg-surface px-4 py-2.5 text-ink">
                          <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${color.dot}`} />
                          {cat}
                        </td>
                        {result.companies.map((c) => {
                          const count = c.categories[cat] ?? 0;
                          return (
                            <td key={c.companyId} className="px-4 py-2.5">
                              {count > 0 ? (
                                <Link
                                  to={`/gtm/company/${c.companyId}?category=${encodeURIComponent(cat)}`}
                                  title={`View ${c.companyName}'s ${cat} evidence`}
                                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium transition hover:ring-2 hover:ring-offset-1 hover:ring-offset-surface ${color.bg} ${color.text}`}
                                >
                                  {count}
                                </Link>
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="mb-2 text-sm font-semibold text-ink">Shared strategies</div>
              {similarities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {similarities.map((cat) => {
                    const color = categoryColor(cat);
                    return (
                      <span key={cat} className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                        {cat}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-ink/70">No GTM category is backed by evidence across all selected companies.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.companies.map((c) => (
                <div key={c.companyId} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="mb-2 text-sm font-semibold text-ink">{c.companyName}&rsquo;s edge</div>
                  {differentiators[c.companyId]?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {differentiators[c.companyId].map((cat) => {
                        const color = categoryColor(cat);
                        return (
                          <span key={cat} className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                            {cat}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-ink/70">No category unique to this company among the ones selected.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

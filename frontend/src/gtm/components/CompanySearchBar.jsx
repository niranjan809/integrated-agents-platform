import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

/** Accept "company.com" as readily as "https://company.com" — a user pasting
 *  an official link shouldn't have to remember the scheme. */
function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** The landing page's primary action: one box that both finds an
 *  already-tracked company and discovers a brand-new one. For a new company we
 *  just create it and open its GTM view — the analysis pipeline resolves the
 *  official site (a grounded LLM pick over real candidate pages). If it gets
 *  the site wrong, the user corrects it right on the company page. */
export default function CompanySearchBar({
  companies,
  onAdded,
}) {
  const [query, setQuery] = useState("");
  const [website, setWebsite] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return companies
      .filter((c) => c.name.toLowerCase().includes(q) || (c.segment ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [companies, q]);

  // "New company" = a non-empty name that matches nothing already tracked.
  // The website override is only meaningful (and only enabled) in that case.
  const isNewName = q.length > 0 && matches.length === 0;

  async function discover(name) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Optional manual website (used verbatim); otherwise the pipeline's
      // grounded LLM selector resolves it during the "discovering" step.
      const site = website.trim();
      const company = await api.createCompany(trimmed, undefined, site ? normalizeUrl(site) : undefined);
      onAdded?.();
      navigate(`/gtm/company/${company.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add company");
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (matches.length > 0) navigate(`/gtm/company/${matches[0].id}`);
    else discover(query);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={handleSubmit} className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Find a company, or type a new name to discover its GTM…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />

          {open && q && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-black/30">
              {matches.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigate(`/gtm/company/${c.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-line"
                >
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  {c.segment && <span className="shrink-0 text-xs text-ink/60">{c.segment}</span>}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => discover(query)}
                disabled={busy}
                className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-primary transition hover:bg-line disabled:opacity-50 ${
                  matches.length > 0 ? "border-t border-line/60" : ""
                }`}
              >
                {busy ? (
                  "Starting…"
                ) : (
                  <>
                    <span aria-hidden>✨</span> Analyze new company:{" "}
                    <span className="font-semibold">“{query.trim()}”</span> →
                  </>
                )}
              </button>
            </div>
          )}
        </form>

        {/* Optional official-website override, to the RIGHT of the name box.
            Enabled only for a new company name. When filled it's used verbatim
            and skips auto-discovery; otherwise the pipeline picks the site. */}
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={!isNewName}
          placeholder={isNewName ? "Official website (optional)" : "Official website — new company only"}
          title={
            isNewName
              ? "Optionally pin the official website to skip auto-discovery"
              : "Enabled once you type a new company name"
          }
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-72"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

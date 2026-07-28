import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { isRunningStatus, scopeStyle } from "../lib/status";
import CategoryTabs from "../components/CategoryTabs";
import EvidencePanel from "../components/EvidencePanel";
import StatusPoller from "../components/StatusPoller";

function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function CompanyDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [company, setCompany] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category"));
  const [evidence, setEvidence] = useState([]);
  const [isPolling, setIsPolling] = useState(true);
  const [triggerError, setTriggerError] = useState(null);
  const [lastJob, setLastJob] = useState(null);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);

  const loadCompanyAndStrategies = useCallback(async () => {
    if (!id) return;
    const [c, s, job] = await Promise.all([
      api.getCompany(id),
      api.getStrategies(id).catch(() => []),
      api.getJobStatus(id).catch(() => null),
    ]);
    setCompany(c);
    setStrategies(s);
    setLastJob(job);

    const running = c.status === "pending" || isRunningStatus(c.status);
    setIsPolling(running);

    // Self-healing: if a company is stuck at "pending" (e.g. a previous
    // analyze() call never fired, or the app was restarted mid-job), kick off
    // analysis automatically instead of silently showing nothing.
    if (c.status === "pending") {
      api.analyzeCompany(id).catch((err) => {
        setTriggerError(err instanceof Error ? err.message : "Failed to start analysis");
      });
    }
  }, [id]);

  useEffect(() => {
    loadCompanyAndStrategies();
  }, [loadCompanyAndStrategies]);

  useEffect(() => {
    if (!id || !selectedCategory) return;
    api.getStrategyEvidence(id, selectedCategory).then(setEvidence);
  }, [id, selectedCategory]);

  function selectCategory(category) {
    setSelectedCategory(category);
    setSearchParams(category ? { category } : {}, { replace: true });
  }

  async function handleReanalyze() {
    if (!id) return;
    setTriggerError(null);
    try {
      await api.analyzeCompany(id);
      setIsPolling(true);
      setSelectedCategory(null);
      setEvidence([]);
      setSearchParams({}, { replace: true });
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Failed to start analysis");
    }
  }

  // The discovered site was wrong? Fix the official link here and re-run the
  // analysis against it — the pipeline uses a stored website verbatim, so the
  // corrected domain is what gets scraped.
  async function handleSaveWebsite() {
    if (!id) return;
    setTriggerError(null);
    setSavingWebsite(true);
    try {
      const next = websiteDraft.trim();
      await api.updateCompany(id, { website: next ? normalizeUrl(next) : null });
      setEditingWebsite(false);
      await api.analyzeCompany(id);
      setIsPolling(true);
      setSelectedCategory(null);
      setEvidence([]);
      setSearchParams({}, { replace: true });
      loadCompanyAndStrategies();
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Failed to update website");
    } finally {
      setSavingWebsite(false);
    }
  }

  if (!company || !id) return <div className="px-6 py-8 text-sm text-ink">Loading…</div>;

  const scope = company.scope ? scopeStyle(company.scope) : null;

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-line/80 bg-canvas/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <div>
            <Link
              to={company.scope ? `/gtm?tab=${company.scope}` : "/gtm?tab=Unclassified"}
              className="text-sm text-ink hover:underline"
            >
              ← Back
            </Link>
            {/* Colored by scope (same Global/Regional colors as everywhere
                else) instead of a flat brand color — the heading itself
                carries real information instead of just decoration. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1
                className={`text-xl font-bold tracking-tight ${company.scope ? scopeStyle(company.scope).text : "text-ink"}`}
              >
                {company.name}
              </h1>
              {company.segment && <span className="text-xs text-ink">{company.segment}</span>}
              {scope && (
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${scope.bg} ${scope.text}`}
                >
                  <scope.icon className="h-3 w-3" />
                  {company.scope}
                </span>
              )}
              {company.hqCountry && <span className="text-xs text-ink">📍 {company.hqCountry}</span>}
            </div>
            {editingWebsite ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={websiteDraft}
                  onChange={(e) => setWebsiteDraft(e.target.value)}
                  placeholder="https://company.com"
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleSaveWebsite}
                  disabled={savingWebsite}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingWebsite ? "Saving…" : "Save & re-analyze"}
                </button>
                <button
                  onClick={() => setEditingWebsite(false)}
                  className="rounded-lg border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-line"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-ink hover:underline"
                  >
                    {company.website}
                  </a>
                ) : (
                  <span className="text-sm text-ink/60">No website set</span>
                )}
                <button
                  onClick={() => {
                    setWebsiteDraft(company.website ?? "");
                    setEditingWebsite(true);
                  }}
                  title="Wrong site? Edit the official link and re-analyze"
                  className="text-xs text-primary hover:underline"
                >
                  Edit site
                </button>
              </div>
            )}
          </div>
          <div className="text-right">
            <button
              onClick={handleReanalyze}
              className="h-fit rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-line"
            >
              Re-analyze
            </button>
            <div className="mt-1 text-xs text-ink">
              {lastJob?.completedAt
                ? `Last analyzed: ${new Date(lastJob.completedAt).toLocaleString()}`
                : "Never analyzed"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-8">
        {triggerError && <p className="mb-3 text-sm text-red-400">{triggerError}</p>}

        {isPolling && (
          <div className="mb-4">
            <StatusPoller
              companyId={id}
              onDone={() => {
                setIsPolling(false);
                loadCompanyAndStrategies();
              }}
            />
          </div>
        )}

        {!isPolling && strategies.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink">
            No GTM evidence found for this company yet.
          </div>
        ) : (
          <div className="space-y-6">
            <CategoryTabs strategies={strategies} selected={selectedCategory} onSelect={selectCategory} />
            <EvidencePanel category={selectedCategory} evidence={evidence} />
          </div>
        )}
      </div>
    </div>
  );
}

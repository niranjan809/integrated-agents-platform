import { useSearchParams } from "react-router-dom";
import { useCompanies } from "../lib/useCompanies";
import CompanyCard from "../components/CompanyCard";
import CompanySearchBar from "../components/CompanySearchBar";
import Reveal from "../components/Reveal";
import { SparkleSearchIcon } from "../components/icons";

const TAB_VALUES = ["Global", "Regional", "Unclassified"];
const TAB_LABELS = {
  Global: "Global Companies",
  Regional: "Regional Companies",
  Unclassified: "Unclassified",
};

function evidenceCountFor(company, strategiesByCompany) {
  return (strategiesByCompany[company.id] ?? []).reduce((sum, s) => sum + s.evidenceCount, 0);
}

/** Most evidence first — a company with more real, classified evidence is
 *  more interesting to look at than one with none yet, which alphabetical
 *  order doesn't surface. Ties broken alphabetically for stable ordering. */
function sortByEvidenceCount(companies, strategiesByCompany) {
  return [...companies].sort((a, b) => {
    const diff = evidenceCountFor(b, strategiesByCompany) - evidenceCountFor(a, strategiesByCompany);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

export default function Dashboard() {
  const { companies, strategiesByCompany, loading, refresh } = useCompanies();
  // Kept in the URL (not just component state) so "Back" from a company's
  // GTM view can return to the exact tab it was opened from, instead of
  // always resetting to the Global tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = TAB_VALUES.includes(requestedTab) ? requestedTab : "Global";

  function setActiveTab(tab) {
    setSearchParams(tab === "Global" ? {} : { tab }, { replace: true });
  }

  const globalCompanies = sortByEvidenceCount(companies.filter((c) => c.scope === "Global"), strategiesByCompany);
  const regionalCompanies = sortByEvidenceCount(companies.filter((c) => c.scope === "Regional"), strategiesByCompany);
  const unclassifiedCompanies = [...companies.filter((c) => !c.scope)].sort((a, b) => a.name.localeCompare(b.name));

  const tabs = [
    { key: "Global", companies: globalCompanies },
    { key: "Regional", companies: regionalCompanies },
    ...(unclassifiedCompanies.length > 0 ? [{ key: "Unclassified", companies: unclassifiedCompanies }] : []),
  ];

  const activeCompanies = tabs.find((t) => t.key === activeTab)?.companies ?? [];

  const totalEvidence = Object.values(strategiesByCompany)
    .flat()
    .reduce((sum, s) => sum + s.evidenceCount, 0);
  const doneCount = companies.filter((c) => c.status === "done").length;
  const categoriesDetected = new Set(Object.values(strategiesByCompany).flat().map((s) => s.categoryName)).size;

  return (
    <div>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Lead with the primary action so a first-time visitor immediately
            gets what this page is for: find a company you already track, or
            discover a brand-new one. Left-aligned, no centering. */}
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            <SparkleSearchIcon className="h-8 w-8 shrink-0" /> GTM Intelligence Agent
          </h1>
          <h2 className="mt-4 text-lg font-bold tracking-tight text-ink">Discover GTM strategies of AI Companies</h2>
          <p className="mt-1 text-sm text-ink/60">
            Search for already tracked companies, or type the new one to discover the GTM strategies of competitor AI companies — the company's GTM
            view opens right away while the analysis runs.
          </p>
          <div className="mt-3">
            <CompanySearchBar companies={companies} onAdded={refresh} />
          </div>
        </div>

        {/* Portfolio snapshot, below the primary action. */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="text-3xl font-bold tracking-tight text-primary">{companies.length}</div>
            <div className="mt-1 text-xs text-ink">Companies tracked ({doneCount} analyzed)</div>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="text-3xl font-bold tracking-tight text-sky-400">{totalEvidence}</div>
            <div className="mt-1 text-xs text-ink">Evidence items collected</div>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="text-3xl font-bold tracking-tight text-amber-400">{categoriesDetected}</div>
            <div className="mt-1 text-xs text-ink">GTM categories detected across portfolio</div>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-ink">Loading…</p>
        ) : companies.length === 0 ? (
          <p className="mt-8 text-sm text-ink">
            No companies yet — search or type a company name in the bar above to discover one.
          </p>
        ) : (
          <>
            <div className="mt-8 flex border-b border-line">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.key
                      ? "border-emerald-400 text-emerald-400"
                      : "border-transparent text-ink hover:border-line"
                  }`}
                >
                  {TAB_LABELS[tab.key]}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      activeTab === tab.key ? "bg-emerald-400/15 text-emerald-400" : "bg-line text-ink"
                    }`}
                  >
                    {tab.companies.length}
                  </span>
                </button>
              ))}
            </div>

            {activeCompanies.length === 0 ? (
              <p className="mt-6 text-sm text-ink">No companies in this section yet.</p>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeCompanies.map((c, i) => (
                  <Reveal key={c.id} delay={Math.min(i * 40, 320)}>
                    <CompanyCard company={c} strategies={strategiesByCompany[c.id] ?? []} />
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

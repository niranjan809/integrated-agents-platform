import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCompanies } from "../lib/useCompanies";
import PageHeader from "../components/PageHeader";
import CompanyManageCard from "../components/CompanyManageCard";
import Reveal from "../components/Reveal";

const PIPELINE = [
  {
    step: "1. Discover",
    detail:
      "Resolve the company's official website — a known company uses its hardcoded site; otherwise web search surfaces candidate sites and a grounded LLM picks the official one from those real candidates (heuristic fallback if it abstains). Also resolves the Product Hunt slug.",
  },
  {
    step: "2. Scrape",
    detail:
      "Run all scraper modules concurrently (capped fan-out). Each one extracts raw text from a real public page — pricing, homepage CTAs, partner pages, marketplaces, news, etc. No LLM involved at this stage.",
  },
  {
    step: "3. Classify",
    detail:
      "Each scraped snippet is sent to the LLM classifier, which reads it and returns only {category, confidence, reasoning}. It never rewrites or generates the snippet text itself.",
  },
  {
    step: "4. Aggregate",
    detail:
      "Evidence with confidence ≥ threshold rolls up into gtm_strategies per category. Everything below threshold is still stored, just not displayed as a category.",
  },
  {
    step: "5. Display",
    detail:
      "The dashboard shows only categories backed by real evidence — zero evidence means zero category shown, never a placeholder.",
  },
];

const SUBTITLES = {
  companies: "Manage every tracked company — edit its details or remove it.",
  workflow: "How an analysis actually runs, plus the live configuration behind it.",
  prompts: "The exact templates sent to Gemini. Edit and save — the next classification call uses your change immediately.",
};

function TabButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-emerald-400/15 text-emerald-400" : "border border-line text-ink hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

export default function Admin() {
  const [view, setView] = useState("companies");
  const [meta, setMeta] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [error, setError] = useState(null);
  const [hardcoded, setHardcoded] = useState([]);

  const { companies, strategiesByCompany, loading, refresh } = useCompanies();

  useEffect(() => {
    api.getMeta().then(setMeta);
    api.listPrompts().then((list) => {
      setPrompts(list);
      setDrafts(Object.fromEntries(list.map((p) => [p.key, p.template])));
    });
    api.listHardcodedPrompts().then(setHardcoded);
  }, []);

  async function handleSave(key) {
    setSavingKey(key);
    setSavedKey(null);
    setError(null);
    try {
      const updated = await api.updatePrompt(key, drafts[key]);
      setPrompts((prev) => prev.map((p) => (p.key === key ? updated : p)));
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <PageHeader title="Admin" subtitle={SUBTITLES[view]} />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex gap-2">
          <TabButton active={view === "companies"} onClick={() => setView("companies")}>
            Companies
          </TabButton>
          <TabButton active={view === "workflow"} onClick={() => setView("workflow")}>
            Workflow
          </TabButton>
          <TabButton active={view === "prompts"} onClick={() => setView("prompts")}>
            Prompts
          </TabButton>
        </div>

        {view === "workflow" &&
          (!meta ? (
            <p className="text-sm text-ink">Loading…</p>
          ) : (
            <>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-ink">Analysis Steps</div>
                <ol className="space-y-4">
                  {PIPELINE.map((p) => (
                    <li key={p.step} className="flex gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-[11px] font-semibold text-primary">
                        {p.step.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-ink">{p.step}</div>
                        <div className="text-sm text-ink">{p.detail}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <div className="text-xs uppercase tracking-wide text-ink">LLM classifier model</div>
                  <div className="mt-1 font-mono text-sm text-ink">{meta.llmModel}</div>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <div className="text-xs uppercase tracking-wide text-ink">Confidence threshold to display</div>
                  <div className="mt-1 font-mono text-sm text-ink">{meta.confidenceThreshold}</div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-ink">
                  Active scraper modules ({meta.scrapers.length})
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meta.scrapers.map((s) => (
                    <span key={s} className="rounded-full bg-line px-2 py-0.5 text-xs text-ink">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-ink">
                  GTM categories ({meta.categories.length})
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meta.categories.map((c) => (
                    <span key={c} className="rounded-full bg-line px-2 py-0.5 text-xs text-ink">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-ink">Hardcoded known companies</div>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {meta.knownCompanies.map((c) => (
                      <tr key={c.name} className="border-t border-line/60">
                        <td className="py-1.5 pr-4 text-ink">{c.name}</td>
                        <td className="py-1.5 pr-4 text-ink">{c.segment}</td>
                        <td className="py-1.5">
                          <a href={c.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            {c.website}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm text-ink">
                <div className="mb-2 text-xs uppercase tracking-wide text-ink">Evidence-first guarantee</div>
                The LLM never writes what you see in an evidence card — it only reads a snippet already scraped from a
                real page and returns a category, a confidence score, and a one-line reasoning. If confidence is
                below the threshold, the evidence is stored but its category is hidden. Every card links to the
                original source so you can verify it yourself.
              </div>
            </>
          ))}

        {view === "prompts" && (
          <div className="space-y-6">
            {error && <p className="text-sm text-red-400">{error}</p>}

            {prompts.map((prompt) => {
              const dirty = drafts[prompt.key] !== prompt.template;
              return (
                <div key={prompt.key} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink">{prompt.name}</div>
                      <div className="text-xs text-ink">
                        key: <span className="font-mono">{prompt.key}</span> · last updated{" "}
                        {new Date(prompt.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    {savedKey === prompt.key && <span className="text-xs font-medium text-emerald-400">Saved ✓</span>}
                  </div>

                  <textarea
                    value={drafts[prompt.key] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [prompt.key]: e.target.value }))}
                    rows={16}
                    className="mt-2 w-full rounded-lg border border-line bg-canvas p-3 font-mono text-xs text-ink focus:border-primary focus:outline-none"
                    spellCheck={false}
                  />

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleSave(prompt.key)}
                      disabled={!dirty || savingKey === prompt.key}
                      className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingKey === prompt.key ? "Saving…" : "Save"}
                    </button>
                    {dirty && (
                      <button
                        onClick={() => setDrafts((prev) => ({ ...prev, [prompt.key]: prompt.template }))}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-line"
                      >
                        Revert
                      </button>
                    )}
                    <span className="text-xs text-ink">
                      Use <span className="font-mono">{"{{placeholder}}"}</span> tokens — they're substituted at call
                      time.
                    </span>
                  </div>
                </div>
              );
            })}

            {hardcoded.length > 0 && (
              <>
                <div className="border-t border-line/60 pt-4 text-xs uppercase tracking-wide text-ink/60">
                  Read-only — hardcoded in code (not editable)
                </div>
                {hardcoded.map((p) => (
                  <div key={p.key} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-ink">{p.name}</div>
                        <div className="text-xs text-ink">
                          key: <span className="font-mono">{p.key}</span> · defined in code
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/70">
                        Read-only
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-ink/70">{p.description}</p>
                    <textarea
                      value={p.template}
                      readOnly
                      rows={14}
                      className="w-full cursor-default rounded-lg border border-line bg-canvas/60 p-3 font-mono text-xs text-ink/80 focus:outline-none"
                      spellCheck={false}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {view === "companies" &&
          (loading ? (
            <p className="text-sm text-ink">Loading…</p>
          ) : companies.length === 0 ? (
            <p className="text-sm text-ink">No companies yet — add one from the Search page.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((c, i) => (
                <Reveal key={c.id} delay={Math.min(i * 40, 320)}>
                  <CompanyManageCard company={c} strategies={strategiesByCompany[c.id] ?? []} onChanged={refresh} />
                </Reveal>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

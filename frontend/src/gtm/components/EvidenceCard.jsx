import { categoryColor } from "../lib/categoryColors";

function confidenceBarColor(pct) {
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 65) return "bg-amber-400";
  return "bg-muted";
}

export default function EvidenceCard({ evidence }) {
  const confidencePct = evidence.confidence != null ? Math.round(evidence.confidence * 100) : null;
  // Distinct color per source type (same deterministic palette used for GTM
  // category badges) so a "partners_page" vs "marketplace" vs "pricing_page"
  // card is distinguishable at a glance, not just by its text label.
  const sourceColor = categoryColor(evidence.sourceType);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 transition-colors duration-200 hover:border-primary/20 hover:bg-surface">
      <div className="flex items-center justify-between">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sourceColor.bg} ${sourceColor.text}`}
        >
          {evidence.sourceType}
        </span>
        {confidencePct != null && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
              <div className={`h-full ${confidenceBarColor(confidencePct)}`} style={{ width: `${confidencePct}%` }} />
            </div>
            <span className="text-xs text-ink">{confidencePct}%</span>
          </div>
        )}
      </div>

      <a
        href={evidence.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block truncate text-xs text-ink hover:underline"
      >
        {evidence.sourceUrl}
      </a>

      {/* Raw scraped snippet only — never LLM-rewritten, per the evidence-first invariant */}
      <p className="mt-2 break-words font-mono text-sm leading-relaxed text-ink">
        &ldquo;{evidence.snippet}&rdquo;
      </p>

      <div className="mt-3 flex items-center justify-end">
        <a
          href={evidence.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          View Source ↗
        </a>
      </div>
    </div>
  );
}

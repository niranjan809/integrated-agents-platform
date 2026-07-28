import { Link } from "react-router-dom";

export default function PageHeader({
  title,
  subtitle,
  action,
  back = false,
}) {
  return (
    <div className="border-b border-line/80 bg-canvas/95 px-6 py-3.5">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between">
        {/* Absolutely pinned in the left gutter so the title keeps the exact
            same position it has on the Dashboard (which has no back link) —
            the back link never shifts the title inward. */}
        {back && (
          <Link
            to="/gtm"
            aria-label="Back to dashboard"
            className="absolute right-full top-1/2 mr-4 flex -translate-y-1/2 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-ink transition hover:bg-line"
          >
            <span aria-hidden>←</span> Back
          </Link>
        )}
        {/* Color hierarchy: the accent bar carries the brand color, the
            title itself stays plain white for readability (a title colored
            the same as everything else stops reading as emphasis), and the
            subtitle gets its own distinct tone — same cyan used for
            secondary text everywhere else in the app. */}
        <div className="border-l-2 border-primary pl-3">
          <h1 className="text-base font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-ink/70">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

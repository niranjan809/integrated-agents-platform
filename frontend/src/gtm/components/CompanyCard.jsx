import { Link } from "react-router-dom";
import { statusDotClass, statusTextClass, statusLabel, scopeStyle } from "../lib/status";
import { categoryColor } from "../lib/categoryColors";

export default function CompanyCard({ company, strategies }) {
  const top3 = [...strategies].sort((a, b) => b.evidenceCount - a.evidenceCount).slice(0, 3);
  const totalEvidence = strategies.reduce((sum, s) => sum + s.evidenceCount, 0);
  const scope = company.scope ? scopeStyle(company.scope) : null;

  return (
    <Link
      to={`/gtm/company/${company.id}`}
      className="group block rounded-card border border-line bg-surface p-5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-muted hover:bg-surface hover:shadow-lg hover:shadow-black/20"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-ink">{company.name}</h3>
          {company.segment && <div className="text-xs text-ink">{company.segment}</div>}
          {/* LLM-classified from real scraped text (office/HQ mentions), same
              discipline as scope — shown for any company, Global or Regional. */}
          {company.hqCountry && <div className="mt-0.5 text-xs text-ink">📍 {company.hqCountry}</div>}
        </div>
        {/* Market reach — LLM-classified from real homepage text, not derived client-side */}
        {scope && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${scope.bg} ${scope.text}`}
          >
<scope.icon className="h-3 w-3" />
            {company.scope}
          </span>
        )}
      </div>

      {top3.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {top3.map((s) => {
            const color = categoryColor(s.categoryName);
            return (
              <span key={s.categoryName} className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                {s.categoryName}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-ink">{totalEvidence} evidence items</span>
        <span className={`flex items-center gap-1.5 font-medium ${statusTextClass(company.status)}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(company.status)}`} />
          {statusLabel(company.status)}
        </span>
      </div>

      <div className="mt-3 text-sm font-medium text-ink group-hover:underline">View GTM →</div>
    </Link>
  );
}

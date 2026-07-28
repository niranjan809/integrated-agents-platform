import { categoryColor } from "../lib/categoryColors";

export default function CategoryTabs({
  strategies,
  selected,
  onSelect,
}) {
  if (strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink">
        No GTM categories detected yet — either the analysis hasn't finished, or no evidence met the confidence
        threshold.
      </div>
    );
  }

  return (
    // Wrap onto multiple lines so every category is visible at once, instead
    // of a single horizontally-scrollable row.
    <div className="flex flex-wrap gap-2 border-b border-line pb-3">
      {strategies.map((s, i) => {
        const color = categoryColor(s.categoryName);
        const isSelected = selected === s.categoryName;
        return (
          <button
            key={s.categoryName}
            onClick={() => onSelect(s.categoryName)}
            style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}
            className={`flex shrink-0 animate-fade-in-up items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150 ease-out hover:scale-105 active:scale-95 ${
              isSelected
                ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                : "border-line text-ink hover:border-muted"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
            {s.categoryName}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                isSelected ? "bg-emerald-400/20 text-emerald-400" : `${color.bg} ${color.text}`
              }`}
            >
              {s.evidenceCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}

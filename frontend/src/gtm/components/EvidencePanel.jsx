import { categoryColor } from "../lib/categoryColors";
import EvidenceCard from "./EvidenceCard";

export default function EvidencePanel({ category, evidence }) {
  if (!category) {
    return (
      <div className="flex-1 rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink">
        Select a GTM category to view its evidence.
      </div>
    );
  }

  const color = categoryColor(category);

  return (
    <div className="min-w-0 flex-1">
      {/* Frozen while scrolling through evidence below — sticky just under the
          page's own sticky header (measured at 103px tall) so you never lose
          track of which category you're looking at. Heading color matches
          that category's own badge color, tying the two together instead of
          every category heading rendering in the same flat white. */}
      <div className="sticky top-[103px] z-10 mb-3 flex items-center justify-between border-b border-line/80 bg-canvas/95 py-2 backdrop-blur">
        <h2 className={`flex items-center gap-2 text-lg font-bold ${color.text}`}>
          <span className={`h-2 w-2 rounded-full ${color.dot}`} />
          {category}
        </h2>
        <span className="text-sm text-ink">{evidence.length} items</span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {evidence.map((e, i) => (
          <div key={e.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
            <EvidenceCard evidence={e} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Color chips for category + genuineness (palette from the Step 4 spec — applied now
// since it's just class strings). NOTE: full Tailwind class strings must appear as
// literals here so Tailwind's content scanner keeps them (no dynamic concatenation).

const CATEGORY_COLORS = {
  "AI Educator": "bg-blue-100 text-blue-800",
  "AI Tool Reviewer": "bg-purple-100 text-purple-800",
  "AI News/Aggregator": "bg-cyan-100 text-cyan-800",
  "AI Business/B2B": "bg-indigo-100 text-indigo-800",
  "AI Trend/Viral": "bg-yellow-100 text-yellow-800",
  "AI Promoter": "bg-orange-100 text-orange-800",
  "Hybrid Creator+Promoter": "bg-red-100 text-red-800",
  Uncategorized: "bg-gray-100 text-gray-800",
};

const GENUINENESS_COLORS = {
  Genuine: "bg-green-100 text-green-800",
  "Low-effort": "bg-red-100 text-red-800",
  Uncertain: "bg-amber-100 text-amber-800",
};

function Chip({ value, cls }) {
  // null / undefined → gray with italic text (per spec).
  if (!value) {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium italic text-gray-400">
        —
      </span>
    );
  }
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

export function CategoryChip({ value }) {
  return <Chip value={value} cls={CATEGORY_COLORS[value] || "bg-gray-100 text-gray-600"} />;
}

export function GenuinenessChip({ value }) {
  return <Chip value={value} cls={GENUINENESS_COLORS[value] || "bg-gray-100 text-gray-600"} />;
}

export function MethodBadge({ value }) {
  const cls = value === "rule" ? "bg-slate-200 text-slate-600" : "bg-indigo-100 text-indigo-700";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{value || "—"}</span>
  );
}

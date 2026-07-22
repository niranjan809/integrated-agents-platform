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
  "Hybrid Creator+Promoter": "u-bg-red-100 text-red-800",
  Uncategorized: "u-bg-gray-100 text-gray-800",
};

const GENUINENESS_COLORS = {
  Genuine: "bg-green-100 text-green-800",
  "Low-effort": "u-bg-red-100 text-red-800",
  Uncertain: "bg-amber-100 u-text-amber-800",
};

function Chip({ value, cls }) {
  // null / undefined → gray with u-italic text (per spec).
  if (!value) {
    return (
      <span className="u-inline-block u-whitespace-nowrap u-rounded-full u-bg-gray-100 u-px-2 u-py-0_5 u-text-xs u-font-medium u-italic u-text-gray-400">
        —
      </span>
    );
  }
  return (
    <span className={`u-inline-block u-whitespace-nowrap u-rounded-full u-px-2 u-py-0_5 u-text-xs u-font-medium ${cls}`}>
      {value}
    </span>
  );
}

export function CategoryChip({ value }) {
  return <Chip value={value} cls={CATEGORY_COLORS[value] || "u-bg-gray-100 text-gray-600"} />;
}

export function GenuinenessChip({ value }) {
  return <Chip value={value} cls={GENUINENESS_COLORS[value] || "u-bg-gray-100 text-gray-600"} />;
}

export function MethodBadge({ value }) {
  const cls = value === "rule" ? "bg-slate-200 u-text-slate-600" : "bg-indigo-100 u-text-indigo-700";
  return (
    <span className={`u-inline-block u-rounded u-px-1_5 u-py-0_5 u-text-xs u-font-medium ${cls}`}>{value || "—"}</span>
  );
}

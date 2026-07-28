// Fixed Tailwind hues, deliberately NOT tied to the brand primary/accent
// tokens — this palette's only job is 10 mutually-distinguishable category
// colors, and pinning a slot to the brand color means it silently collides
// with whichever other slot happens to be the same hue every time the
// brand theme changes (this has already happened once).
const PALETTE = [
  { bg: "bg-indigo-500/15", text: "text-indigo-300", dot: "bg-indigo-400" },
  { bg: "bg-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-500/15", text: "text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-sky-500/15", text: "text-sky-300", dot: "bg-sky-400" },
  { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", dot: "bg-fuchsia-400" },
  { bg: "bg-lime-500/15", text: "text-lime-300", dot: "bg-lime-400" },
  { bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400" },
  { bg: "bg-teal-500/15", text: "text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-violet-500/15", text: "text-violet-300", dot: "bg-violet-400" },
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Deterministic color per category name, so the same category always gets
 *  the same accent regardless of list order — used to make the dashboard and
 *  category sidebar visually distinguishable at a glance. */
export function categoryColor(name) {
  return PALETTE[hashString(name) % PALETTE.length];
}

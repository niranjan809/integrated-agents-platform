// Display formatting helpers.

// 1234 -> "1.2K", 4680000 -> "4.7M"
export function formatCount(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1e6) return +(n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return +(n / 1e3).toFixed(1) + "K";
  return String(n);
}

// fraction 0.083 -> "8.3%"
export function formatPct(rate, digits = 1) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return (rate * 100).toFixed(digits) + "%";
}

// generic number with fixed decimals, "—" for null
export function formatNum(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

// Follower/following ratio. Commas for readable large numbers; K/M abbreviation once it
// gets extreme (purchased-follower accounts can hit tens of thousands).
export function formatRatio(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1e6) return +(n / 1e6).toFixed(1) + "M";
  if (n >= 1e4) return +(n / 1e3).toFixed(1) + "K";
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  return +n.toFixed(1) + "";
}

// ISO timestamp -> relative ("3 days ago") within 90 days, absolute ("Jun 12, 2026") older.
export function formatDate(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 90) return relativeTime(iso);
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ISO timestamp -> "3 days ago"
export function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = 60000, hr = 3600000, day = 86400000;
  if (diff < 2 * min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) { const h = Math.floor(diff / hr); return h === 1 ? "1 hour ago" : `${h} hours ago`; }
  const days = Math.floor(diff / day);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

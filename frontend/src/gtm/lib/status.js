import { GlobeIcon, MapPinIcon } from "../components/icons";

export const PIPELINE_STEPS = [
  { key: "discovering", label: "Discovering" },
  { key: "scraping", label: "Scraping" },
  { key: "classifying", label: "Classifying" },
  { key: "aggregating", label: "Aggregating" },
  { key: "done", label: "Done" },
];

export function isRunningStatus(status) {
  return status === "discovering" || status === "scraping" || status === "classifying" || status === "aggregating";
}

export function statusDotClass(status) {
  if (status === "done") return "bg-emerald-400";
  if (status === "failed") return "bg-red-400";
  if (isRunningStatus(status)) return "bg-amber-400 animate-pulse";
  return "bg-muted";
}

export function statusTextClass(status) {
  if (status === "done") return "text-emerald-400";
  if (status === "failed") return "text-red-400";
  if (isRunningStatus(status)) return "text-amber-400";
  return "text-ink";
}

export function statusLabel(status) {
  if (status === "pending") return "Queued";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const SCOPE_STYLES = {
  Global: { bg: "bg-green-500/15", text: "text-green-400", icon: GlobeIcon },
  Regional: { bg: "bg-sky-500/15", text: "text-sky-300", icon: MapPinIcon },
};

export function scopeStyle(scope) {
  return SCOPE_STYLES[scope];
}

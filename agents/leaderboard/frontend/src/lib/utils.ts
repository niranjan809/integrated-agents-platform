export function timeAgo(isoString: string | null): string {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function statusDot(status: string | null): string {
  if (!status) return "⬜";
  if (status === "success") return "✅";
  if (status === "partial") return "⚠️";
  if (status === "error") return "❌";
  return "⬜";
}

export function statusColor(status: string | null): string {
  if (status === "success") return "text-green-400";
  if (status === "partial") return "text-yellow-400";
  if (status === "error") return "text-red-400";
  return "text-gray-500";
}

export function matchesDomain(
  lb: { domain: string },
  cat: { include_domains: string[]; exclude_domains: string[] }
): boolean {
  if (cat.include_domains.length > 0) return cat.include_domains.includes(lb.domain);
  return !cat.exclude_domains.includes(lb.domain);
}

export function domainColor(domain: string): string {
  const map: Record<string, string> = {
    STT: "bg-blue-950 text-blue-400",
    TTS: "bg-purple-950 text-purple-400",
    "Voice Assistants": "bg-green-950 text-green-400",
    "Realtime Voice Agents": "bg-orange-950 text-orange-400",
    General: "bg-gray-800 text-gray-400",
    LLM: "bg-purple-950 text-purple-400",
    "Coding AI": "bg-emerald-950 text-emerald-400",
    "Vision & Multimodal": "bg-violet-950 text-violet-400",
    "Image Generation": "bg-rose-950 text-rose-400",
    "Video AI": "bg-orange-950 text-orange-400",
    "Document AI": "bg-teal-950 text-teal-400",
    "AI Agents": "bg-sky-950 text-sky-400",
    Robotics: "bg-lime-950 text-lime-400",
    "AI Safety & Security": "bg-amber-950 text-amber-400",
  };
  return map[domain] || "bg-gray-800 text-gray-400";
}
